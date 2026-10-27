import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkPatch, isIssueType, issueSlug, issueUrl, parsePublishDate } from './dist/modules/epaper/epaper.utils.js';

test('issueType chi nhan thuong hoac vung_cao', () => {
  assert.equal(isIssueType('thuong'), true);
  assert.equal(isIssueType('vung_cao'), true);
  assert.equal(isIssueType('THUONG'), false);
  assert.equal(isIssueType(''), false);
});

test('slug gan voi publicId, doi loai khong doi slug/URL', () => {
  const slug = issueSlug(559, 'abcdef0123456789abcdef01');
  assert.equal(slug, 'bao-tuyen-quang-so-559-abcdef0123456789abcdef01');
  assert.equal(issueUrl(slug), '/bao-in/bao-tuyen-quang-so-559-abcdef0123456789abcdef01');
});

test('publishDate phai dang YYYY-MM-DD va la ngay ton tai', () => {
  assert.notEqual(parsePublishDate('2026-10-26'), null);
  assert.equal(parsePublishDate('26/10/2026'), null);
  assert.equal(parsePublishDate('2026-02-30'), null);
  assert.equal(parsePublishDate('2026-13-01'), null);
});

test('so da xuat ban khong doi duoc so bao, du co ly do', () => {
  const r = checkPatch(true, { issueNumber: 559 }, { issueNumber: 560, changeReason: 'nham' });
  assert.equal(r.ok, false);
});

test('sua so da xuat ban bat buoc changeReason', () => {
  assert.equal(checkPatch(true, { issueNumber: 559 }, { issueType: 'vung_cao' }).ok, false);
  assert.equal(checkPatch(true, { issueNumber: 559 }, { issueType: 'vung_cao', changeReason: '  ' }).ok, false);
  assert.equal(checkPatch(true, { issueNumber: 559 }, { issueType: 'vung_cao', changeReason: 'so vung cao' }).ok, true);
});

test('so nhap sua khong can ly do, loai sai van bi chan', () => {
  assert.equal(checkPatch(false, { issueNumber: 559 }, { issueType: 'vung_cao' }).ok, true);
  assert.equal(checkPatch(false, { issueNumber: 559 }, { issueType: 'la' }).ok, false);
});
