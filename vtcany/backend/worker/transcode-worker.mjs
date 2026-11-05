// Transcode worker (poll fallback, khong BullMQ/Redis).
//
// Luong: poll GET <API>/internal/transcode-queue (guard bang shared secret,
// khong JWT) -> transcode tuan tu tung job mot -> bao ket qua ve
// POST <API>/internal/media-webhook. Cac status webhook:
//   'attempt'    : claim job truoc khi chay ffmpeg (backend tang attempts).
//   'processing' : % tien trinh (thong tin hien thi, loi thi bo qua).
//   'done'       : transcode xong, kem durationSec (giay, null neu khong probe duoc).
//   'retry'      : ffmpeg loi / source mat / webhook 'done' loi — backend ap
//                  backoff mu (30s x 2^(attempts-1), tran 1h) roi dead-letter
//                  sau 5 lan thu. KHONG bao gio post 'error' truc tiep:
//                  'error' la trang thai terminal do backend danh dau khi
//                  dead-letter (tranh bug cu: done loi webhook -> error vinh vien).
//   'error'      : chi backend dung noi bo (dead-letter); worker khong gui.
//
// Quy uoc duong dan (phai khop backend, xem uploads.service.ts):
//   - file goc da merge:  <storage>/raw/<uploadId>-<ten file da sanitize>
//   - HLS output:         <storage>/hls/<uploadId>/master.m3u8 (+ variant .m3u8/.ts)
//   - poster tu dong:     <storage>/images/thumb-<uploadId>.jpg
// Backend chi coi video la san sang khi master.m3u8 ton tai (isReady()),
// va chi hien poster khi file thumb ton tai (posterUrlFor()).
//
// Tinh idempotent (quan trong): neu master.m3u8 da ton tai thi chi POST done,
// khong chay lai ffmpeg. Nho vay cac upload dang ket o 'processing' (vi
// truoc day chua co worker) se tu hoan tat sau khi worker chay, khong can
// upload lai; va worker restart giua chung cung khong lam hong job.
//
// Chay: node worker/transcode-worker.mjs (khong can build, khong dependency
// moi — chi dung fetch + child_process cua Node 20).
// Cau hinh hoan toan qua env (xem CONFIG ben duoi). Thoat bang SIGINT/SIGTERM:
// worker dung poll sau job hien tai roi thoat (khong giet ffmpeg giua chung).
//
// TRIen KHAI (app rieng, khong chay nen trong container backend): worker app
// dung cung repo/image voi backend, chi khac env — WORKER_MODE=true (xem
// worker-entrypoint.sh), cung mount STORAGE_DIR voi backend (shared volume,
// vi worker doc file goc + ghi HLS/poster truc tiep tren o dia), cung
// MEDIA_WEBHOOK_SECRET voi backend, TRANSCODE_API_BASE tro toi URL API public
// cua backend (vd https://vtcany-api.vtctech.xyz/api/v1). Worker khong chia
// se process voi API: moi tuong tac deu qua HTTP (queue + webhook) va o dia
// chung, nen chay o container nao cung duoc mien la 3 dieu kien tren dung.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Cau hinh (env only, khong hardcode secret)
// ---------------------------------------------------------------------------
export const CONFIG = {
  // Base URL cua backend, DA BAO GOM global prefix api/v1 (xem src/main.ts).
  // Mac dinh localhost:3001 chi dung khi chay local canh backend; worker app
  // rieng tren Coolify BAT BUOC set TRANSCODE_API_BASE toi URL API public
  // cua backend (vd https://vtcany-api.vtctech.xyz/api/v1).
  apiBase: process.env.TRANSCODE_API_BASE || 'http://localhost:3001/api/v1',
  // Secret guard cho 2 endpoint internal — PHAI TRUNG voi MEDIA_WEBHOOK_SECRET
  // cua backend (xem checkWebhookSecret trong uploads.service.ts). Thieu la
  // worker tu choi chay ngay tu dau thay vi poll 403 mai.
  webhookSecret: process.env.MEDIA_WEBHOOK_SECRET || '',
  // Cung bien STORAGE_DIR backend dung (xem main.ts + storageRoot()).
  // Mac dinh: worker o backend/worker/ -> len 2 cap = thu muc vtcany/ -> storage/
  // (khop storageRootDefault() cua backend khi chay tu repo).
  storageDir:
    process.env.STORAGE_DIR ||
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'storage'),
  pollMs: Number(process.env.TRANSCODE_POLL_MS || 10000),
  ffmpegBin: process.env.FFMPEG_BIN || 'ffmpeg',
  ffprobeBin: process.env.FFPROBE_BIN || 'ffprobe',
  // File heartbeat cho Dockerfile HEALTHCHECK (xem Dockerfile): worker ghi
  // timestamp moi lan poll; healthcheck chi can file nay tuoi <= 90s,
  // KHONG cham DB/backend. Mac dinh /tmp/worker-alive.
  heartbeatFile: process.env.WORKER_HEARTBEAT_FILE || '/tmp/worker-alive',
};

