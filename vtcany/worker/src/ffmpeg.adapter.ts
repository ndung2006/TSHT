export interface TranscodeResult {
  externalJobId: string;
  simulated: boolean;
}

// Adapter ve cum FFmpeg cu. Co FFMPEG_API_URL: POST job that.
// Chua co: gia lap de dev/test tiep ma khong doi interface.
export async function transcode(sourceUrl: string, presets: string[]): Promise<TranscodeResult> {
  const base = (process.env.FFMPEG_API_URL || '').replace(/\/$/, '');
  if (!base) {
    return { externalJobId: `sim-${Date.now()}`, simulated: true };
  }
  const res = await fetch(`${base}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceUrl, presets }),
  });
  if (!res.ok) throw new Error(`ffmpeg api ${res.status}`);
  const data: any = await res.json();
  return { externalJobId: String(data.jobId || data.id || 'unknown'), simulated: false };
}
