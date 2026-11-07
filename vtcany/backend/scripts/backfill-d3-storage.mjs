// Chay bu D3 "Luu tru" — fileType NULL (media_assets) + pdfSizeBytes
// NULL/0 (epaper_issues).
//   node scripts/backfill-d3-storage.mjs [--dry-run] [--apply] [--limit N]
//
// Mac dinh DRY-RUN: chi in bao cao, KHONG ghi DB. Muon chay that: them --apply.
// TRUOC KHI --apply (bat buoc, theo quy tac user): pg_dump 2 bang
// media_assets + epaper_issues ra /app/storage va XAC MINH file ton tai
// roi moi chay. Khong co file backup -> dung chay --apply.
// Quy tac:
//   - fileType: suy ra bang CUNG helper inferFileType moi (MIME + duoi
//     file, mau thuan uu tien duoi, khong nhan ra -> 'other'); dong
//     khong suy ra duoc van ghi 'other' (khong bo sot).
//   - pdfSizeBytes: do file that tren dia (storageRoot + pdfPath, chan
//     path-traversal); file khong con tren dia -> GIU NULL (khong doan
//     so) va liet ke vao bao cao loi; neu gia tri cu la 0 thi dua ve NULL.
//   - Chi UPDATE dung 2 cot: media_assets.file_type,
//     epaper_issues.pdf_size_bytes. KHONG dong sizeBytes/status/updatedAt
//     (dung $executeRaw SQL tho, khong qua delegate Prisma).
//   - Idempotent: chay lai sau khi apply thi khong con gi de doi (tru
//     cac so bao mat file PDF, van o NULL co chu dich).
//   - Them muc MO COI (chi liet ke, KHONG xoa): thu muc HLS cua video
//     da xoa, chunk do dang trong raw, thumb-*.jpg khong gan ban ghi
//     nao — so luong + dung luong. Viec XOA mo coi can pg_dump/ghi danh
//     sach truoc va cho user noi "Duyet --apply" RIENG (tach khoi chay
//     bu fileType/pdfSizeBytes); script nay KHONG xoa mo coi o ca 2 che do.
// Yeu cau: chay TRONG container backend (terminal Coolify) sau khi
//   backend da deploy ban co helper + script nay (image build san
//   dist/ bang `npm run build`; DATABASE_URL + STORAGE_DIR lay tu env
//   container).
//   node scripts/backfill-d3-storage.mjs            (dry-run)
//   node scripts/backfill-d3-storage.mjs --apply    (ghi that)
// Ma thoat: 0 = xong (dry-run hoac apply khong loi), 1 = co loi DB/Prisma
//   hoac co ban ghi update loi, 2 = tham so la.
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Do dung luong file PDF that tren dia (giong EpaperService.measurePdfSize):
// tra ve so byte, hoac null khi file thieu/khong doc duoc/duong dan thoat root.
export function measurePdfOnDisk(storageRoot, pdfPath) {
  const root = String(storageRoot || '');
  const abs = join(root, String(pdfPath || ''));
  if (!root || !abs.startsWith(root)) return null;
  try {
    if (!existsSync(abs)) return null;
    return statSync(abs).size;
  } catch {
    return null;
  }
}

// Tong kich thuoc cay thu muc (de quy). File bien mat giua chung -> bo qua.
export function measureDirTree(dir) {
  let bytes = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    try {
      if (e.isDirectory()) bytes += measureDirTree(p);
      else if (e.isFile()) bytes += statSync(p).size;
    } catch { /* bo qua */ }
  }
  return bytes;
}

function readDirEntries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