// ---------------------------------------------------------------------------
// Heartbeat: chung minh worker con song + dang lap (khong chi process ton tai)
// ---------------------------------------------------------------------------

/** Ghi timestamp hien tai (ms) ra file heartbeat; loi ghi KHONG duoc giet worker. */
export function touchHeartbeat(file = CONFIG.heartbeatFile) {
  try {
    writeFileSync(file, `${Date.now()}\n`);
  } catch {
    // Ghi loi -> healthcheck se thay file cu/mat va bao truot; worker van chay.
  }
}

// ---------------------------------------------------------------------------
// Helper thuan (duoc test rieng trong transcode-worker.test.mjs)
// ---------------------------------------------------------------------------

/** Cung regex backend dung chong path traversal (media-sign.ts). */
export function isValidUploadId(uploadId) {
  return !!uploadId && /^[A-Za-z0-9_-]{1,64}$/.test(uploadId);
}

/** Cung cach sanitize ten file cua backend (finalPath trong local-store.ts). */
export function safeFilename(filename) {
  return String(filename || '').replace(/[^a-zA-Z0-9._-]/g, '_');
}

/** Duong dan file goc da merge cua mot upload. */
export function sourcePath(storageDir, uploadId, filename) {
  return join(storageDir, 'raw', `${uploadId}-${safeFilename(filename)}`);
}

/** Thu muc HLS + master playlist + poster cua mot upload. */
export function hlsDir(storageDir, uploadId) {
  return join(storageDir, 'hls', uploadId);
}
export function masterPath(storageDir, uploadId) {
  return join(hlsDir(storageDir, uploadId), 'master.m3u8');
}
export function posterPath(storageDir, uploadId) {
  return join(storageDir, 'images', `thumb-${uploadId}.jpg`);
}

