// Sua hang loat &nbsp; / U+00A0 — chay bu cho goi sua tan goc footer.
//   node scripts/backfill-nbsp-save.mjs [--dry-run] [--apply] [--limit N]
//
// Mac dinh DRY-RUN: chi in bao cao, KHONG ghi DB. Muon chay that: them --apply.
// Quy tac (giong he thong luu moi — tuc la chay bu = luu lai moi ban ghi
// qua helper chuan hoa):
//   - Ap dung CUNG helper normalizeNbspForSave (dist/common/normalize-nbsp.js,
//     build tu src/common/normalize-nbsp.ts): &nbsp;/&#160;/&#xa0;/U+00A0
//     thanh khoang trang thuong, tru so dien thoai va so + don vi (giu
//     khong ngat, doi entity thanh ky tu U+00A0 tho).
//   - Chi UPDATE ban ghi co it nhat 1 &nbsp; doi thanh khoang trang
//     thuong. Ban ghi chi co &nbsp; duoc giu (sdt / so + don vi) thi
//     KHONG bi cham, KHONG tinh la doi.
//   - Chi update dung truong da liet ke trong FIELD_SETS; cac truong
//     khac giu nguyen. Update bang Prisma nen cot updatedAt (@updatedAt)
//     se tang theo — khong sua updatedBy/createdBy.
//   - Idempotent: chay lai sau khi apply thi khong con gi de doi.
// Pham vi (khop dung cac o helper chuan hoa luc luu + audit SQL phan A):
//   news_articles title/sapo/body/meta_title/meta_description,
//   print_articles title/sapo/body,
//   site_settings value (key footer.description / footer.copyright),
//   newsroom_events title/description, liveblogs title/description,
//   liveblog_entries body, distribution_posts title/caption,
//   newsroom_ads name (KHONG dung html_content),
//   catalog_items/episodes/seasons/trailers data (JSON — duyet de quy
//   cac chuoi ben trong).
// NGOAI pham vi (nhu luc luu): news_categories.name, layout_blocks.*
//   (chi dem tham khao o audit), newsroom_ads.html_content.
// Yeu cau: chay TRONG container backend (terminal Coolify) sau khi
//   backend da deploy ban co helper + script nay (image build san
//   dist/ bang `npm run build`; DATABASE_URL lay tu env container).
//   node scripts/backfill-nbsp-save.mjs            (dry-run)
//   node scripts/backfill-nbsp-save.mjs --apply    (ghi that)
// Ma thoat: 0 = xong (dry-run hoac apply khong loi), 1 = co loi DB/Prisma
//   hoac co ban ghi update loi, 2 = tham so la.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Mau token &nbsp; (giong helper): thuc the &nbsp;/&#160;/&#xa0; (khong
// phan biet hoa thuong) + ky tu U+00A0 tho. Viet bang escape tuong minh,
// KHONG dung ky tu vo hinh literal trong file nay.
const NBSP_ENTITY_RE = /&nbsp;|&#160;|&#xa0;/gi;
const NBSP_CHAR_RE = /\u00A0/g;
const TAG_SPLIT_RE = /(<[^>]*>)/g;

// Dem so token &nbsp; trong phan TEXT cua chuoi (bo qua trong the <...> —
// helper cung chi xu ly phan text, khong dung vao thuoc tinh/href/src).
function countTokensInTextParts(text) {
  let n = 0;
  const parts = String(text).split(TAG_SPLIT_RE);
  for (let i = 0; i < parts.length; i += 2) {
    n += (parts[i].match(NBSP_ENTITY_RE) || []).length;
    n += (parts[i].match(NBSP_CHAR_RE) || []).length;
  }
  return n;
}

