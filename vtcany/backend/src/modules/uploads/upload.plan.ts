export type UploadStatus = 'pending' | 'uploaded' | 'processing' | 'done' | 'error';

export interface UploadRecord {
  id: string;
  filename: string;
  sizeBytes: number;
  contentType: string;
  videoId?: string;
  status: UploadStatus;
  progress?: number; // % tien trinh transcode do worker bao ve (in-memory, chi khi processing)
  chunks: number;
  createdAt: number;
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
    videoId,
    status: 'pending',
    chunks: chunkCount(sizeBytes),
    createdAt: Date.now(),
  };
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