/** Parse "time=HH:MM:SS.xx" trong stderr cua ffmpeg -> so giay (null neu khong co). */
export function parseFfmpegTime(line) {
  const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(line || '');
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** % tien trinh tu thoi gian hien tai / tong thoi luong (lam tron xuong). */
export function progressPct(elapsedSec, durationSec) {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return null;
  if (!elapsedSec || !Number.isFinite(elapsedSec) || elapsedSec <= 0) return 0;
  return Math.min(99, Math.floor((elapsedSec / durationSec) * 100));
}

/** Chi POST progress khi % nguyen thay doi (tranh spam webhook). */
export function shouldPostProgress(lastPosted, pct) {
  return pct !== null && pct !== lastPosted;
}

/** Chon thoi diem cat poster: 10% thoi luong, kep trong [1s, 30s]. */
export function posterSeekSec(durationSec) {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.min(Math.max(durationSec * 0.1, 1), 30);
}

// ---------------------------------------------------------------------------
// Retry/backoff/dead-letter + format duration — MIRROR backend
// (src/modules/uploads/retry-policy.ts). Giu 2 ban dong bo khi doi hang so.
// Backend la noi ap dung that (queue filter + retry transition); worker chi
// gui dung status webhook ('attempt'/'retry'/'done'), khong tu tinh backoff.
// ---------------------------------------------------------------------------

/** So lan thu toi da truoc khi backend dead-letter (giong backend). */
export const MAX_TRANSCODE_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_SEC = 30;
export const RETRY_MAX_DELAY_SEC = 3600;

/** Delay backoff mu (giay): 30, 60, 120, 240, ... tran 1h. */
export function retryDelaySec(attempts) {
  const a = Math.max(1, Math.floor(attempts) || 1);
  return Math.min(RETRY_BASE_DELAY_SEC * 2 ** (a - 1), RETRY_MAX_DELAY_SEC);
}

/** Da het luot thu? */
export function shouldDeadLetter(attempts) {
  return (attempts || 0) >= MAX_TRANSCODE_ATTEMPTS;
}

/** Giay -> "h:mm:ss" (3661 -> "1:01:01", 90 -> "0:01:30"). Khong hop le -> null. */
export function formatDurationHms(totalSec) {
  if (!Number.isFinite(totalSec) || totalSec < 0) return null;
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Rut gon message loi ve 1 dong ngan de gui webhook (khong gui ca stderr). */
export function shortError(text, max = 200) {
  const line = String(text || '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  if (!line) return 'ffmpeg failed';
  return line.length > max ? line.slice(0, max) : line;
}

// ---------------------------------------------------------------------------
// Goi API backend
// ---------------------------------------------------------------------------

async function fetchQueue() {
  const res = await fetch(`${CONFIG.apiBase}/internal/transcode-queue`, {
    headers: { 'x-webhook-secret': CONFIG.webhookSecret },
  });
  if (!res.ok) throw new Error(`queue HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function postWebhook(uploadId, status, extra = {}) {
  const res = await fetch(`${CONFIG.apiBase}/internal/media-webhook`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-webhook-secret': CONFIG.webhookSecret,
    },
    body: JSON.stringify({ uploadId, status, ...extra }),
  });
  if (!res.ok) throw new Error(`webhook HTTP ${res.status}`);
}

// ---------------------------------------------------------------------------
// Chay lenh ngoai (ffmpeg/ffprobe), tra exit code + stderr cuoi
// ---------------------------------------------------------------------------

function runCmd(bin, args, onStderrLine) {
  return new Promise((resolvePromise) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      tail = (tail + text).slice(-4000);
      if (onStderrLine) {
        for (const line of text.split('\n')) {
          if (line.trim()) onStderrLine(line);
        }
      }
    });
    child.on('error', (err) => resolvePromise({ code: 1, stderr: String(err?.message || err), stdout: '' }));
    child.on('close', (code) => resolvePromise({ code: code ?? 1, stderr: tail, stdout: out }));
  });
}

// Thoi luong (de bao % tien trinh) + co track audio khong (de quyet dinh
// co map audio hay khong — video khong tieng ma map 0:a thi ffmpeg fail).
// ffprobe loi -> gia dinh co audio (giu hanh vi cu, loi that se hien o buoc ffmpeg).
async function probeMedia(source) {
  const { code, stdout } = await runCmd(CONFIG.ffprobeBin, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-show_entries', 'stream=codec_type',
    '-of', 'json',
    source,
  ]);
  if (code !== 0) return { duration: null, hasAudio: true };
  try {
    const j = JSON.parse(stdout);
    const d = Number(j?.format?.duration);
    const hasAudio = Array.isArray(j?.streams) && j.streams.some((s) => s.codec_type === 'audio');
    return { duration: Number.isFinite(d) && d > 0 ? d : null, hasAudio };
  } catch {
    return { duration: null, hasAudio: true };
  }
}

async function cutPoster(source, out, seekSec) {
  mkdirSync(dirname(out), { recursive: true });
  const { code, stderr } = await runCmd(CONFIG.ffmpegBin, [
    '-y',
    '-ss', String(seekSec),
    '-i', source,
    '-frames:v', '1',
    '-q:v', '3',
    out,
  ]);
  if (code !== 0 || !existsSync(out)) {
    console.warn(`[worker] poster cut failed (non-fatal): ${shortError(stderr)}`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Transcode 1 job: 720p + 480p HLS + master playlist
// ---------------------------------------------------------------------------

async function transcodeJob(job) {
  const uploadId = job.id;
  const outDir = hlsDir(CONFIG.storageDir, uploadId);
  const master = masterPath(CONFIG.storageDir, uploadId);

  // Idempotent resume: master da co -> chi bao done, khong chay lai ffmpeg.
  if (existsSync(master)) {
    console.log(`[worker] ${uploadId}: master.m3u8 already exists, reporting done`);
    await postWebhook(uploadId, 'done');
    return;
  }

  // CLAIM truoc moi thu (ke ca kiem tra source): backend tang attempts
  // ngay, ke ca worker chet giua job thi lan thu do van duoc dem. Neu claim
  // sau kiem tra source thi job mat file se 'retry' mai ma attempts khong
  // tang -> khong bao gio dead-letter. Claim loi (backend down / record
  // khong con) -> bo job lan poll nay, lan sau poll lai (khong transcode
  // mu khi khong bao cao duoc).
  try {
    await postWebhook(uploadId, 'attempt');
  } catch (e) {
    console.error(`[worker] ${uploadId}: claim failed, skipping this poll: ${e?.message || e}`);
    return;
  }

  const source = existsSync(job.localPath)
    ? job.localPath
    : sourcePath(CONFIG.storageDir, uploadId, job.filename);
  if (!existsSync(source)) {
    const msg = `source file not found: ${source}`;
    console.error(`[worker] ${uploadId}: ${msg}`);
    // File goc mat: van di duong 'retry' de backend ap backoff roi
    // dead-letter sau MAX lan (tranh ket job vinh vien neu mount loi tam
    // thoi, dong thoi khong danh dau error ngay cho loi co the tu khoi).
    await postWebhook(uploadId, 'retry', { message: msg });
    return;
  }

  const { duration, hasAudio } = await probeMedia(source);
  mkdirSync(outDir, { recursive: true });

  let lastPosted = -1;
  const onProgressLine = (line) => {
    const t = parseFfmpegTime(line);
    if (t === null) return;
    const pct = progressPct(t, duration);
    if (!shouldPostProgress(lastPosted, pct)) return;
    lastPosted = pct;
    // Progress chi la thong tin hien thi: gui loi thi bo qua, khong fail job.
    postWebhook(uploadId, 'processing', { progress: pct }).catch(() => {});
  };

  // Chu y: var_stream_map khong cho 2 variant cung tham chieu 1 audio stream,
  // nen phai map audio input 2 lan (a:0 cho 720p, a:1 cho 480p). Video khong
  // tieng thi bo han audio khoi map va khoi var_stream_map.
  const args = [
    '-y',
    '-i', source,
    '-filter_complex',
    '[0:v]split=2[v720][v480];' +
      '[v720]scale=-2:720[v720out];' +
      '[v480]scale=-2:480[v480out]',
    '-map', '[v720out]', '-c:v:0', 'libx264', '-preset:v:0', 'veryfast',
    '-b:v:0', '2800k', '-maxrate:v:0', '3000k', '-bufsize:v:0', '6000k',
    ...(hasAudio ? ['-map', '0:a'] : []),
    '-map', '[v480out]', '-c:v:1', 'libx264', '-preset:v:1', 'veryfast',
    '-b:v:1', '1200k', '-maxrate:v:1', '1400k', '-bufsize:v:1', '2800k',
    ...(hasAudio ? ['-map', '0:a', '-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : []),
    '-f', 'hls',
    '-hls_time', '6',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(outDir, '%v_%03d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', hasAudio
      ? 'v:0,a:0,name:720p v:1,a:1,name:480p'
      : 'v:0,name:720p v:1,name:480p',
    join(outDir, '%v.m3u8'),
  ];
  console.log(`[worker] ${uploadId}: transcoding ${source} (duration=${duration ?? 'unknown'}s)`);
  const { code, stderr } = await runCmd(CONFIG.ffmpegBin, args, onProgressLine);
  if (code !== 0 || !existsSync(master)) {
    const msg = shortError(stderr);
    console.error(`[worker] ${uploadId}: ffmpeg failed: ${msg}`);
    // Xoa output do de lan poll sau chay sach tu dau (tranh segment thua
    // cua lan chay do tron vao playlist cua lan chay thanh cong).
    rmSync(outDir, { recursive: true, force: true });
    // Loi transcode di duong 'retry' (backend backoff/dead-letter), KHONG
    // 'error' truc tiep: loi lan dau chua phai dead-letter.
    await postWebhook(uploadId, 'retry', { message: msg });
    return;
  }

  // Poster la nice-to-have: cat loi thi van bao done, video phat duoc
  // (posterUrlFor() khi do tra '' va FE dung fallback).
  await cutPoster(source, posterPath(CONFIG.storageDir, uploadId), posterSeekSec(duration));
  console.log(`[worker] ${uploadId}: done`);
  // Gui kem durationSec (so nguyen giay, lam tron tu duration probe) de
  // backend luu MediaAsset + tu dien duration CatalogItem; null neu probe
  // khong ra (backend giu nguyen, khong xoa duration cu).
  const durationSec =
    duration != null && Number.isFinite(duration) && duration > 0 ? Math.round(duration) : null;
  await postWebhook(uploadId, 'done', { durationSec });
}

// ---------------------------------------------------------------------------
// Gop ngay (GĐ3 nen): worker tick goi endpoint internal cua backend.
// ---------------------------------------------------------------------------

/** Tick gop ngay toi da 1 lan/gio (mac dinh): tranh goi lien tuc moi poll 10s. */
export function shouldCallRollup(lastCallMs, nowMs, intervalMs = 3600000) {
  if (!lastCallMs) return true;
  return nowMs - lastCallMs >= intervalMs;
}

/** POST /internal/rollup-daily (guard bang MEDIA_WEBHOOK_SECRET giong queue). Khong throw. */
export async function callRollupDaily() {
  const res = await fetch(`${CONFIG.apiBase}/internal/rollup-daily`, {
    method: 'POST',
    headers: { 'x-webhook-secret': CONFIG.webhookSecret },
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) throw new Error(`rollup-daily HTTP ${res.status}: ${text.slice(0, 200)}`);
  let data = {};
  try { data = JSON.parse(text); } catch { /* giu {} */ }
  console.log(`[worker] rollup-daily ok: dates=${(data.dates || []).join(',') || '(none)'} pruned=${JSON.stringify(data.pruned || {})}`);
  return data;
}

// ---------------------------------------------------------------------------
// Vong lap chinh: tuan tu, 1 job/lan, loi 1 job khong giet loop
// ---------------------------------------------------------------------------

let stopping = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function mainLoopOnce(inProgress) {
  let jobs = [];
  try {
    jobs = await fetchQueue();
  } catch (e) {
    console.error(`[worker] queue poll failed: ${e?.message || e}`);
    return;
  }
  for (const job of jobs) {
    if (stopping) break;
    if (!job || !isValidUploadId(job.id)) continue;
    if (inProgress.has(job.id)) continue; // khong xu ly trung 1 job
    inProgress.add(job.id);
    try {
      await transcodeJob(job);
    } catch (e) {
      // Loi khong luong truoc (vd webhook 'done' gui loi — backend down dung
      // luc bao done): KHONG post 'error' (bug cu: bien 1 transcode THANH
      // CONG thanh loi vinh vien). Di duong 'retry' de backend ap backoff /
      // dead-letter; lan poll sau gap master san se bao 'done' lai (idempotent).
      console.error(`[worker] ${job.id}: unexpected error: ${e?.message || e}`);
      try {
        await postWebhook(job.id, 'retry', { message: shortError(e?.message || e) });
      } catch { /* backend co the dang down; lan poll sau se thu lai */ }
    } finally {
      inProgress.delete(job.id);
    }
  }
}

async function main() {
  if (!CONFIG.webhookSecret) {
    console.error('[worker] FATAL: MEDIA_WEBHOOK_SECRET is not set — refusing to start (all internal calls would 403).');
    process.exit(1);
  }
  console.log(`[worker] starting: api=${CONFIG.apiBase} storage=${CONFIG.storageDir} poll=${CONFIG.pollMs}ms`);
  process.on('SIGINT', () => { stopping = true; console.log('[worker] stopping after current job...'); });
  process.on('SIGTERM', () => { stopping = true; console.log('[worker] stopping after current job...'); });
  const inProgress = new Set();
  let lastRollupCall = 0;
  // Heartbeat moi vong poll + them setInterval: 1 transcode dai (phut) await
  // trong mainLoopOnce se chan vong lap — neu chi ghi o dau vong lap thi
  // file se cu qua 90s giua transcode va healthcheck bao truot oan, co the
  // bi restart giua chung. setInterval chay tren event loop nen van ghi
  // deu trong luc ffmpeg dang chay.
  touchHeartbeat();
  const heartbeatTimer = setInterval(touchHeartbeat, CONFIG.pollMs);
  while (!stopping) {
    touchHeartbeat();
    await mainLoopOnce(inProgress);
    if (stopping) break;
    // Tick gop ngay (GĐ3 nen): goi endpoint internal toi da 1 lan/gio.
    // Endpoint tu quet cac ngay VN con thieu + tia row tho > 90 ngay,
    // chay lai an toan; loi o day khong duoc giet vong transcode.
    if (shouldCallRollup(lastRollupCall, Date.now())) {
      lastRollupCall = Date.now();
      try {
        await callRollupDaily();
      } catch (e) {
        console.error(`[worker] rollup-daily failed: ${e?.message || e}`);
      }
    }
    await sleep(CONFIG.pollMs);
  }
  clearInterval(heartbeatTimer);
  console.log('[worker] stopped');
}

const invokedAsScript =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((e) => {
    console.error(`[worker] FATAL: ${e?.message || e}`);
    process.exit(1);
  });
}
