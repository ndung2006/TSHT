import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { unlinkSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from './uploads.service';
import {
  MediaItem, mapDbRow, mapMemoryImage, mapMemoryVideo, mergeAndPage, normalizeMediaQuery,
} from './media-library-map';

// Thu vien media thong nhat (Dot 1a): liet ke anh/video/audio tu bang
// media_assets + danh sach in-memory cua UploadsService (anh/video vua
// upload). Tai su dung model MediaAsset san co, khong tao bang moi.
// KHONG tang gioi han JSON 256kb: endpoint chi la GET list, khong nhan body.
@Injectable()
export class MediaLibraryService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  private publicBase(): string {
    return (this.config.get<string>('VOD_PUBLIC_BASE_URL', '') || '').replace(/\/$/, '');
  }

  async list(query: { kind?: string; q?: string; page?: unknown; limit?: unknown }) {
    let q;
    try {
      q = normalizeMediaQuery(query);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'truy van thu vien khong hop le');
    }
    const base = this.publicBase();
    const where: any = { fileType: q.kind ? q.kind : { in: ['image', 'video', 'audio'] } };
    if (q.q) where.filename = { contains: q.q, mode: 'insensitive' };
    const dbRows = await this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' } });
    const dbItems: MediaItem[] = [];
    for (const row of dbRows) {
      const poster = row.fileType === 'video' ? this.uploads.posterUrlFor(row.id) : '';
      const item = mapDbRow(row, base, poster);
      if (item) dbItems.push(item);
    }
    // In-memory: anh vua tai (listImages) + video dang transcode (listUploads).
    // Loc theo q o tang merge (DB da loc san, merge loc lai cho dong nhat).
    const memoryItems: MediaItem[] = [
      ...this.uploads.listImages().map(mapMemoryImage),
      ...this.uploads.listUploads().map(mapMemoryVideo),
    ];
    return mergeAndPage(dbItems, memoryItems, q);
  }

  // Xoa 1 ban ghi thu vien theo id (id = MediaItem.id = MediaAsset.id, uuid
  // hoac img-... cho anh — khong bao gio dinh danh theo ten hien thi vi ten
  // trung nhau giua cac ban ghi). Khong tim thay trong DB -> 404 (ban ghi
  // chi co trong bo nho in-memory, chua kip persist, cung roi vao day).
  // Thu tu: purge in-memory truoc roi xoa row DB, sau do moi xoa file vat ly
  // (best-effort): file da mat (ban ghi mo coi) thi bo qua loi, row van xoa
  // thanh cong. Chi xoa file trong storage/images theo basename cua fileUrl;
  // video (fileUrl rong, HLS o storage/hls/<id>/) chi xoa row + bo nho, khong
  // don dep thu muc HLS trong dot nay. Khong co khoa ngoai nao tro toi
  // MediaAsset (anh/video chi duoc tham chieu bang chuoi URL trong noi dung),
  // nen xoa row khong vi pham toan ven DB.
  async remove(id: string) {
    const row = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('khong tim thay tap tin trong thu vien');
    this.uploads.dropMedia(id);
    await this.prisma.mediaAsset.delete({ where: { id } });
    if (row.fileUrl && row.fileUrl.startsWith('/images/')) {
      const name = row.fileUrl.split('/').pop() || '';
      if (name && !name.includes('/') && !name.includes('\\')) {
        try { unlinkSync(join(this.uploads.imagesDir(), name)); } catch { /* file da mat: bo qua */ }
      }
    }
    return { ok: true };
  }
}
