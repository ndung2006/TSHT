// Test cho scripts/backfill-nbsp-save.mjs — sua hang loat &nbsp; / U+00A0.
//
// Chay: node --test --import=./test-hooks-register.mjs \
//        scripts/backfill-nbsp-save.test.mjs   (tu vtcany/backend)
//
// Khong can DB that: runBackfill nhan DB client gia (mock) co cac
// delegate findMany/update giong PrismaClient. Helper that duoc import
// tu src/common/normalize-nbsp.ts (that).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countChangedNbsp,
  normalizeRecordFields,
  normalizeJsonValue,
  runBackfill,
  parseArgs,
  FIELD_SETS,
} from './backfill-nbsp-save.mjs';
import { normalizeNbspForSave } from '../src/common/normalize-nbsp.ts';

// DB gia: luu tru bang goc trong store; findMany tra ban sao; update ghi
// vao store + ghi lai loi goi (de chung minh dry-run khong ghi, apply
// chi update ban ghi co khac).
function mockDb(seed) {
  const calls = { updates: [] };
  const store = {};
  const db = {};
  for (const set of FIELD_SETS) {
    const rows = seed[set.model] || [];
    store[set.model] = rows.map((r) => ({ ...r }));
    db[set.model] = {
      findMany: async () => store[set.model].map((r) => ({ ...r })),
      update: async ({ where, data }) => {
        const row = store[set.model].find((r) => r.id === where.id);
        if (!row) throw new Error(`khong tim thay ${set.model} ${where.id}`);
        Object.assign(row, data);
        calls.updates.push({ model: set.model, id: where.id, data });
        return { ...row };
      },
    };
  }
  return { db, calls, store };
}

const silent = () => {};

test('countChangedNbsp: dem dung so &nbsp; doi thanh khoang trang', () => {
  assert.equal(countChangedNbsp('a&nbsp;b&nbsp;c', 'a b c'), 2);
  assert.equal(countChangedNbsp('a&nbsp;b', 'a b'), 1);
  assert.equal(countChangedNbsp('khong co gi', 'khong co gi'), 0);
  // Ky tu U+00A0 tho doi thanh khoang trang cung tinh.
  assert.equal(countChangedNbsp('a  b', 'a b'), 1);
  // Thuc the viet hoa cung tinh.
  assert.equal(countChangedNbsp('a&NBSP;b', 'a b'), 1);
});

test('countChangedNbsp: sdt / so + don vi duoc giu thi KHONG tinh la doi', () => {
  assert.equal(countChangedNbsp('Lien he 0215&nbsp;3824624', 'Lien he 0215 3824624'), 0);
  assert.equal(countChangedNbsp('5&nbsp;kg', '5 kg'), 0);
  assert.equal(countChangedNbsp('37,5&nbsp;°C', '37,5 °C'), 0);
  // Hon hop: 2 &nbsp; giua tu doi, 1 &nbsp; trong sdt giu.
  assert.equal(
    countChangedNbsp('Bo&nbsp;Van&nbsp;hoa, goi 0215&nbsp;3824624', 'Bo Van hoa, goi 0215 3824624'),
    2,
  );
});

test('countChangedNbsp: &nbsp; trong the HTML khong bi dem', () => {
  assert.equal(
    countChangedNbsp('<p title="a&nbsp;b">x&nbsp;y</p>', '<p title="a&nbsp;b">x y</p>'),
    1,
  );
});

test('normalizeRecordFields: chi tra o khac ban goc, dem dung changed/kept', () => {
  const r = normalizeRecordFields(
    {
      title: 'Tieu de sach',
      body: '<p>Bo&nbsp;Van&nbsp;hoa, goi 0215&nbsp;3824624</p>',
      sapo: 'Sapo sach',
    },
    ['title', 'sapo', 'body'],
    normalizeNbspForSave,
  );
  assert.deepEqual(Object.keys(r.updates).sort(), ['body']);
  assert.equal(r.totalChanged, 2);
  assert.equal(r.totalKept, 1);
  assert.equal(r.updates.body, '<p>Bo Van hoa, goi 0215 3824624</p>');
});

