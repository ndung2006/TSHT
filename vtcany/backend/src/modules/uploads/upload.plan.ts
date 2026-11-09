export type UploadStatus = 'pending' | 'uploaded' | 'processing' | 'done' | 'error';

/**
 * Chuan hoa trang thai upload doc tu DB/in-memory ve enum UploadStatus.
 * 'failed' la gia tri NGOAI enum, do sua tay truc tiep trong DB ngay
 * 09/11 (ban ghi upl-1793694716358, luc do job don chunk chua co nen phai
 * huy tay): neu de nguyen, listUploads() map transcode='pending' (hien
 * nham la dang tai), bo loc files/all + dem D2 khong nhan (chi liet ke 5
 * gia tri chuan). Chuan hoa o diem doc de ban ghi cu hien dung la loi ma
 * khong can sua lai ban ghi; ghi moi chi dung 'error'.
 */
export function canonicalUploadStatus(status: string): string {
  return status === 'failed' ? 'error' : status;
}

export interface UploadRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  /** Loai file suy ra tu MIME + duoi file (video|audio|image|pdf|subtitle|other);
   *  ghi khi init/complete, dung cho widget D3. Null = chua phan loai. */
  fileType?: string | null;
  videoId?: string;
  status: UploadStatus;
  progress?: number; // % tien trinh transcode do worker bao ve (in-memory, chi khi processing)
  chunks: number;
  createdAt: number;
  /** Tong thoi luong giay do worker probe (null = chua biet; persist xuong media_assets). */
  durationSec?: number | null;
  /** So lan worker claim job (tang o webhook 'attempt'; persist xuong media_assets). */
  attempts: number;
  /** Ms epoch: job chi vao queue lai sau thoi diem nay (backoff; persist xuong media_assets). */
  nextRetryAt?: number | null;
  /** Ly do loi/dead-letter hien thi (persist xuong media_assets.error). */
  error?: string;
}

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB/chunk theo blueprint
export const MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024; // 10GB

export function chunkCount(sizeBytes: number): number {
  return Math.max(1, Math.ceil(sizeBytes / CHUNK_SIZE));
}

// Pure - co test bao ve, khong doi khi thay S3/MinIO that.
export function planUpload(filename: string, sizeBytes: number, contentType: string, videoId?: string): UploadRecord {
  if (!filename) throw new Error('filename required');
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) throw new Error('invalid size');
  if (sizeBytes > MAX_FILE_BYTES) throw new Error('file too large');
  return {
    id: `upl-${Date.now()}`,
    filename,
    sizeBytes,
    contentType: contentType || 'video/mp4',
    fileType: inferFileType(filename, contentType),
    videoId,
    status: 'pending',
    chunks: chunkCount(sizeBytes),
    createdAt: Date.now(),
    attempts: 0,
  };
}

// --- Suy loai file tu MIME + duoi file (D3) ---
// Dung cho: ghi fileType khi init/complete (+ persist) va chay bu
// fileType NULL. Quy tac:
//   - MIME co prefix nhan dang duoc -> loai do (video/*, audio/*,
//     image/*, application/pdf, text/vtt).
//   - MIME thieu/chung chung (application/octet-stream, rong) -> suy
//     tu duoi file.
//   - Hai nguon mau thuan -> UU TIEN duoi file (vd MIME mac dinh
//     'video/mp4' nhung duoi .mp3 -> audio).
//   - Ca hai khong nhan ra -> 'other'.
const EXT_TO_TYPE: Record<string, string> = {
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  m4v: 'video', mpg: 'video', mpeg: 'video', '3gp': 'video',
  mp3: 'audio', wav: 'audio', aac: 'audio', ogg: 'audio', oga: 'audio',
  m4a: 'audio', flac: 'audio', wma: 'audio',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image',
  avif: 'image', bmp: 'image', svg: 'image',
  pdf: 'pdf',
  vtt: 'subtitle', srt: 'subtitle',
};

function typeFromMime(contentType: string | null | undefined): string | null {
  const mime = (contentType || '').toLowerCase().split(';')[0].trim();
  if (!mime || mime === 'application/octet-stream') return null;
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/vtt') return 'subtitle';
  return null;
}

export function inferFileType(filename: string | null | undefined, contentType: string | null | undefined): string {
  const name = String(filename || '');
  const ext = name.includes('.') ? (name.split('.').pop() || '').toLowerCase() : '';
  const extType = ext ? EXT_TO_TYPE[ext] || null : null;
  if (extType) return extType; // duoi file nhan dang duoc -> uu tien
  return typeFromMime(contentType) || 'other';
}

// --- Upload anh (thumbnail/poster/banner) ---
// Chi nhan dinh dang anh pho bien; SVG bi loai vi co the chua script.
// Anh khong qua transcode: luu thang storage/images, phuc vu cong khai /images/*.
export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

export interface ImageRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  fileUrl: string; // /images/<id>.<ext>
  createdAt: number;
}

export function planImage(filename: string, contentType: string): { id: string; ext: string } {
  if (!filename) throw new Error('filename required');
  const ext = IMAGE_TYPES[(contentType || '').toLowerCase()];
  if (!ext) throw new Error('unsupported image type');
  const rand = Math.random().toString(36).slice(2, 8);
  return { id: `img-${Date.now().toString(36)}-${rand}`, ext };
}
