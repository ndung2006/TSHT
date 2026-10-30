// Test logic thuan cho thu muc Thu vien media (Goi 2D-1) — chay bang
// node --test (Node type-stripping doc thang .ts goc).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanFolderName, foldersWithCounts, parseFolderFilter, wouldCreateCycle,
} from './src/modules/uploads/media-folders.ts';
import { mergeAndPage, normalizeMediaQuery } from './src/modules/uploads/media-library-map.ts';

test('cleanFolderName: trim + gom khoang trang', () => {
  assert.equal(cleanFolderName('  Anh   su kien  '), 'Anh su kien');
  assert.equal(cleanFolderName(''), null);
  assert.equal(cleanFolderName('   '), null);
  assert.equal(cleanFolderName(42), null);
  assert.equal(cleanFolderName('x'.repeat(121)), null);
  assert.equal(cleanFolderName('x'.repeat(120)), 'x'.repeat(120));
});

test('parseFolderFilter: undefined / root / id', () => {
  assert.equal(parseFolderFilter(undefined), undefined);
  assert.equal(parseFolderFilter(''), undefined);
  assert.equal(parseFolderFilter('root'), null);
  assert.equal(parseFolderFilter('abc-123'), 'abc-123');
});

const FOLDERS = [
  { id: 'a', name: 'A', parentId: null },
  { id: 'b', name: 'B', parentId: 'a' },
  { id: 'c', name: 'C', parentId: 'b' },
  { id: 'd', name: 'D', parentId: null },
];

test('wouldCreateCycle: chinh no / hau due / hop le', () => {
  assert.equal(wouldCreateCycle(FOLDERS, 'a', 'a'), true);
  assert.equal(wouldCreateCycle(FOLDERS, 'a', 'c'), true); // c la hau due cua a
  assert.equal(wouldCreateCycle(FOLDERS, 'c', 'a'), false);
  assert.equal(wouldCreateCycle(FOLDERS, 'a', null), false);
  assert.equal(wouldCreateCycle(FOLDERS, 'a', 'd'), false);
});

test('foldersWithCounts: depth + totalCount cong don len to tien', () => {
  const counts = new Map([['a', 1], ['b', 2], ['c', 4], ['d', 8]]);
  const out = foldersWithCounts(FOLDERS, counts);
  assert.deepEqual(out.map((r) => r.id), ['a', 'b', 'c', 'd']); // cay: cha truoc con
  const byId = new Map(out.map((r) => [r.id, r]));
  assert.equal(byId.get('a').depth, 0);
  assert.equal(byId.get('b').depth, 1);
  assert.equal(byId.get('c').depth, 2);
  assert.equal(byId.get('c').totalCount, 4);
  assert.equal(byId.get('b').totalCount, 6); // 2 + 4
  assert.equal(byId.get('a').totalCount, 7); // 1 + 2 + 4
  assert.equal(byId.get('d').totalCount, 8);
});

test('foldersWithCounts: thu muc mo coi (cha khong ton tai) coi nhu goc', () => {
  const out = foldersWithCounts([{ id: 'x', name: 'X', parentId: 'ghost' }], new Map());
  assert.equal(out.length, 1);
  assert.equal(out[0].parentId, null);
  assert.equal(out[0].depth, 0);
});

test('normalizeMediaQuery: folderId', () => {
  assert.equal(normalizeMediaQuery({}).folderId, undefined);
  assert.equal(normalizeMediaQuery({ folderId: 'root' }).folderId, null);
  assert.equal(normalizeMediaQuery({ folderId: 'f1' }).folderId, 'f1');
});

test('mergeAndPage: loc theo folderId + giu folderId cua DB khi merge memory', () => {
  const db = [
    { id: '1', filename: 'a.png', kind: 'image', contentType: '', sizeBytes: 1, url: '', posterUrl: '', status: 'done', createdAt: 3, folderId: 'f1' },
    { id: '2', filename: 'b.png', kind: 'image', contentType: '', sizeBytes: 1, url: '', posterUrl: '', status: 'done', createdAt: 2, folderId: null },
    { id: '3', filename: 'c.png', kind: 'image', contentType: '', sizeBytes: 1, url: '', posterUrl: '', status: 'done', createdAt: 1, folderId: 'f1' },
  ];
  const memory = [
    { id: '1', filename: 'a.png', kind: 'image', contentType: '', sizeBytes: 1, url: 'u', posterUrl: '', status: 'done', createdAt: 3 },
  ];
  const all = mergeAndPage(db, memory, { kind: null, q: '', page: 1, limit: 20, folderId: undefined });
  assert.equal(all.total, 3);
  assert.equal(all.data.find((i) => i.id === '1').folderId, 'f1'); // memory khong xoa folderId
  const inF1 = mergeAndPage(db, memory, { kind: null, q: '', page: 1, limit: 20, folderId: 'f1' });
  assert.deepEqual(inF1.data.map((i) => i.id), ['1', '3']);
  const root = mergeAndPage(db, memory, { kind: null, q: '', page: 1, limit: 20, folderId: null });
  assert.deepEqual(root.data.map((i) => i.id), ['2']);
});