test('normalizeJsonValue: duyet de quy chuoi trong JSON catalog', () => {
  const r = normalizeJsonValue(
    { title: 'A&nbsp;B', nested: { desc: 'x&nbsp;y' }, n: 3, tags: ['p&nbsp;q', 'sach'], flag: true },
    normalizeNbspForSave,
  );
  assert.equal(r.changed, 3);
  assert.equal(r.value.title, 'A B');
  assert.equal(r.value.nested.desc, 'x y');
  assert.equal(r.value.tags[0], 'p q');
  assert.equal(r.value.n, 3);
  assert.equal(r.value.flag, true);
});

test('runBackfill dry-run: KHONG ghi gi, bao dung so se doi', async () => {
  const seed = {
    newsArticle: [
      { id: 'n1', title: 'Bai&nbsp;sach', sapo: '', body: '<p>Bo&nbsp;Van&nbsp;hoa</p>', metaTitle: null, metaDescription: null },
      { id: 'n2', title: 'Bai sach', sapo: '', body: 'Noi dung sach', metaTitle: null, metaDescription: null },
    ],
    printArticle: [
      { id: 'p1', title: 'In', sapo: '', body: 'Day&nbsp;la&nbsp;bai&nbsp;in' },
    ],
    siteSetting: [
      { id: 's1', key: 'footer.description', value: '<p>TONG&nbsp;BIEN&nbsp;TAP</p>' },
    ],
  };
  const { db, calls, store } = mockDb(seed);
  const logs = [];
  const report = await runBackfill(db, { normalize: normalizeNbspForSave, dryRun: true, log: (m) => logs.push(m) });
  assert.equal(calls.updates.length, 0, 'dry-run khong duoc goi update');
  assert.equal(report.totals.toChange, 3);
  assert.equal(report.totals.changed, 0);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.tables.news_articles.toChange, 1);
  assert.equal(report.tables.print_articles.toChange, 1);
  assert.equal(report.tables.site_settings.toChange, 1);
  // Ban ghi goc khong bi cham.
  assert.equal(store.newsArticle[0].body, '<p>Bo&nbsp;Van&nbsp;hoa</p>');
  // Log tung ban ghi se doi (co id + so &nbsp;).
  assert.ok(logs.some((l) => l.includes('n1') && l.includes('doi 2')));
  assert.ok(logs.some((l) => l.includes('s1') && l.includes('footer.description')));
});

test('runBackfill apply: chi update ban ghi co &nbsp; doi; sdt / don vi KHONG bi cham', async () => {
  const seed = {
    newsArticle: [
      { id: 'n1', title: 'T', sapo: '', body: '<p>Bo&nbsp;Van&nbsp;hoa</p>', metaTitle: null, metaDescription: null },
      { id: 'n2', title: 'T sach', sapo: '', body: 'Sach', metaTitle: null, metaDescription: null },
      { id: 'n3', title: 'T', sapo: '', body: 'Lien he 0215&nbsp;3824624', metaTitle: null, metaDescription: null },
      { id: 'n4', title: 'T', sapo: '', body: 'Can nang 5&nbsp;kg', metaTitle: null, metaDescription: null },
      { id: 'n5', title: 'T', sapo: '', body: '<p>Bo&nbsp;Van&nbsp;hoa, goi 0215&nbsp;3824624</p>', metaTitle: null, metaDescription: null },
    ],
    siteSetting: [
      { id: 's1', key: 'footer.description', value: '<p>TONG&nbsp;BIEN&nbsp;TAP:&nbsp;VU&nbsp;VAN&nbsp;THUONG</p>' },
    ],
  };
  const { db, calls, store } = mockDb(seed);
  const report = await runBackfill(db, { normalize: normalizeNbspForSave, dryRun: false, log: silent });
  assert.deepEqual(
    calls.updates.map((u) => u.id).sort(),
    ['n1', 'n5', 's1'],
    'chi update ban ghi co &nbsp; doi thanh khoang trang',
  );
  // Ban sach + ban chi co sdt/don vi khong bi cham.
  assert.equal(store.newsArticle[1].body, 'Sach');
  assert.equal(store.newsArticle[2].body, 'Lien he 0215&nbsp;3824624');
  assert.equal(store.newsArticle[3].body, 'Can nang 5&nbsp;kg');
  // Ban doi: &nbsp; giua tu thanh khoang trang, sdt giu U+00A0 tho.
  assert.equal(store.newsArticle[0].body, '<p>Bo Van hoa</p>');
  assert.equal(store.newsArticle[4].body, '<p>Bo Van hoa, goi 0215 3824624</p>');
  assert.equal(store.siteSetting[0].value, '<p>TONG BIEN TAP: VU VAN THUONG</p>');
  assert.equal(report.totals.toChange, 3);
  assert.equal(report.totals.changed, 3);
  assert.equal(report.totals.failed, 0);
  assert.equal(report.totals.changedNbsp, 2 + 2 + 5);
  assert.equal(report.totals.keptNbsp, 1);
});