// Dem so ky tu U+00A0 tho trong phan TEXT cua chuoi da chuan hoa (= so
// token duoc GIU lai khong ngat: so dien thoai / so + don vi — moi token
// duoc giu cho dung 1 ky tu U+00A0 tho; token khong duoc giu thanh
// khoang trang thuong).
function countRawNbspInTextParts(text) {
  let n = 0;
  const parts = String(text).split(TAG_SPLIT_RE);
  for (let i = 0; i < parts.length; i += 2) {
    n += (parts[i].match(NBSP_CHAR_RE) || []).length;
  }
  return n;
}

// So &nbsp; doi thanh khoang trang thuong khi di tu ban goc sang ban da
// chuan hoa (= tong token - so token duoc giu). Ban ghi chi co &nbsp;
// duoc giu thi tra ve 0.
export function countChangedNbsp(original, normalized) {
  if (typeof original !== 'string' || typeof normalized !== 'string') return 0;
  const total = countTokensInTextParts(original);
  if (total === 0) return 0;
  const kept = countRawNbspInTextParts(normalized);
  return Math.max(0, total - kept);
}

// Chuan hoa 1 o chuoi. Tra ve { value, changed, kept, differs }:
// value = chuoi sau chuan hoa (nguyen ven neu khong phai chuoi),
// changed = so &nbsp; doi thanh khoang trang thuong,
// kept = so &nbsp; giu lai khong ngat (sdt / so + don vi),
// differs = chuoi co khac ban goc khong (ke ca chi doi entity -> ky tu
// tho trong phan duoc giu).
export function normalizeStringField(value, normalize) {
  if (typeof value !== 'string' || value === '') return { value, changed: 0, kept: 0, differs: false };
  const next = normalize(value);
  if (next === value) return { value, changed: 0, kept: 0, differs: false };
  const changed = countChangedNbsp(value, next);
  const kept = Math.max(0, countTokensInTextParts(value) - changed);
  return { value: next, changed, kept, differs: true };
}

// Chuan hoa cac o chuoi da liet ke cua 1 ban ghi (record phang).
// Tra ve { updates, perField, totalChanged, totalKept }: updates chi
// gom o co differs (chuoi khac ban goc); totalChanged la tong so &nbsp;
// doi thanh khoang trang thuong tren moi o.
export function normalizeRecordFields(record, fields, normalize) {
  const updates = {};
  const perField = {};
  let totalChanged = 0;
  let totalKept = 0;
  for (const f of fields) {
    const r = normalizeStringField(record[f], normalize);
    if (!r.differs) continue;
    updates[f] = r.value;
    perField[f] = { changed: r.changed, kept: r.kept };
    totalChanged += r.changed;
    totalKept += r.kept;
  }
  return { updates, perField, totalChanged, totalKept };
}

// Chuan hoa de quy gia tri JSON (catalog data): duyet moi chuoi ben
// trong (object/array long nhau). Tra ve { value, changed, kept }.
export function normalizeJsonValue(value, normalize) {
  if (typeof value === 'string') {
    const r = normalizeStringField(value, normalize);
    return { value: r.value, changed: r.changed, kept: r.kept };
  }
  if (Array.isArray(value)) {
    let changed = 0;
    let kept = 0;
    const out = value.map((v) => {
      const r = normalizeJsonValue(v, normalize);
      changed += r.changed;
      kept += r.kept;
      return r.value;
    });
    return { value: out, changed, kept };
  }
  if (value && typeof value === 'object') {
    let changed = 0;
    let kept = 0;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = normalizeJsonValue(v, normalize);
      changed += r.changed;
      kept += r.kept;
      out[k] = r.value;
    }
    return { value: out, changed, kept };
  }
  return { value, changed: 0, kept: 0 };
}

