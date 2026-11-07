// E1 — chay bu (backfill) bien the anh.
//   node scripts/backfill-image-variants.mjs [--dry-run] [--images-dir DIR]
//       [--api-base URL] [--covers-only] [--local-only] [--limit N]
//
// Mac dinh DRY-RUN: chi in bao cao, KHONG ghi file, KHONG tai anh, KHONG
// sua DB. Muon chay that: them --apply.
//   - Anh trong kho /images: sinh bien the 1920/800/400 con thieu (bo qua
//     file da co du bien the; idempotent — chay lai chi lam phan thieu).
//   - Anh bia ngoai cua 10 bai Noi bat (lay tu API home-slots/noi-bat):
//     tai ve, luu lam anh goc moi /images/img-rehost-<hash12>.<ext>,
//     sinh 3 co, GHI BAO CAO mapping (URL ngoai cu -> file noi bo moi +
//     coverPath moi) ra file JSON — KHONG tu sua coverPath tren live,
//     parent ap dung sau khi duyet.
//   - Quyen dung: chi re-host anh toa soan co quyen dung. 10 anh bia
//     Noi bat hien host tren CDN baodienbienphu.vn — bao cao danh dau
//     tung anh "can xac nhan quyen dung" de nguoi duyet quyet dinh.
// Yeu cau: backend da build (npm run build) de import duoc
// ../dist/modules/uploads/image-variants.js; sharp co san trong
// node_modules (npm install). Chay tu thu muc vtcany/backend.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MAX_DOWNLOAD_BYTES = 10 * 1024 * 1024; // cung cap 10MB nhu upload
const VARIANTS = [1920, 800, 400];
const LOCAL_IMG_RE = /^img-[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/i;
const DERIVATIVE_RE = /-(1920|800|400)\.(jpg|jpeg|png|webp)$/i;

function parseArgs(argv) {
  const opts = { dryRun: true, imagesDir: '', apiBase: 'https://vtcany-api.vtctech.xyz/api/v1', coversOnly: false, localOnly: false, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--images-dir') opts.imagesDir = argv[++i] || '';
    else if (a === '--api-base') opts.apiBase = argv[++i] || opts.apiBase;
    else if (a === '--covers-only') opts.coversOnly = true;
    else if (a === '--local-only') opts.localOnly = true;
    else if (a === '--limit') opts.limit = parseInt(argv[++i] || '0', 10) || 0;
    else if (a === '--help' || a === '-h') { console.log('Dung: node scripts/backfill-image-variants.mjs [--apply] [--images-dir DIR] [--api-base URL] [--covers-only|--local-only] [--limit N]\nMac dinh dry-run (khong ghi file). Them --apply de chay that.'); process.exit(0); }
    else { console.error(`Tham so la: ${a}`); process.exit(2); }
  }
  return opts;
}

function imagesDirDefault() {
  const here = resolve(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
  return join(process.env.STORAGE_DIR || join(here, 'storage'), 'images');
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

async function downloadImage(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*' }, signal: ctl.signal });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!ct.startsWith('image/')) return { ok: false, reason: `content-type ${ct}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_DOWNLOAD_BYTES) return { ok: false, reason: `qua 10MB (${fmtBytes(buf.length)})` };
    return { ok: true, buf, contentType: ct };
  } catch (e) {
    return { ok: false, reason: e?.name === 'AbortError' ? 'timeout 30s' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function extFromUrlOrType(url, contentType) {
  const m = /\.([A-Za-z0-9]+)(?:[?#]|$)/.exec(url);
  const ext = (m?.[1] || '').toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  if (contentType?.includes('gif')) return 'gif';
  return 'jpg';
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const imagesDir = opts.imagesDir ? resolve(opts.imagesDir) : imagesDirDefault();
  if (!existsSync(imagesDir)) { console.error(`Thu muc anh khong ton tai: ${imagesDir}`); process.exit(1); }
  let variants;
  try {
    variants = await import(new URL('../dist/modules/uploads/image-variants.js', import.meta.url).href);
  } catch (e) {
    console.error('Khong import duoc dist/modules/uploads/image-variants.js — chay `npm run build` trong vtcany/backend truoc.\n' + String(e?.message || e));
    process.exit(1);
  }
  const { generateImageVariants, existingVariantWidths, variantFileName, probeImageWidth } = variants;

  const report = {
    mode: opts.dryRun ? 'dry-run' : 'apply',
    imagesDir,
    at: new Date().toISOString(),
    local: { scanned: 0, skippedHaveAll: 0, processed: 0, failed: 0, items: [] },
    rehost: { scanned: 0, skippedHaveAll: 0, processed: 0, failed: 0, items: [] },
  };
  const noteRights = 'CAN XAC NHAN QUYEN DUNG — anh dang host tren CDN ngoai (baodienbienphu.vn); chi ap dung coverPath moi sau khi toa soan xac nhan co quyen dung anh.';

  // --- A. Anh bia ngoai cua 10 bai Noi bat (uu tien) ---
  if (!opts.localOnly) {
    const apiUrl = `${opts.apiBase.replace(/\/$/, '')}/home-slots/noi-bat`;
    console.log(`[rehost] Lay danh sach Noi bat tu ${apiUrl}`);
    let items = [];
    try {
      const res = await fetch(apiUrl, { headers: { 'User-Agent': UA } });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const d = await res.json();
      items = d.items || [];
    } catch (e) {
      console.error(`[rehost] Khong lay duoc home-slots/noi-bat: ${e?.message || e} — bo qua phan re-host.`);
    }
    if (opts.limit) items = items.slice(0, opts.limit);
    for (const it of items) {
      const cover = it.coverPath || it.cover || '';
      if (!/^https?:\/\//i.test(cover)) continue; // anh noi bo: xu ly o phan local
      report.rehost.scanned++;
      const hash = createHash('sha256').update(cover).digest('hex').slice(0, 12);
      const entry = { title: it.title || '', oldUrl: cover, newCoverPath: '', newFile: '', originalBytes: 0, variants: [], rightsNote: noteRights };
      // Ten file xac dinh theo hash URL (idempotent): neu da tai truoc do
      // thi tim file img-rehost-<hash>.* hien co, dung ext that cua no.
      const existing = readdirSync(imagesDir).find((f) => f.startsWith(`img-rehost-${hash}.`));
      const extGuess = existing ? existing.split('.').pop().toLowerCase() : extFromUrlOrType(cover, '');
      const fileName = `img-rehost-${hash}.${extGuess}`;
      const filePath = join(imagesDir, fileName);
      // "Da co du" = file goc da co + du cac co CAN CO (chi co < rong
      // goc; anh nho hon 1920px khong bao gio co bien the 1920w).
      let haveAll = false;
      if (existing) {
        const w0 = await probeImageWidth(filePath);
        const expected = VARIANTS.filter((w) => w0 === 0 || w < w0);
        haveAll = expected.length > 0 && expected.every((w) => existsSync(join(imagesDir, variantFileName(`img-rehost-${hash}`, extGuess, w))));
      }
      if (haveAll) {
        report.rehost.skippedHaveAll++;
        entry.newCoverPath = `/images/${fileName}`;
        entry.newFile = fileName;
        const w0 = await probeImageWidth(filePath);
        entry.variants = VARIANTS.filter((w) => w0 === 0 || w < w0).map((w) => ({ width: w, fileName: variantFileName(`img-rehost-${hash}`, extGuess, w) }));
        report.rehost.items.push({ ...entry, status: 'da-co-du' });
        console.log(`[rehost] DA CO DU: ${cover} -> ${fileName}`);
        continue;
      }
      if (opts.dryRun) {
        entry.newCoverPath = `/images/${fileName}`;
        entry.newFile = fileName;
        report.rehost.items.push({ ...entry, status: 'se-tai-va-xu-ly (dry-run)' });
        console.log(`[rehost] SE TAI (dry-run): ${cover} -> ${fileName}`);
        continue;
      }
      const dl = await downloadImage(cover);
      if (!dl.ok) {
        report.rehost.failed++;
        report.rehost.items.push({ ...entry, status: `tai-loi: ${dl.reason}` });
        console.log(`[rehost] TAI LOI: ${cover} (${dl.reason})`);
        continue;
      }
      const ext = extFromUrlOrType(cover, dl.contentType);
      const realName = `img-rehost-${hash}.${ext}`;
      const realPath = join(imagesDir, realName);
      if (!existsSync(realPath)) writeFileSync(realPath, dl.buf);
      entry.newFile = realName;
      entry.newCoverPath = `/images/${realName}`;
      entry.originalBytes = dl.buf.length;
      const id = `img-rehost-${hash}`;
      const made = await generateImageVariants(realPath, imagesDir, id, ext);
      entry.variants = made.map((v) => ({ width: v.width, fileName: v.fileName, sizeBytes: v.sizeBytes }));
      report.rehost.processed++;
      report.rehost.items.push({ ...entry, status: 'ok' });
      console.log(`[rehost] OK: ${cover} -> ${realName} (${fmtBytes(dl.buf.length)} goc; bien the: ${made.map((v) => `${v.width}=${fmtBytes(v.sizeBytes)}`).join(', ') || 'khong co'})`);
    }
  }

  // --- B. Anh da co trong kho /images ---
  if (!opts.coversOnly) {
    const files = readdirSync(imagesDir).filter((f) => LOCAL_IMG_RE.test(f) && !DERIVATIVE_RE.test(f) && !f.startsWith('thumb-'));
    console.log(`[local] Quet ${files.length} anh goc trong ${imagesDir}`);
    const list = opts.limit ? files.slice(0, opts.limit) : files;
    for (const f of list) {
      const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9]+)$/.exec(f);
      if (!m) continue;
      const [, id, extRaw] = m;
      const ext = extRaw.toLowerCase();
      report.local.scanned++;
      const width0 = await probeImageWidth(join(imagesDir, f));
      const expected = VARIANTS.filter((w) => width0 === 0 || w < width0);
      const have = existingVariantWidths(imagesDir, `/images/${f}`, width0 || undefined);
      const missing = expected.filter((w) => !have.includes(w));
      if (!missing.length) {
        report.local.skippedHaveAll++;
        continue;
      }
      if (opts.dryRun) {
        report.local.items.push({ file: f, sizeBytes: statSync(join(imagesDir, f)).size, have, missing, status: 'se-sinh (dry-run)' });
        console.log(`[local] SE SINH (dry-run): ${f} (da co ${have.join('/') || 'khong'}; thieu ${missing.join('/')})`);
        continue;
      }
      const made = await generateImageVariants(join(imagesDir, f), imagesDir, id, ext);
      if (!made.length) {
        report.local.failed++;
        report.local.items.push({ file: f, status: 'loi-khong-sinh-duoc' });
        console.log(`[local] LOI: ${f} (khong sinh duoc bien the nao)`);
      } else {
        report.local.processed++;
        report.local.items.push({ file: f, made: made.map((v) => ({ width: v.width, fileName: v.fileName, sizeBytes: v.sizeBytes })), status: 'ok' });
        console.log(`[local] OK: ${f} -> ${made.map((v) => `${v.width}=${fmtBytes(v.sizeBytes)}`).join(', ')}`);
      }
    }
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const reportFile = join(process.cwd(), `backfill-image-variants-report-${stamp}${opts.dryRun ? '-dry-run' : ''}.json`);
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log('\n=== TOM TAT ===');
  console.log(`Che do: ${report.mode} | Thu muc: ${imagesDir}`);
  console.log(`Local: quet ${report.local.scanned}, da du ${report.local.skippedHaveAll}, da xu ly ${report.local.processed}, loi ${report.local.failed}`);
  console.log(`Re-host Noi bat: quet ${report.rehost.scanned}, da du ${report.rehost.skippedHaveAll}, da xu ly ${report.rehost.processed}, loi ${report.rehost.failed}`);
  console.log(`Bao cao mapping: ${reportFile}`);
  console.log('Luu y: KHONG tu sua coverPath tren live — parent ap dung mapping sau khi duyet + xac nhan quyen dung anh.');
}

main().catch((e) => { console.error(e); process.exit(1); });