test('runBackfill apply: catalog JSON chi update khi co chuoi doi', async () => {
  const seed = {
    catalogItem: [
      { id: 'c1', entity: 'videos', data: { title: 'A&nbsp;B', desc: 'sach' } },
      { id: 'c2', entity: 'shorts', data: { title: 'Sach', desc: 'sach' } },
    ],
  };
  const { db, calls, store } = mockDb(seed);
  const report = await runBackfill(db, { normalize: normalizeNbspForSave, dryRun: false, log: silent });
  assert.equal(calls.updates.length, 1);
  assert.equal(calls.updates[0].id, 'c1');
  assert.equal(store.catalogItem[0].data.title, 'A B');
  assert.equal(store.catalogItem[1].data.title, 'Sach');
  assert.equal(report.tables.catalog_items.toChange, 1);
  assert.equal(report.tables.catalog_items.changedNbsp, 1);
});

test('runBackfill apply: loi update 1 ban ghi khong dung cac ban khac, failed > 0', async () => {
  const seed = {
    newsArticle: [
      { id: 'n1', title: 'T', sapo: '', body: 'A&nbsp;B', metaTitle: null, metaDescription: null },
      { id: 'n2', title: 'T', sapo: '', body: 'C&nbsp;D', metaTitle: null, metaDescription: null },
    ],
  };
  const { db, calls, store } = mockDb(seed);
  db.newsArticle.update = async ({ where, data }) => {
    if (where.id === 'n1') throw new Error('loi gia lap');
    const row = store.newsArticle.find((r) => r.id === where.id);
    Object.assign(row, data);
    calls.updates.push({ model: 'newsArticle', id: where.id, data });
    return { ...row };
  };
  const logs = [];
  const report = await runBackfill(db, { normalize: normalizeNbspForSave, dryRun: false, log: (m) => logs.push(m) });
  assert.equal(report.tables.news_articles.failed, 1);
  assert.equal(report.tables.news_articles.changed, 1);
  assert.equal(report.totals.failed, 1);
  assert.equal(store.newsArticle[1].body, 'C D', 'ban sau loi van duoc xu ly');
  assert.ok(logs.some((l) => l.includes('LOI') && l.includes('n1')));
});

test('runBackfill: khong co model trong client thi nem loi (khong im lang)', async () => {
  const { db } = mockDb({});
  delete db.printArticle;
  await assert.rejects(
    runBackfill(db, { normalize: normalizeNbspForSave, dryRun: true, log: silent }),
    /Khong co model printArticle/,
  );
});

test('FIELD_SETS: dung pham vi da chot, loai news_categories + layout_blocks', () => {
  assert.deepEqual(
    FIELD_SETS.map((s) => s.model),
    [
      'newsArticle', 'printArticle', 'siteSetting', 'newsroomEvent',
      'liveblog', 'liveblogEntry', 'distributionPost', 'newsroomAd',
      'catalogItem', 'catalogEpisode', 'catalogSeason', 'catalogTrailer',
    ],
  );
  assert.ok(!FIELD_SETS.some((s) => s.model === 'newsCategory' || s.model === 'layoutBlock'));
  const ads = FIELD_SETS.find((s) => s.model === 'newsroomAd');
  assert.deepEqual(ads.fields, ['name'], 'ads chi chuan hoa name, khong dung html_content');
});

test('parseArgs: mac dinh dry-run, --apply moi ghi', () => {
  assert.equal(parseArgs([]).dryRun, true);
  assert.equal(parseArgs(['--apply']).dryRun, false);
  assert.equal(parseArgs(['--apply', '--dry-run']).dryRun, true);
  assert.equal(parseArgs(['--limit', '5']).limit, 5);
});