// Pham vi chay bu — khop dung cac o helper chuan hoa luc luu.
// model = ten delegate tren PrismaClient; label = ten bang de log/bao cao.
// siteSetting loc theo key; catalog dung jsonField (duyet de quy JSON).
export const FIELD_SETS = [
  { model: 'newsArticle', label: 'news_articles', fields: ['title', 'sapo', 'body', 'metaTitle', 'metaDescription'] },
  { model: 'printArticle', label: 'print_articles', fields: ['title', 'sapo', 'body'] },
  { model: 'siteSetting', label: 'site_settings', fields: ['value'], where: { key: { in: ['footer.description', 'footer.copyright'] } }, idLabel: 'key' },
  { model: 'newsroomEvent', label: 'newsroom_events', fields: ['title', 'description'] },
  { model: 'liveblog', label: 'liveblogs', fields: ['title', 'description'] },
  { model: 'liveblogEntry', label: 'liveblog_entries', fields: ['body'] },
  { model: 'distributionPost', label: 'distribution_posts', fields: ['title', 'caption'] },
  { model: 'newsroomAd', label: 'newsroom_ads', fields: ['name'] },
  { model: 'catalogItem', label: 'catalog_items', jsonField: 'data', extraSelect: ['entity'] },
  { model: 'catalogEpisode', label: 'catalog_episodes', jsonField: 'data' },
  { model: 'catalogSeason', label: 'catalog_seasons', jsonField: 'data' },
  { model: 'catalogTrailer', label: 'catalog_trailers', jsonField: 'data' },
];

export function parseArgs(argv) {
  const opts = { dryRun: true, limit: 0 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') opts.dryRun = false;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--limit') opts.limit = parseInt(argv[++i] || '0', 10) || 0;
    else if (a === '--help' || a === '-h') { console.log('Dung: node scripts/backfill-nbsp-save.mjs [--apply] [--dry-run] [--limit N]\nMac dinh dry-run (khong ghi DB). Them --apply de chay that.'); process.exit(0); }
    else { console.error(`Tham so la: ${a}`); process.exit(2); }
  }
  return opts;
}

function idShown(row, set) {
  if (set.idLabel === 'key') return `${row.id} [${row.key}]`;
  if (set.extraSelect && set.extraSelect.includes('entity') && row.entity) return `${row.id} [${row.entity}]`;
  return row.id;
}

