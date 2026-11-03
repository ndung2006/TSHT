// Test seed SQL cua migration quy trinh duyet — doc truc tiep file
// migration.sql, doi chieu voi fallback trong code. Dam bao seed nap
// NGUYEN TRANG thu tu + nhan cua ca 7 luong hien co + video, khong lech
// du lieu giua SQL va mang cung (neu lech, backend se chay khac nhau tuy
// DB da chay migration hay chua).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EPAPER_WORKFLOW_STEPS } from '../epaper/epaper-workflow.ts';
import { NEWS_WORKFLOW_STEPS } from '../news/news-workflow.ts';
import { PRINT_ARTICLE_WORKFLOW_STEPS } from '../print-articles/print-article-workflow.ts';
import { EVENT_WORKFLOW_STEPS } from '../events/events-workflow.ts';
import { LIVEBLOG_WORKFLOW_STEPS } from '../liveblog/liveblog-workflow.ts';
import { AD_WORKFLOW_STEPS } from '../ads/ads-workflow.ts';
import { ROYALTY_WORKFLOW_STEPS } from '../royalties/royalties-workflow.ts';

// Gia tri ky vong cho seed SQL: lay truc tiep tu mang cung (nguon goc)
// + nhan phan he/tac gia da chot. Neu SQL lech voi mang cung, test rot.
const EXPECTED_META = {
  epaper: { label: 'Báo in', authorRole: 'KTV', authorLabel: 'KTV — Kỹ thuật viên (Chế bản/Dàn trang)', enabled: true },
  news: { label: 'Báo điện tử', authorRole: 'PV', authorLabel: 'PV — Phóng viên (tác giả)', enabled: true },
  'print-article': { label: 'Bài báo in', authorRole: 'KTV', authorLabel: 'KTV — Kỹ thuật viên (Chế bản/Dàn trang)', enabled: true },
  events: { label: 'Sự kiện tòa soạn', authorRole: 'QLSK', authorLabel: 'QLSK', enabled: true },
  liveblog: { label: 'Tường thuật trực tiếp', authorRole: 'PVTT', authorLabel: 'PVTT', enabled: true },
  ads: { label: 'Quảng cáo tòa soạn', authorRole: 'QL-QC', authorLabel: 'QL-QC', enabled: true },
  royalties: { label: 'Nhuận bút', authorRole: 'TP', authorLabel: 'TP', enabled: true },
  video: { label: 'Video/Truyền hình/Phát thanh', authorRole: null, authorLabel: null, enabled: false },
};
const EXPECTED_STEPS = {
  epaper: EPAPER_WORKFLOW_STEPS,
  news: NEWS_WORKFLOW_STEPS,
  'print-article': PRINT_ARTICLE_WORKFLOW_STEPS,
  events: EVENT_WORKFLOW_STEPS,
  liveblog: LIVEBLOG_WORKFLOW_STEPS,
  ads: AD_WORKFLOW_STEPS,
  royalties: ROYALTY_WORKFLOW_STEPS,
  video: [{ key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT' }],
};

const here = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(here, '../../../prisma/migrations/20261103190000_workflow_definitions/migration.sql'), 'utf8');

function blockAfter(marker) {
  const i = sql.indexOf(marker);
  assert.ok(i >= 0, `khong thay ${marker}`);
  const rest = sql.slice(i);
  const end = rest.indexOf(';');
  return rest.slice(0, end);
}

function parseDefs() {
  const block = blockAfter('INSERT INTO "workflow_definitions"');
  const rows = [];
  const re = /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(NULL|'[^']*'),\s*(NULL|'[^']*'),\s*(true|false)\s*\)/g;
  for (const m of block.matchAll(re)) {
    const unq = (v) => (v === 'NULL' ? null : v.slice(1, -1));
    rows.push({ id: m[1], moduleKey: m[2], label: m[3], authorRole: unq(m[4]), authorLabel: unq(m[5]), enabled: m[6] === 'true' });
  }
  return rows;
}

function parseSteps() {
  const block = blockAfter('INSERT INTO "workflow_steps"');
  const rows = [];
  const re = /\(\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*'([^']*)',\s*(\d+),\s*'([^']*)',\s*(true|false)\s*\)/g;
  for (const m of block.matchAll(re)) {
    rows.push({ id: m[1], definitionId: m[2], key: m[3], label: m[4], roleName: m[5], sortOrder: Number(m[6]), returnTo: m[7], allowEmergency: m[8] === 'true' });
  }
  return rows;
}

test('(f) seed du 8 dinh nghia, khop fallback (nhan, thu tu, role)', () => {
  const defs = parseDefs();
  assert.equal(defs.length, 8);
  const steps = parseSteps();
  const defById = new Map(defs.map((d) => [d.id, d]));
  assert.ok(defs.every((d) => d.id === `wf-${d.moduleKey}`));

  for (const key of Object.keys(EXPECTED_META)) {
    const fb = EXPECTED_META[key];
    const def = defs.find((d) => d.moduleKey === key);
    assert.ok(def, `thieu definition ${key}`);
    assert.equal(def.label, fb.label);
    assert.equal(def.authorRole, fb.authorRole);
    assert.equal(def.authorLabel, fb.authorLabel);
    assert.equal(def.enabled, fb.enabled);
    const mine = steps.filter((s) => defById.get(s.definitionId)?.moduleKey === key).sort((a, b) => a.sortOrder - b.sortOrder);
    assert.deepEqual(mine.map((s) => ({ key: s.key, label: s.label, roleName: s.roleName })), EXPECTED_STEPS[key].map((s) => ({ key: s.key, label: s.label, roleName: s.roleName })));
    assert.ok(mine.every((s) => s.returnTo === 'creator' && s.allowEmergency === false));
  }
  // Video: mac dinh tat, 1 buoc TBT.
  const video = defs.find((d) => d.moduleKey === 'video');
  assert.equal(video.enabled, false);
  assert.equal(steps.filter((s) => s.definitionId === video.id).length, 1);
});
