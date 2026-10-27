import { createWriteStream, existsSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { Readable } from 'stream';

// Luu local Phase 1: storage/raw/<id>/chunk-<n>, merge thanh storage/raw/<id>.mp4.
// Len MinIO/S3: thay 3 ham nay bang S3 multipart, giu nguyen init/complete API.
export function rawDir(root: string, uploadId: string): string {
  return join(root, 'raw', uploadId);
}

export function finalPath(root: string, uploadId: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(root, 'raw', `${uploadId}-${safe}`);
}

export async function writeChunk(root: string, uploadId: string, n: number, stream: Readable): Promise<string> {
  const dir = rawDir(root, uploadId);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `chunk-${n}`);
  await new Promise<void>((resolve, reject) => {
    const ws = createWriteStream(path);
    stream.pipe(ws);
    ws.on('finish', () => resolve());
    ws.on('error', reject);
    stream.on('error', reject);
  });
  return path;
}

export function chunkExists(root: string, uploadId: string, n: number): boolean {
  return existsSync(join(rawDir(root, uploadId), `chunk-${n}`));
}

export function storageRootDefault(): string {
  // runtime: backend/dist/modules/uploads -> VTC ANY/storage (4 cap)
  return join(__dirname, '..', '..', '..', '..', 'storage');
}
