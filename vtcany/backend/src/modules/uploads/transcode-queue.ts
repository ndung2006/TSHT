// Hang doi transcode (Bước 6/8): BullMQ + Redis khi có REDIS_URL,
// fallback in-process (worker poll /internal/transcode-queue) khi không có.
export interface TranscodeJobData {
  uploadId: string;
  localPath: string;
  filename: string;
}

type QueueLike = { add: (name: string, data: TranscodeJobData, opts?: unknown) => Promise<unknown> };

let queue: QueueLike | null = null;
let tried = false;

function getQueue(): QueueLike | null {
  if (tried) return queue;
  tried = true;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // Lazy require: backend van chay duoc khi chua cai bullmq.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Queue } = require('bullmq');
    queue = new Queue('transcode', { connection: { url } });
    return queue;
  } catch {
    return null;
  }
}

/** Day job transcode vao BullMQ. Tra ve true neu da enqueue, false neu fallback poll. */
export async function enqueueTranscode(data: TranscodeJobData): Promise<boolean> {
  const q = getQueue();
  if (!q) return false;
  await q.add('transcode', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return true;
}
