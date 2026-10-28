import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { appendFileSync, createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ImageRecord, MAX_IMAGE_BYTES, UploadRecord, UploadStatus, chunkCount, planImage, planUpload } from './upload.plan';
import { chunkExists, finalPath, rawDir, storageRootDefault, writeChunk } from './local-store';
import { enqueueTranscode } from './transcode-queue';
import { PLAYLIST_TTL_SEC, SEGMENT_TTL_SEC, isValidUploadId, signMedia } from './media-sign';

export function existsLocalUpload(root: string, uploadId: string): boolean {
  return existsSync(rawDir(root, uploadId));
}

// Ban ghi upload duoc persist xuong bang media_assets (Prisma) theo kieu
// write-through: Map trong RAM la cache doc nhanh (API giu nguyen dang sync),
// moi thay doi trang thai deu upsert xuong Postgres de restart khong mat du lieu.
// Khong co DATABASE_URL (dev/test) -> chay in-memory nhu cu.
@Injectable()
export class UploadsService implements OnModuleInit {
  private readonly logger = new Logger(UploadsService.name);
  private records = new Map<string, UploadRecord>();
  private images: ImageRecord[] = [];
  private videoHls = new Map<string, { uploadId: string; hlsPath: string }>();
  private s3: S3Client | null = null;
  private bucket: string;