// Chay bu tren 1 DB client (PrismaClient that, hoac client gia trong test).
// db phai co cac delegate FIELD_SETS[].model voi findMany({where, select,
// orderBy}) + update({where: {id}, data}). Loi findMany -> nem ra ngay
// (dung ca luot chay); loi update tung ban ghi -> ghi nhan, chay tiep
// ban khac, bao cao failed > 0 de main thoat ma 1.
export async function runBackfill(db, opts) {
  const { normalize, dryRun = true, limit = 0, log = console.log } = opts;
  const report = {
    mode: dryRun ? 'dry-run' : 'apply',
    at: new Date().toISOString(),
    tables: {},
    totals: { scanned: 0, toChange: 0, changed: 0, failed: 0, changedNbsp: 0, keptNbsp: 0 },
  };
  for (const set of FIELD_SETS) {
    const delegate = db[set.model];
    if (!delegate || typeof delegate.findMany !== 'function' || typeof delegate.update !== 'function') {
      throw new Error(`Khong co model ${set.model} trong DB client`);
    }
    const select = { id: true };
    if (set.fields) for (const f of set.fields) select[f] = true;
    if (set.jsonField) select[set.jsonField] = true;
    if (set.extraSelect) for (const f of set.extraSelect) select[f] = true;
    if (set.idLabel === 'key') select.key = true;
    const rows = await delegate.findMany({ where: set.where || {}, select, orderBy: { id: 'asc' } });
    const list = limit > 0 ? rows.slice(0, limit) : rows;
    const t = { scanned: list.length, toChange: 0, changed: 0, failed: 0, changedNbsp: 0, keptNbsp: 0, items: [] };
    for (const row of list) {
      let updates = null;
      let changed = 0;
      let kept = 0;
      let detail = '';
      if (set.jsonField) {
        const r = normalizeJsonValue(row[set.jsonField], normalize);
        changed = r.changed;
        kept = r.kept;
        if (changed > 0) {
          updates = { [set.jsonField]: r.value };
          detail = `${set.jsonField} (doi ${changed} &nbsp;, giu ${kept})`;
        }
      } else {
        const r = normalizeRecordFields(row, set.fields, normalize);
        changed = r.totalChanged;
        kept = r.totalKept;
        if (changed > 0) {
          updates = r.updates;
          detail = Object.entries(r.perField)
            .filter(([, v]) => v.changed > 0 || v.kept > 0)
            .map(([f, v]) => `${f} (doi ${v.changed}, giu ${v.kept})`)
            .join(', ');
        }
      }
      if (!updates) continue; // khong co &nbsp; doi thanh khoang trang -> khong cham
      t.toChange++;
      t.changedNbsp += changed;
      t.keptNbsp += kept;
      const shown = idShown(row, set);
      if (dryRun) {
        t.items.push({ id: row.id, label: set.label, detail, status: 'se-doi (dry-run)' });
        log(`[${set.label}] SE DOI (dry-run): ${shown} — ${detail}`);
        continue;
      }
      try {
        await delegate.update({ where: { id: row.id }, data: updates });
        t.changed++;
        t.items.push({ id: row.id, label: set.label, detail, status: 'ok' });
        log(`[${set.label}] OK: ${shown} — ${detail}`);
      } catch (e) {
        t.failed++;
        t.items.push({ id: row.id, label: set.label, detail, status: `loi: ${e?.message || e}` });
        log(`[${set.label}] LOI: ${shown} — ${e?.message || e}`);
      }
    }
    report.tables[set.label] = t;
    report.totals.scanned += t.scanned;
    report.totals.toChange += t.toChange;
    report.totals.changed += t.changed;
    report.totals.failed += t.failed;
    report.totals.changedNbsp += t.changedNbsp;
    report.totals.keptNbsp += t.keptNbsp;
  }
  return report;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let helper;
  try {
    helper = await import(new URL('../dist/common/normalize-nbsp.js', import.meta.url).href);
  } catch (e) {
    console.error('Khong import duoc dist/common/normalize-nbsp.js — chay `npm run build` trong vtcany/backend truoc (can deploy ban moi nhat len backend).\n' + String(e?.message || e));
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('Thieu DATABASE_URL trong env (container backend da co san bien nay).');
    process.exit(1);
  }
  let prismaMod;
  try {
    prismaMod = await import('@prisma/client');
  } catch (e) {
    console.error('Khong import duoc @prisma/client — chay `npx prisma generate` trong vtcany/backend truoc.\n' + String(e?.message || e));
    process.exit(1);
  }
  const db = new prismaMod.PrismaClient();
  try {
    const report = await runBackfill(db, { normalize: helper.normalizeNbspForSave, dryRun: opts.dryRun, limit: opts.limit });
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const reportFile = join(process.cwd(), `backfill-nbsp-save-report-${stamp}${opts.dryRun ? '-dry-run' : ''}.json`);
    writeFileSync(reportFile, JSON.stringify(report, null, 2));
    console.log('\n=== TOM TAT ===');
    console.log(`Che do: ${report.mode}`);
    for (const [label, t] of Object.entries(report.tables)) {
      console.log(`${label}: quet ${t.scanned}, se doi ${t.toChange}, da doi ${t.changed}, loi ${t.failed}, &nbsp; doi ${t.changedNbsp}, giu ${t.keptNbsp}`);
    }
    console.log(`TONG: quet ${report.totals.scanned}, se doi ${report.totals.toChange}, da doi ${report.totals.changed}, loi ${report.totals.failed}, &nbsp; doi ${report.totals.changedNbsp}, giu ${report.totals.keptNbsp}`);
    console.log(`Bao cao: ${reportFile}`);
    if (opts.dryRun) console.log('Day la dry-run: KHONG ghi DB. Them --apply de chay that (sau khi duyet so lieu).');
    if (report.totals.failed > 0) process.exit(1);
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

// Chi chay main khi goi truc tiep (node scripts/backfill-nbsp-save.mjs);
// import vao test thi khong chay.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