// Liet ke file mo coi HIEN CO (chi doc, KHONG xoa — viec xoa can duyet
// "Duyet --apply" RIENG + pg_dump/ghi danh sach truoc):
//   - hls: thu muc storage/hls/<id>/ ma khong con ban ghi media_assets
//     (video da xoa that nhung thu muc HLS con sot — tu nay remove()
//     da don luon nen chi con sot tu truoc).
//   - chunks: thu muc storage/raw/<id>/ con file chunk-* (upload do
//     dang; chunk da gop xong bi xoa ngay nen con chunk = chua hoan tat).
//   - thumbs: file storage/images/thumb-<id>.jpg ma khong con ban ghi
//     media_assets voi id tuong ung (poster cua video da xoa).
// mediaIds = Set cac id media_assets. Tra ve so luong + dung luong +
// danh sach tung muc.
export function listOrphans(storageRoot, mediaIds, now = Date.now()) {
  const out = {
    hls: { count: 0, bytes: 0, items: [] },
    chunks: { count: 0, bytes: 0, items: [] },
    thumbs: { count: 0, bytes: 0, items: [] },
  };
  const hlsRoot = join(storageRoot, 'hls');
  for (const e of readDirEntries(hlsRoot)) {
    if (!e.isDirectory()) continue;
    if (mediaIds.has(e.name)) continue;
    const bytes = measureDirTree(join(hlsRoot, e.name));
    out.hls.count += 1;
    out.hls.bytes += bytes;
    out.hls.items.push({ id: e.name, bytes });
  }
  const rawRoot = join(storageRoot, 'raw');
  for (const e of readDirEntries(rawRoot)) {
    if (!e.isDirectory()) continue;
    const dir = join(rawRoot, e.name);
    let chunkFiles = 0;
    let bytes = 0;
    let newest = 0;
    for (const f of readDirEntries(dir)) {
      if (!f.isFile() || !f.name.startsWith('chunk-')) continue;
      chunkFiles += 1;
      try {
        const st = statSync(join(dir, f.name));
        bytes += st.size;
        if (st.mtimeMs > newest) newest = st.mtimeMs;
      } catch { /* bo qua */ }
    }
    if (chunkFiles === 0) continue;
    out.chunks.count += 1;
    out.chunks.bytes += bytes;
    out.chunks.items.push({
      id: e.name,
      chunkFiles,
      bytes,
      newestChunkAt: newest ? new Date(newest).toISOString() : null,
      ageHours: newest ? Math.round(((now - newest) / 3600000) * 10) / 10 : null,
      wouldClean: newest ? (now - newest) > 24 * 60 * 60 * 1000 : false,
    });
  }
  const imagesRoot = join(storageRoot, 'images');
  for (const e of readDirEntries(imagesRoot)) {
    if (!e.isFile() || !e.name.startsWith('thumb-') || !e.name.endsWith('.jpg')) continue;
    const id = e.name.slice('thumb-'.length, -'.jpg'.length);
    if (mediaIds.has(id)) continue;
    let bytes = 0;
    try { bytes = statSync(join(imagesRoot, e.name)).size; } catch { /* bo qua */ }
    out.thumbs.count += 1;
    out.thumbs.bytes += bytes;
    out.thumbs.items.push({ filename: e.name, id, bytes });
  }
  return out;
}

// Gom cac ban ghi fileType NULL theo loai suy ra (dung CUNG luat
// inferFileType). Tra ve { total, byType: { [loai]: { files, bytes } },
// items: [{ id, filename, contentType, sizeBytes, inferred }] }.
export function classifyNullFileTypes(rows, inferFileType) {
  const byType = {};
  const items = [];
  for (const r of rows) {
    const sizeBytes = Number(r.sizeBytes ?? r.size_bytes ?? 0) || 0;
    const inferred = inferFileType(r.filename, r.contentType ?? r.content_type);
    items.push({
      id: r.id,
      filename: r.filename ?? null,
      contentType: r.contentType ?? r.content_type ?? null,
      sizeBytes,
      inferred,
    });
    const t = byType[inferred] || { files: 0, bytes: 0 };
    t.files += 1;
    t.bytes += sizeBytes;
    byType[inferred] = t;
  }
  return { total: items.length, byType, items };
}

export function parseArgs(argv) {
  const opts = { dryRun: true, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--limit') opts.limit = parseInt(argv[++i] || '0', 10) || 0;
    else if (a === '--help' || a === '-h') { console.log('Dung: node scripts/backfill-d3-storage.mjs [--apply] [--dry-run] [--limit N]\nMac dinh dry-run (khong ghi DB). Them --apply de chay that (sau khi pg_dump 2 bang va duyet so lieu).'); process.exit(0); }
    else { console.error(`Tham so la: ${a}`); process.exit(2); }
  }
  return opts;
}