  constructor(
    private config: ConfigService,
    @Optional() private prisma?: PrismaService,
  ) {
    const endpoint = this.config.get<string>('S3_ENDPOINT', '');
    const region = this.config.get<string>('S3_REGION', 'ap-southeast-1');
    const accessKey = this.config.get<string>('S3_ACCESS_KEY', '');
    const secretKey = this.config.get<string>('S3_SECRET_KEY', '');
    this.bucket = this.config.get<string>('S3_BUCKET', 'vtc-any-raw');
    if (endpoint && accessKey && secretKey) {
      this.s3 = new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
      });
    }
  }

  // Nap lai ban ghi tu Postgres khi khoi dong (restart khong mat thu vien Tap tin).
  async onModuleInit(): Promise<void> {
    if (!this.prisma || !process.env.DATABASE_URL) return;
    try {
      const rows = await this.prisma.mediaAsset.findMany({ orderBy: { createdAt: 'asc' } });
      for (const r of rows) {
        if (r.fileType === 'image') {
          this.images.push({
            id: r.id,
            filename: r.filename || r.id,
            sizeBytes: Number(r.sizeBytes || 0),
            contentType: r.contentType || 'image/jpeg',
            fileUrl: r.fileUrl || '',
            createdAt: r.createdAt.getTime(),
          });
          continue;
        }
        const rec: UploadRecord = {
          id: r.id,
          filename: r.filename || r.id,
          sizeBytes: Number(r.sizeBytes || 0),
          contentType: r.contentType || 'video/mp4',
          videoId: r.videoId || undefined,
          status: (r.status as UploadStatus) || 'pending',
          chunks: chunkCount(Number(r.sizeBytes || 0)),
          createdAt: r.createdAt.getTime(),
        };
        this.records.set(rec.id, rec);
        if (rec.status === 'done' && rec.videoId) {
          this.videoHls.set(rec.videoId, { uploadId: rec.id, hlsPath: `/media/${rec.id}/master.m3u8` });
        }
      }
      if (rows.length) this.logger.log(`Da nap ${rows.length} media_assets tu Postgres.`);
    } catch (e) {
      this.logger.warn(`Khong nap duoc media_assets: ${(e as Error).message}`);
    }
  }

  // Ghi xuong Postgres (fire-and-forget, loi chi log - khong chan luong upload).
  private persist(rec: UploadRecord): void {
    if (!this.prisma || !process.env.DATABASE_URL) return;
    const data = {
      filename: rec.filename,
      sizeBytes: BigInt(Math.trunc(rec.sizeBytes)),
      contentType: rec.contentType,
      status: rec.status,
      videoId: rec.videoId || null,
    };
    void this.prisma.mediaAsset
      .upsert({ where: { id: rec.id }, create: { id: rec.id, ...data }, update: data })
      .catch((e) => this.logger.warn(`persist media_asset ${rec.id} loi: ${(e as Error).message}`));
  }

  async init(filename: string, sizeBytes: number, contentType: string, videoId?: string) {
    const rec = planUpload(filename, sizeBytes, contentType, videoId);
    this.records.set(rec.id, rec);
    this.persist(rec);
    // Phase 1: local disk. Co S3_ENDPOINT: ky PUT that (duong dan len S3 sau).
    if (this.s3) {
      const key = `raw/${rec.id}/${filename}`;
      const url = await getSignedUrl(
        this.s3,
        new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: rec.contentType }),
        { expiresIn: 3600 },
      );
      return { ...rec, key, method: 'single-put' as const, url };
    }
    const root = this.storageRoot();
    mkdirSync(rawDir(root, rec.id), { recursive: true });
    return {
      ...rec,
      method: 'local-chunks' as const,
      // CMS PUT nhi phan tung chunk (application/octet-stream), khong qua JSON API.
      chunkUrlTemplate: `/api/v1/storage-local/raw/${rec.id}/chunks/{n}`,
      finalizeUrl: `/api/v1/uploads/${rec.id}/complete`,
    };
  }

  storageRoot(): string {
    return this.config.get<string>('STORAGE_DIR', '') || storageRootDefault();
  }

  async putChunk(id: string, n: number, stream: Readable): Promise<{ chunk: number; received: boolean }> {
    this.get(id); // 404 neu khong ton tai
    if (!Number.isInteger(n) || n < 0) throw new Error('invalid chunk index');
    await writeChunk(this.storageRoot(), id, n, stream);
    return { chunk: n, received: true };
  }

  // Gop chunk -> file raw duy nhat, san sang worker doc tai cho.
  finalizeLocal(id: string): UploadRecord & { localPath: string } {
    const rec = this.get(id);
    if (rec.status !== 'pending') throw new Error(`invalid transition ${rec.status} -> uploaded`);
    const root = this.storageRoot();
    for (let n = 0; n < rec.chunks; n++) {
      if (!chunkExists(root, id, n)) throw new Error(`missing chunk ${n}/${rec.chunks}`);
    }
    void this.mergeChunks(root, id, rec.filename);
    rec.status = 'uploaded';
    this.persist(rec);
    return { ...rec, localPath: finalPath(root, id, rec.filename) };
  }

  get(id: string): UploadRecord {
    const rec = this.records.get(id);
    if (!rec) throw new Error('upload not found');
    return rec;
  }

  // Danh sach upload cho thu vien "Tap tin" cua CMS (kem trang thai transcode).
  listUploads(): (UploadRecord & { transcode: string; posterUrl: string })[] {
    return [...this.records.values()].map((rec) => {
      const done = rec.status === 'done' || (!!rec.videoId && this.videoHls.has(rec.videoId));
      return {
        ...rec,
        transcode: done ? 'done' : rec.status === 'error' ? 'error' : rec.status === 'uploaded' || rec.status === 'processing' ? 'processing' : 'pending',
        posterUrl: this.posterUrlFor(rec.id),
      };
    });
  }

  // --- Anh thumbnail/poster/banner: luu thang storage/images, khong transcode ---
  imagesDir(): string {
    return join(this.storageRoot(), 'images');
  }

  private publicBase(): string {
    return (this.config.get<string>('VOD_PUBLIC_BASE_URL', '') || '').replace(/\/$/, '');
  }

  imageUrl(rec: ImageRecord): string {
    return (this.publicBase() || '') + rec.fileUrl;
  }

  /** Poster tu dong do worker cat khi transcode: images/thumb-<uploadId>.jpg. */
  posterUrlFor(uploadId: string): string {
    if (!uploadId || !isValidUploadId(uploadId)) return '';
    if (!existsSync(join(this.imagesDir(), `thumb-${uploadId}.jpg`))) return '';
    return `${this.publicBase()}/images/thumb-${uploadId}.jpg`;
  }

  listImages(): (ImageRecord & { url: string })[] {
    return [...this.images]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ ...r, url: this.imageUrl(r) }));
  }

  /** Xoa ban ghi khoi bo nho trong tien trinh (phuc vu xoa thu vien).
   * Bat buoc: list() cua MediaLibrary merge DB + in-memory, ban in-memory
   * thang the — neu chi xoa row DB thi ban ghi se hien lai cho toi khi
   * backend restart. Video: xoa ca records map + videoHls lien quan. */
  dropMedia(id: string): void {
    this.images = this.images.filter((r) => r.id !== id);
    this.records.delete(id);
    for (const [videoId, v] of this.videoHls.entries()) {
      if (v.uploadId === id) this.videoHls.delete(videoId);
    }
  }

  async saveImage(stream: Readable, filename: string, contentType: string): Promise<ImageRecord & { url: string }> {
    const { id, ext } = planImage(filename, contentType);
    const dir = this.imagesDir();
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.${ext}`);
    let bytes = 0;
    try {
      const out = createWriteStream(filePath);
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        bytes += (chunk as Buffer).length;
        if (bytes > MAX_IMAGE_BYTES) throw new Error('image too large (max 10MB)');
        out.write(chunk);
      }
      await new Promise<void>((resolve, reject) => {
        out.end(() => resolve());
        out.on('error', reject);
      });
    } catch (e) {
      try { unlinkSync(filePath); } catch { /* chua kip tao file */ }
      throw e;
    }
    const rec: ImageRecord = {
      id,
      filename,
      sizeBytes: bytes,
      contentType: (contentType || '').toLowerCase(),
      fileUrl: `/images/${id}.${ext}`,
      createdAt: Date.now(),
    };
    this.images.push(rec);
    if (this.prisma && process.env.DATABASE_URL) {
      void this.prisma.mediaAsset
        .upsert({
          where: { id },
          create: { id, filename, sizeBytes: BigInt(bytes), contentType: rec.contentType, status: 'done', fileType: 'image', fileUrl: rec.fileUrl },
          update: { filename, sizeBytes: BigInt(bytes), contentType: rec.contentType, status: 'done', fileType: 'image', fileUrl: rec.fileUrl },
        })
        .catch((err) => this.logger.warn(`persist image ${id} loi: ${(err as Error).message}`));
    }
    return { ...rec, url: this.imageUrl(rec) };
  }

  // Upload file PDF goc cua mot so bao in: PUT nhi phan, luu thang vao
  // STORAGE_DIR/documents, KHONG phuc vu cong khai qua static assets — file
  // chi duoc tai qua route admin co JWT (EpaperController.downloadPdf).
  // Chi nhan application/pdf, toi da 100MB. Tra ve pdfPath tuong doi de CMS
  // gan vao so bao khi tao/cap nhat (khong phai URL cong khai).
  async saveDocument(stream: Readable, filename: string, contentType: string) {
    if ((contentType || '').toLowerCase().split(';')[0].trim() !== 'application/pdf') {
      throw new Error('unsupported document type (chi nhan application/pdf)');
    }
    if (!filename) throw new Error('filename required');
    const MAX_PDF_BYTES = 100 * 1024 * 1024;
    const rand = Math.random().toString(36).slice(2, 8);
    const id = `doc-${Date.now().toString(36)}-${rand}`;
    const dir = join(this.storageRoot(), 'documents');
    mkdirSync(dir, { recursive: true });
    const filePath = join(dir, `${id}.pdf`);
    let bytes = 0;
    try {
      const out = createWriteStream(filePath);
      for await (const chunk of stream as AsyncIterable<Buffer>) {
        bytes += (chunk as Buffer).length;
        if (bytes > MAX_PDF_BYTES) throw new Error('document too large (max 100MB)');
        out.write(chunk);
      }
      await new Promise<void>((resolve, reject) => {
        out.end(() => resolve());
        out.on('error', reject);
      });
    } catch (e) {
      try { unlinkSync(filePath); } catch { /* chua kip tao file */ }
      throw e;
    }
    // Dem so trang bang pdfinfo (poppler, cai san trong Dockerfile) de CMS
    // tu dien so trang khi chon PDF. Dem loi thi tra null, KHONG fail
    // upload — bien tap van nhap tay duoc nhu cu.
    let pageCount: number | null = null;
    try {
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync('pdfinfo', [filePath], { timeout: 30000 });
      const m = /^Pages:\s+(\d+)\s*$/m.exec(stdout || '');
      if (m) pageCount = Number(m[1]);
    } catch (e: any) {
      this.logger.warn(`pdfinfo dem trang that bai cho ${id}.pdf: ${e?.message || e}`);
    }
    return { id, filename, sizeBytes: bytes, contentType: 'application/pdf', pdfPath: `documents/${id}.pdf`, pageCount };
  }

  // Browser bao upload xong (hoac storage webhook) -> chuyen Uploaded, san sang worker.
  // Local: gop chunk truoc. S3: file da nam tren bucket.
  // Day job vao BullMQ (neu co REDIS_URL); luon giu ban ghi processing de
  // worker poll fallback van thay job khi khong co Redis.
  complete(id: string): UploadRecord & { localPath?: string } {
    const rec = this.get(id);
    const root = this.storageRoot();
    if (existsLocalUpload(root, id)) {
      const fin = this.finalizeLocal(id);
      this.markProcessing(id);
      const localPath = finalPath(root, id, rec.filename);
      void enqueueTranscode({ uploadId: id, localPath, filename: rec.filename }).catch((e) =>
        console.log('[uploads] bullmq enqueue failed, poll fallback:', e?.message),
      );
      return { ...fin, status: 'processing' as const };
    }
    this.markUploaded(id);
    this.markProcessing(id);
    return { ...rec, status: 'processing' as const };
  }

  markUploaded(id: string): UploadRecord {
    return this.transition(id, 'pending', 'uploaded');
  }

  markProcessing(id: string): UploadRecord {
    return this.transition(id, 'uploaded', 'processing');
  }

  // Worker bao % tien trinh transcode qua webhook. Chi luu in-memory (khong
  // persist DB): gia tri tam thoi, restart thi ve 0 va worker bao lai ngay.
  setProgress(id: string, progress: number): UploadRecord {
    const rec = this.get(id);
    if (rec.status === 'processing' || rec.status === 'uploaded') {
      const pct = Number.isFinite(progress) ? Math.max(0, Math.min(100, Math.round(progress))) : 0;
      if (pct !== rec.progress) rec.progress = pct;
    }
    return rec;
  }

  markDone(id: string): UploadRecord {
    return this.transition(id, 'processing', 'done');
  }

  markError(id: string): UploadRecord {
    const rec = this.get(id);
    rec.status = 'error';
    this.persist(rec);
    return rec;
  }

  // Worker poll job dang cho transcode (kem localPath de worker doc tai cho).
  pendingTranscode(): Array<UploadRecord & { localPath: string }> {
    const root = this.storageRoot();
    return [...this.records.values()]
      .filter((r) => r.status === 'processing')
      .map((r) => ({ ...r, localPath: finalPath(root, r.id, r.filename) }));
  }

  // Webhook done: map video -> HLS path de /videos/:id/play tra link phat.
  // Quy uoc chung voi worker: storage/hls/<uploadId>/master.m3u8 -> /media/<uploadId>/master.m3u8
  setVideoReady(uploadId: string): { hlsPath: string } {
    const rec = this.get(uploadId);
    const hlsPath = `/media/${uploadId}/master.m3u8`;
    if (rec.videoId) this.videoHls.set(rec.videoId, { uploadId, hlsPath });
    return { hlsPath };
  }

  private signedPlayUrl(uploadId: string): string {
    const exp = Math.floor(Date.now() / 1000) + PLAYLIST_TTL_SEC;
    const sig = signMedia(uploadId, exp);
    const base = (this.config.get<string>('VOD_PUBLIC_BASE_URL', '') || '').replace(/\/$/, '');
    const path = `/api/v1/media/${uploadId}/playlist.m3u8?exp=${exp}&sig=${sig}`;
    return base ? base + path : path;
  }

  videoPlay(videoId: string): { hls_path: string; poster: string } {
    const m = this.videoHls.get(videoId);
    if (!m) throw new Error('vod not ready');
    // URL ky HMAC han 15 phut - player khong can Bearer token.
    // VOD_PUBLIC_BASE_URL: domain rieng cho VOD (vd https://vod.vtcrd.top).
    return { hls_path: this.signedPlayUrl(m.uploadId), poster: this.posterUrlFor(m.uploadId) };
  }

  /** HLS da transcode xong chua (file master.m3u8 ton tai tren storage). */
  isReady(uploadId: string): boolean {
    if (!isValidUploadId(uploadId)) return false;
    return existsSync(join(this.storageRoot(), 'hls', uploadId, 'master.m3u8'));
  }

  /** Phat theo uploadId (catalog gan videoFileId = uploadId). */
  playByUploadId(uploadId: string): { hls_path: string; poster: string } {
    if (!this.isReady(uploadId)) throw new Error('vod not ready');
    return { hls_path: this.signedPlayUrl(uploadId), poster: this.posterUrlFor(uploadId) };
  }

  /** Doc master.m3u8 va viet lai URL thanh URL ky rieng (han 8h).
   *  Multibitrate: dong variant (*.m3u8) -> endpoint /v/ de rewrite tiep segment
   *  ben trong; dong segment (.ts) -> URL static /media co ky nhu cu. */
  signedPlaylist(uploadId: string, baseUrl: string): string {
    if (!isValidUploadId(uploadId)) throw new Error('invalid upload id');
    const playlistPath = join(this.storageRoot(), 'hls', uploadId, 'master.m3u8');
    if (!existsSync(playlistPath)) throw new Error('playlist not found');
    const segExp = Math.floor(Date.now() / 1000) + SEGMENT_TTL_SEC;
    const segSig = signMedia(uploadId, segExp);
    // Uu tien base cong khai (https) thay vi proto tu request: sau proxy,
    // req.protocol thuong la http -> segment http bi trinh duyet chan
    // mixed-content tren trang https (player dung 0:00).
    const base = this.publicBase() || baseUrl;
    return readFileSync(playlistPath, 'utf8')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const seg = t.split('/').pop() || '';
        if (!/^[A-Za-z0-9_.-]+$/.test(seg)) return line; // giu nguyen dong la
        if (/\.m3u8$/i.test(seg)) {
          // variant playlist: di qua controller de rewrite segment ben trong
          return `${base}/api/v1/media/${uploadId}/v/${seg}?exp=${segExp}&sig=${segSig}`;
        }
        return `${base}/media/${uploadId}/${seg}?exp=${segExp}&sig=${segSig}`;
      })
      .join('\n');
  }

  /** Doc variant playlist (360p.m3u8, ...) va viet lai segment thanh URL ky rieng. */
  signedVariantPlaylist(uploadId: string, variant: string, baseUrl: string): string {
    if (!isValidUploadId(uploadId)) throw new Error('invalid upload id');
    if (!/^[A-Za-z0-9_.-]+\.m3u8$/i.test(variant)) throw new Error('invalid variant');
    const playlistPath = join(this.storageRoot(), 'hls', uploadId, variant);
    if (!existsSync(playlistPath)) throw new Error('playlist not found');
    const segExp = Math.floor(Date.now() / 1000) + SEGMENT_TTL_SEC;
    const segSig = signMedia(uploadId, segExp);
    const base = this.publicBase() || baseUrl;
    return readFileSync(playlistPath, 'utf8')
      .split('\n')
      .map((line) => {
        const t = line.trim();
        if (!t || t.startsWith('#')) return line;
        const seg = t.split('/').pop() || '';
        if (!/^[A-Za-z0-9_.-]+$/.test(seg) || /\.m3u8$/i.test(seg)) return line;
        return `${base}/media/${uploadId}/${seg}?exp=${segExp}&sig=${segSig}`;
      })
      .join('\n');
  }

  checkWebhookSecret(provided: string): boolean {
    const expected = this.config.get<string>('MEDIA_WEBHOOK_SECRET', '');
    if (!expected) return false;
    return provided === expected;
  }

  private mergeChunks(root: string, uploadId: string, filename: string): string {
    const out = finalPath(root, uploadId, filename);
    writeFileSync(out, Buffer.alloc(0));
    const rec = this.get(uploadId);
    for (let n = 0; n < rec.chunks; n++) {
      const part = join(rawDir(root, uploadId), `chunk-${n}`);
      appendFileSync(out, readFileSync(part));
      unlinkSync(part);
    }
    return out;
  }

  private transition(id: string, from: UploadStatus, to: UploadStatus): UploadRecord {
    const rec = this.get(id);
    if (rec.status !== from) throw new Error(`invalid transition ${rec.status} -> ${to}`);
    rec.status = to;
    this.persist(rec);
    return rec;
  }
}
