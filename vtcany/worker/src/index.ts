import { join } from 'path';
import { transcodeLocal } from './transcode-local';

// Worker Phase 2 (Bước 6/8):
// - Có REDIS_URL: subscribe BullMQ queue 'transcode' (concurrency 2, retry 3
//   với exponential backoff do backend cấu hình lúc enqueue).
// - Không có: poll GET /internal/transcode-queue như Phase 1.
// Chung volume storage với backend (STORAGE_DIR giống nhau).
const BACKEND = (process.env.BACKEND_URL || 'http://localhost:3001/api/v1').replace(/\/$/, '');
const SECRET = process.env.MEDIA_WEBHOOK_SECRET || '';
const STORAGE = process.env.STORAGE_DIR || join(process.cwd(), '..', 'storage');
const REDIS_URL = process.env.REDIS_URL || '';
const POLL_MS = Number(process.env.POLL_MS || 10000);
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 2);

async function reportDone(uploadId: string): Promise<void> {
  await fetch(`${BACKEND}/internal/media-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': SECRET },
    body: JSON.stringify({ uploadId, status: 'done' }),
  });
  // eslint-disable-next-line no-console
  console.log(`[worker] done ${uploadId}`);
}

async function reportError(uploadId: string, message: string): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] error ${uploadId}:`, message);
  await fetch(`${BACKEND}/internal/media-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': SECRET },
    body: JSON.stringify({ uploadId, status: 'error' }),
  }).catch(() => undefined);
}

async function reportProgress(uploadId: string, progress: number): Promise<void> {
  await fetch(`${BACKEND}/internal/media-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-secret': SECRET },
    body: JSON.stringify({ uploadId, status: 'processing', progress }),
  });
}

async function processJob(job: { uploadId: string; localPath: string; filename: string }): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`[worker] transcode ${job.uploadId} (${job.filename})`);
  const outDir = join(STORAGE, 'hls', job.uploadId);
  // Bao tien do tiet kiem: moi khi tang >= 2% hoac moi 5s; loi bao khong duoc
  // lam hong job.
  let lastPct = -1;
  let lastAt = 0;
  const onProgress = (pct: number) => {
    const now = Date.now();
    if (pct >= 100 || pct - lastPct >= 2 || now - lastAt >= 5000) {
      lastPct = pct;
      lastAt = now;
      void reportProgress(job.uploadId, pct).catch(() => undefined);
    }
  };
  try {
    await transcodeLocal(job.localPath, outDir, onProgress);
    await reportDone(job.uploadId);
  } catch (e: any) {
    await reportError(job.uploadId, e?.message || 'transcode failed');
    throw e; // để BullMQ retry theo attempts đã cấu hình
  }
}

async function startBullmq(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Worker } = require('bullmq');
  const worker = new Worker(
    'transcode',
    (j: any) => processJob(j.data as { uploadId: string; localPath: string; filename: string }),
    { connection: { url: REDIS_URL }, concurrency: CONCURRENCY },
  );
  worker.on('failed', (j: any, err: Error) => {
    // eslint-disable-next-line no-console
    console.log(`[worker] job ${j?.id} failed after retries:`, err?.message);
  });
  // eslint-disable-next-line no-console
  console.log(`[worker] bullmq subscribed 'transcode' (concurrency=${CONCURRENCY})`);
}

// ---- Fallback Phase 1: poll ----
const busy = new Set<string>();

async function tick() {
  let jobs: any[];
  try {
    const res = await fetch(`${BACKEND}/internal/transcode-queue`, {
      headers: { 'x-webhook-secret': SECRET },
    });
    if (!res.ok) throw new Error(`queue ${res.status}`);
    jobs = await res.json();
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.log('[worker] queue poll failed:', e?.message);
    return;
  }
  for (const job of jobs) {
    if (busy.has(job.id)) continue;
    busy.add(job.id);
    try {
      await processJob({ uploadId: job.id, localPath: job.localPath, filename: job.filename });
    } catch {
      // đã reportError trong processJob
    } finally {
      busy.delete(job.id);
    }
  }
}

if (REDIS_URL) {
  startBullmq().catch((e) => {
    // eslint-disable-next-line no-console
    console.log('[worker] bullmq start failed, fallback to poll:', e?.message);
    void tick();
    setInterval(tick, POLL_MS);
  });
} else {
  // eslint-disable-next-line no-console
  console.log(`[worker] polling ${BACKEND} every ${POLL_MS}ms, storage=${STORAGE}`);
  void tick();
  setInterval(tick, POLL_MS);
}