// Chay bu tren 1 DB client co $queryRaw/$executeRaw (PrismaClient that,
// hoac client gia trong test). opts: { inferFileType, storageRoot,
// dryRun, limit, log, measurePdf? } (measurePdf mac dinh measurePdfOnDisk).
// Loi doc -> nem ra ngay; loi update tung ban ghi -> ghi nhan, chay tiep
// ban khac, bao cao failed > 0 de main thoat ma 1.
export async function runBackfill(db, opts) {
  const {
    inferFileType, storageRoot, dryRun = true, limit = 0,
    log = console.log, measurePdf = measurePdfOnDisk,
  } = opts;
  if (typeof inferFileType !== 'function') throw new Error('thieu inferFileType');
  if (!storageRoot) throw new Error('thieu storageRoot (STORAGE_DIR)');
  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    at: new Date().toISOString(),
    mediaAssets: { nullTotal: 0, byType: {}, toChange: 0, changed: 0, failed: 0, items: [] },
    epaperIssues: { nullCount: 0, zeroCount: 0, toChange: 0, changed: 0, unresolved: 0, failed: 0, items: [] },
    orphans: null,
    verification: null,
  };

  // (a)+(b) fileType NULL: tong + phan theo loai suy ra.
  const nullRows = await db.$queryRaw`SELECT id, filename, content_type, size_bytes FROM media_assets WHERE file_type IS NULL ORDER BY id`;
  const classified = classifyNullFileTypes(nullRows, inferFileType);
  const mediaList = limit > 0 ? classified.items.slice(0, limit) : classified.items;
  report.mediaAssets.nullTotal = classified.total;
  report.mediaAssets.byType = classified.byType;
  report.mediaAssets.toChange = mediaList.length;
  for (const item of mediaList) {
    if (dryRun) {
      report.mediaAssets.items.push({ ...item, status: 'se-doi (dry-run)' });
      log(`[media_assets] SE DOI (dry-run): ${item.id} [${item.filename}] ${item.contentType || ''} -> file_type='${item.inferred}' (${item.sizeBytes} B)`);
      continue;
    }
    try {
      const n = await db.$executeRaw`UPDATE media_assets SET file_type = ${item.inferred} WHERE id = ${item.id} AND file_type IS NULL`;
      if (Number(n) === 1) {
        report.mediaAssets.changed++;
        report.mediaAssets.items.push({ ...item, status: 'ok' });
        log(`[media_assets] OK: ${item.id} -> file_type='${item.inferred}'`);
      } else {
        report.mediaAssets.failed++;
        report.mediaAssets.items.push({ ...item, status: 'loi: khong doi duoc dong (da co file_type?)' });
        log(`[media_assets] LOI: ${item.id} — khong doi duoc dong (da co file_type?)`);
      }
    } catch (e) {
      report.mediaAssets.failed++;
      report.mediaAssets.items.push({ ...item, status: `loi: ${e?.message || e}` });
      log(`[media_assets] LOI: ${item.id} — ${e?.message || e}`);
    }
  }

  // (c)+(d) so bao co pdf_path ma pdf_size_bytes NULL hoac = 0.
  const pdfCounts = await db.$queryRaw`SELECT COUNT(*) FILTER (WHERE pdf_size_bytes IS NULL) AS null_n, COUNT(*) FILTER (WHERE pdf_size_bytes = 0) AS zero_n FROM epaper_issues WHERE pdf_path IS NOT NULL AND (pdf_size_bytes IS NULL OR pdf_size_bytes = 0)`;
  const pdfRows = await db.$queryRaw`SELECT id, public_id, issue_number, issue_type, title, pdf_path, pdf_size_bytes FROM epaper_issues WHERE pdf_path IS NOT NULL AND (pdf_size_bytes IS NULL OR pdf_size_bytes = 0) ORDER BY issue_type, issue_number`;
  const pdfList = (limit > 0 ? pdfRows.slice(0, limit) : pdfRows).map((r) => ({
    id: r.id,
    publicId: r.public_id ?? null,
    issueNumber: r.issue_number ?? null,
    issueType: r.issue_type ?? null,
    title: r.title ?? null,
    pdfPath: r.pdf_path ?? null,
    pdfSizeBytes: r.pdf_size_bytes === null || r.pdf_size_bytes === undefined ? null : Number(r.pdf_size_bytes),
  }));
  report.epaperIssues.nullCount = Number(pdfCounts?.[0]?.null_n ?? 0);
  report.epaperIssues.zeroCount = Number(pdfCounts?.[0]?.zero_n ?? 0);
  report.epaperIssues.toChange = pdfList.length;
  for (const item of pdfList) {
    const size = measurePdf(storageRoot, item.pdfPath);
    const sizeShown = size === null ? 'mat file' : `${size} B`;
    if (dryRun) {
      report.epaperIssues.items.push({ ...item, measuredSize: size, status: size === null ? 'se-giu NULL (dry-run, mat file)' : 'se-doi (dry-run)' });
      log(`[epaper_issues] SE DOI (dry-run): so ${item.issueNumber} (${item.issueType}) [${item.title}] pdf_size_bytes=${item.pdfSizeBytes} -> ${sizeShown}`);
      continue;
    }
    if (size === null) {
      // File khong con tren dia: giu NULL (khong doan so). Neu gia tri cu
      // la 0 thi dua ve NULL cho dung nghia "chua biet".
      try {
        if (item.pdfSizeBytes === 0) {
          await db.$executeRaw`UPDATE epaper_issues SET pdf_size_bytes = NULL WHERE id = ${item.id} AND pdf_size_bytes = 0`;
        }
        report.epaperIssues.unresolved++;
        report.epaperIssues.items.push({ ...item, measuredSize: null, status: 'giu NULL (mat file)' });
        log(`[epaper_issues] GIU NULL: so ${item.issueNumber} (${item.issueType}) [${item.title}] — khong tim thay file ${item.pdfPath}`);
      } catch (e) {
        report.epaperIssues.failed++;
        report.epaperIssues.items.push({ ...item, measuredSize: null, status: `loi: ${e?.message || e}` });
        log(`[epaper_issues] LOI: so ${item.issueNumber} — ${e?.message || e}`);
      }
      continue;
    }
    try {
      const n = await db.$executeRaw`UPDATE epaper_issues SET pdf_size_bytes = ${BigInt(size)} WHERE id = ${item.id}`;
      if (Number(n) === 1) {
        report.epaperIssues.changed++;
        report.epaperIssues.items.push({ ...item, measuredSize: size, status: 'ok' });
        log(`[epaper_issues] OK: so ${item.issueNumber} (${item.issueType}) -> pdf_size_bytes=${size}`);
      } else {
        report.epaperIssues.failed++;
        report.epaperIssues.items.push({ ...item, measuredSize: size, status: 'loi: khong doi duoc dong' });
        log(`[epaper_issues] LOI: so ${item.issueNumber} — khong doi duoc dong`);
      }
    } catch (e) {
      report.epaperIssues.failed++;
      report.epaperIssues.items.push({ ...item, measuredSize: size, status: `loi: ${e?.message || e}` });
      log(`[epaper_issues] LOI: so ${item.issueNumber} — ${e?.message || e}`);
    }
  }

  // Mo coi hien co (chi liet ke o ca 2 che do, KHONG xoa — viec xoa
  // can duyet "Duyet --apply" RIENG).
  const idRows = await db.$queryRaw`SELECT id FROM media_assets`;
  const mediaIds = new Set(idRows.map((r) => r.id));
  report.orphans = listOrphans(storageRoot, mediaIds);
  log(`[mo-coi] HLS thua: ${report.orphans.hls.count} thu muc, ${report.orphans.hls.bytes} B; chunk do dang: ${report.orphans.chunks.count} thu muc, ${report.orphans.chunks.bytes} B; thumb thua: ${report.orphans.thumbs.count} file, ${report.orphans.thumbs.bytes} B (chi liet ke, KHONG xoa — xoa can duyet --apply rieng)`);

  // Kiem chung sau apply: dem lai phai = 0 (tru so bao mat file, van NULL
  // co chu dich va da liet ke o unresolved).
  if (!dryRun) {
    const again = await db.$queryRaw`SELECT COUNT(*) AS n FROM media_assets WHERE file_type IS NULL`;
    const againPdf = await db.$queryRaw`SELECT COUNT(*) AS n FROM epaper_issues WHERE pdf_path IS NOT NULL AND (pdf_size_bytes IS NULL OR pdf_size_bytes = 0)`;
    const nullRemaining = Number(again?.[0]?.n ?? 0);
    const pdfRemaining = Number(againPdf?.[0]?.n ?? 0);
    report.verification = {
      nullFileTypeRemaining: nullRemaining,
      pdfSizeRemaining: pdfRemaining,
      pdfUnresolvedMissingFile: report.epaperIssues.unresolved,
      ok: nullRemaining === 0 && pdfRemaining === report.epaperIssues.unresolved,
    };
    log(`[kiem-chung] file_type NULL con lai: ${nullRemaining} (can 0); pdf_size_bytes NULL/0 con lai: ${pdfRemaining} (can = ${report.epaperIssues.unresolved} so mat file)`);
  }
  return report;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let helper;
  let storeMod;
  try {
    helper = await import(new URL('../dist/modules/uploads/upload.plan.js', import.meta.url).href);
    storeMod = await import(new URL('../dist/modules/uploads/local-store.js', import.meta.url).href);
  } catch (e) {
    console.error('Khong import duoc dist/modules/uploads/upload.plan.js hoac local-store.js — chay `npm run build` trong vtcany/backend truoc (can deploy ban moi nhat len backend).\n' + String(e?.message || e));
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Thieu DATABASE_URL trong env (container backend da co san bien nay).');
    process.exit(1);
  }
  const storageRoot = process.env.STORAGE_DIR || storeMod.storageRootDefault();
  let prismaMod;
  try {
    prismaMod = await import('@prisma/client');
  } catch (e) {
    console.error('Khong import duoc @prisma/client — chay `npx prisma generate` trong vtcany/backend truoc.\n' + String(e?.message || e));
    process.exit(1);
  }
  const db = new prismaMod.PrismaClient();
  try {
    const report = await runBackfill(db, {
      inferFileType: helper.inferFileType,
      storageRoot,
      dryRun: opts.dryRun,
      limit: opts.limit,
    });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const reportFile = join(process.cwd(), `backfill-d3-storage-report-${stamp}${opts.dryRun ? '-dry-run' : ''}.json`);
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('\n=== TOM TAT ===');
    console.log(`Che do: ${report.mode}`);
    console.log(`media_assets: file_type NULL ${report.mediaAssets.nullTotal}, se doi ${report.mediaAssets.toChange}, da doi ${report.mediaAssets.changed}, loi ${report.mediaAssets.failed}`);
    for (const [t, v] of Object.entries(report.mediaAssets.byType)) {
      console.log(`  - ${t}: ${v.files} file, ${v.bytes} B`);
    }
    console.log(`epaper_issues: pdf_size_bytes NULL ${report.epaperIssues.nullCount}, = 0 la ${report.epaperIssues.zeroCount}, se doi ${report.epaperIssues.toChange}, da doi ${report.epaperIssues.changed}, giu NULL (mat file) ${report.epaperIssues.unresolved}, loi ${report.epaperIssues.failed}`);
    console.log(`mo-coi (chi liet ke, KHONG xoa): HLS thua ${report.orphans.hls.count} thu muc / ${report.orphans.hls.bytes} B; chunk do dang ${report.orphans.chunks.count} thu muc / ${report.orphans.chunks.bytes} B; thumb thua ${report.orphans.thumbs.count} file / ${report.orphans.thumbs.bytes} B`);
    if (report.verification) {
      console.log(`Kiem chung: file_type NULL con ${report.verification.nullFileTypeRemaining}, pdf con ${report.verification.pdfSizeRemaining} (mat file ${report.verification.pdfUnresolvedMissingFile}) — ${report.verification.ok ? 'DAT' : 'CHUA DAT'}`);
    }
    console.log(`Bao cao: ${reportFile}`);
    if (opts.dryRun) console.log('Day la dry-run: KHONG ghi DB. Them --apply de chay that (sau khi pg_dump 2 bang va duyet so lieu).');
    if (report.mediaAssets.failed > 0 || report.epaperIssues.failed > 0 || (report.verification && !report.verification.ok)) process.exit(1);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

// Chi chay main khi goi truc tiep (node scripts/backfill-d3-storage.mjs);
// import vao test thi khong chay.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
