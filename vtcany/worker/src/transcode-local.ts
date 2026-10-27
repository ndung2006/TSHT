import { execFile, spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';

function hasFfmpeg(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('ffmpeg', ['-version'], (err) => resolve(!err));
  });
}

function runCmd(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) =>
      err ? reject(err) : resolve(String(stdout)),
    );
  });
}

async function probeDuration(rawPath: string): Promise<number> {
  try {
    const out = await runCmd('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', rawPath,
    ]);
    const d = parseFloat(out.trim());
    return Number.isFinite(d) && d > 0 ? d : 0;
  } catch {
    return 0;
  }
}

// Chay ffmpeg kem theo doi tien do: -progress pipe:2 day cac block key=value
// ra stderr; doi out_time_ms voi tong thoi luong -> % hoan thanh (toi da 99
// khi dang chay, 100 khi xong). Khong probe duoc thoi luong thi khong bao %.
function runFfmpeg(args: string[], durationSec: number, onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', ['-nostats', '-progress', 'pipe:2', ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let buf = '';
    let lastPct = -1;
    child.stderr.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!onProgress || durationSec <= 0) continue;
        const m = /^out_time_ms=(\d+)$/.exec(line);
        if (m) {
          const pct = Math.min(99, Math.floor((Number(m[1]) / 1e6 / durationSec) * 100));
          if (pct > lastPct) {
            lastPct = pct;
            onProgress(pct);
          }
        }
      }
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`ffmpeg exit ${code}`));
      }
    });
  });
}

// Cat 1 khung hinh lam poster/thumbnail tu dong. Thu o giay 1, video qua
// ngan thi lui ve khung dau. Loi poster khong duoc lam hong job transcode.
async function extractPoster(rawPath: string, posterPath: string): Promise<void> {
  const args = (ss: string) => ['-y', '-ss', ss, '-i', rawPath, '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', posterPath];
  try {
    await runCmd('ffmpeg', args('1'));
  } catch {
    await runCmd('ffmpeg', args('0'));
  }
}

interface Rendition {
  name: string;
  height: number;
  width: number;
  vBitrate: string;
  maxRate: string;
  bufSize: string;
  aBitrate: string;
  bandwidth: number; // BANDWIDTH khai bao trong master (video+audio+overhead)
}

// 3 muc giong VTC Play: 360p / 480p / 720p (+ che do Auto do player tu chuyen).
const RENDITIONS: Rendition[] = [
  { name: '360p', height: 360, width: 640, vBitrate: '800k', maxRate: '856k', bufSize: '1200k', aBitrate: '64k', bandwidth: 950000 },
  { name: '480p', height: 480, width: 854, vBitrate: '1400k', maxRate: '1498k', bufSize: '2100k', aBitrate: '96k', bandwidth: 1600000 },
  { name: '720p', height: 720, width: 1280, vBitrate: '2800k', maxRate: '2996k', bufSize: '4200k', aBitrate: '128k', bandwidth: 3100000 },
];

async function probeHeight(rawPath: string): Promise<number> {
  try {
    const out = await runCmd('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=height', '-of', 'csv=p=0', rawPath,
    ]);
    return parseInt(out.trim(), 10) || 0;
  } catch {
    return 0;
  }
}

function writeMaster(hlsDir: string, renditions: Rendition[]): string {
  const lines = ['#EXTM3U'];
  for (const r of renditions) {
    lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${r.bandwidth},RESOLUTION=${r.width}x${r.height}`);
    lines.push(`${r.name}.m3u8`);
  }
  const p = join(hlsDir, 'master.m3u8');
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

// Transcode multibitrate: doc file raw tai cho, xuat HLS vao storage/hls/<jobId>/
// — 1 master.m3u8 + 1 variant playlist cho moi muc chat luong.
// Khong upscale: chi tao cac muc <= chieu cao nguon. Nguon nho hon 360p
// (hoac khong probe duoc) -> fallback 1 luong nhu cu.
export async function transcodeLocal(rawPath: string, hlsDir: string, onProgress?: (pct: number) => void): Promise<{ simulated: boolean; playlist: string; renditions: string[] }> {
  mkdirSync(hlsDir, { recursive: true });
  if (!existsSync(rawPath)) throw new Error(`raw not found: ${rawPath}`);

  const finishPoster = async () => {
    try {
      const imagesDir = join(dirname(hlsDir), '..', 'images');
      mkdirSync(imagesDir, { recursive: true });
      await extractPoster(rawPath, join(imagesDir, `thumb-${basename(hlsDir)}.jpg`));
    } catch {
      // Bo qua: thieu poster khong phai loi transcode.
    }
  };

  if (!(await hasFfmpeg())) {
    // SIMULATED (khong co ffmpeg): master gia voi du 3 muc de FE/CMS test ABR.
    for (const r of RENDITIONS) {
      writeFileSync(join(hlsDir, `${r.name}.m3u8`),
        `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\n${r.name}-seg-0.ts\n#EXT-X-ENDLIST\n`);
      writeFileSync(join(hlsDir, `${r.name}-seg-0.ts`), 'SIMULATED');
    }
    const playlist = writeMaster(hlsDir, RENDITIONS);
    return { simulated: true, playlist, renditions: RENDITIONS.map((r) => r.name) };
  }

  const srcHeight = await probeHeight(rawPath);
  const duration = await probeDuration(rawPath);
  const picked = RENDITIONS.filter((r) => srcHeight > 0 && r.height <= srcHeight);

  if (picked.length === 0) {
    // Fallback: nguon qua nho hoac khong probe duoc -> 1 luong giu nguyen kich thuoc.
    await runFfmpeg([
      '-y', '-i', rawPath, '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac', '-hls_time', '6', '-hls_list_size', '0', join(hlsDir, 'master.m3u8'),
    ], duration, onProgress);
    await finishPoster();
    return { simulated: false, playlist: join(hlsDir, 'master.m3u8'), renditions: ['source'] };
  }

  // 1 lenh ffmpeg duy nhat: decode 1 lan, encode song song cac muc.
  // force_key_frames theo chu ky segment de cac muc chuyen canh khop nhau (ABR muot).
  const args: string[] = ['-y', '-i', rawPath];
  picked.forEach((r, i) => {
    args.push(
      '-map', '0:v:0', '-map', '0:a?',
      `-c:v:${i}`, 'libx264', '-preset', 'veryfast',
      `-b:v:${i}`, r.vBitrate, `-maxrate:v:${i}`, r.maxRate, `-bufsize:v:${i}`, r.bufSize,
      `-vf:v:${i}`, `scale=-2:${r.height}`,
      `-force_key_frames:v:${i}`, 'expr:gte(t,n_forced*6)',
      `-c:a:${i}`, 'aac', `-b:a:${i}`, r.aBitrate, `-ac:a:${i}`, '2',
      '-f', 'hls', '-hls_time', '6', '-hls_list_size', '0',
      '-hls_segment_filename', join(hlsDir, `${r.name}_%03d.ts`),
      join(hlsDir, `${r.name}.m3u8`),
    );
  });
  await runFfmpeg(args, duration, onProgress);

  const playlist = writeMaster(hlsDir, picked);
  await finishPoster();
  return { simulated: false, playlist, renditions: picked.map((r) => r.name) };
}
