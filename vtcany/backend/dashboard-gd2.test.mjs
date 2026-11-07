// Test GĐ2 dashboard (widget D3 luu tru) — file thuan, node --test truc tiep.
//   node --test --import ./test-hooks-register.mjs dashboard-gd2.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ALL_WIDGETS,
  EPG_TODAY_ALERT_CUTOFF_HOUR,
  EPG_TODAY_ALERT_CUTOFF_MINUTE,
  ROLE_LAYOUT,
  WIDGET_META,
  resolveLayout,
} from './src/modules/dashboard/dashboard-layout.config.ts';
import { buildStorageRows, fmtBytes, isPastDailyCutoff, measureHlsStorage, sumMediaSizes, vnHourOf, filterMyQueue, countMembersByRole } from './src/modules/dashboard/dashboard-helpers.ts';
import { inferFileType, planUpload } from './src/modules/uploads/upload.plan.ts';
import { stepRolesFromDefinitions } from './src/modules/dashboard/dashboard-queries.ts';

describe('D3 thuoc tap widget tu GĐ2, dung role moi thay', () => {
  it('ALL_WIDGETS = 16 GĐ1 + D3, meta D3 tier D', () => {
    assert.equal(ALL_WIDGETS.length, 17);
    assert.ok(ALL_WIDGETS.includes('D3'));
    assert.equal(WIDGET_META.D3.title, 'Lưu trữ');
    assert.equal(WIDGET_META.D3.tier, 'D');
  });
  it('Admin (quan tri chung, khong *) co D3 sau D2; role khac khong co D3', () => {
    assert.deepEqual(resolveLayout('Admin', false), ['D5', 'B7', 'D1', 'D2', 'D3', 'D4', 'E1']);
    for (const [role, layout] of Object.entries(ROLE_LAYOUT)) {
      if (role === 'Admin') continue;
      assert.ok(!layout.includes('D3'), `${role} le ra khong co D3`);
    }
  });
  it('full-admin thay D3', () => {
    assert.ok(resolveLayout('PV', true).includes('D3'));
  });
});

describe('gom sizeBytes theo fileType (D3)', () => {
  it('gom dung loai, dem ca row khong co sizeBytes, thu tu co dinh', () => {
    const rows = sumMediaSizes([
      { fileType: 'video', sizeBytes: 1000 },
      { fileType: 'image', sizeBytes: 2000 },
      { fileType: 'video', sizeBytes: BigInt(3000) },
      { fileType: 'audio', sizeBytes: null },
      { fileType: null, sizeBytes: 500 },
      { fileType: 'subtitle', sizeBytes: 700 },
      { fileType: 'weird', sizeBytes: 11 },
    ]);
    assert.deepEqual(rows.map((r) => r.type), ['image', 'video', 'audio', 'subtitle', '__other__', '__null__']);
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    assert.deepEqual([byType.image.files, byType.image.bytes], [1, 2000]);
    assert.deepEqual([byType.video.files, byType.video.bytes], [2, 4000]);
    assert.deepEqual([byType.audio.files, byType.audio.bytes], [1, 0]);
    assert.deepEqual([byType.subtitle.files, byType.subtitle.bytes], [1, 700]);
    assert.deepEqual([byType.__other__.files, byType.__other__.bytes], [1, 11]);
    assert.deepEqual([byType.__null__.files, byType.__null__.bytes], [1, 500]);
    assert.equal(byType.__null__.label, 'Chưa phân loại');
  });
  it('rong -> khong co dong nao', () => {
    assert.deepEqual(sumMediaSizes([]), []);
  });
});

describe('gio chot canh bao EPG hom nay (D5) — AIO len lich luc 07:05 chinh ngay', () => {
  it('gio chot 07:30 nam trong pham vi (gia tri cu the do user chot, test khong khoa)', () => {
    assert.ok(Number.isInteger(EPG_TODAY_ALERT_CUTOFF_HOUR));
    assert.ok(EPG_TODAY_ALERT_CUTOFF_HOUR >= 0 && EPG_TODAY_ALERT_CUTOFF_HOUR <= 23);
    assert.ok(Number.isInteger(EPG_TODAY_ALERT_CUTOFF_MINUTE));
    assert.ok(EPG_TODAY_ALERT_CUTOFF_MINUTE >= 0 && EPG_TODAY_ALERT_CUTOFF_MINUTE <= 59);
  });
  it('vnHourOf lay gio VN, isPastDailyCutoff so dung gio + phut', () => {
    assert.equal(vnHourOf(new Date('2026-11-04T10:00:00+07:00')), 10);
    assert.equal(vnHourOf(new Date('2026-11-04T18:30:00+07:00')), 18);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T10:00:00+07:00'), 17), false);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T17:00:00+07:00'), 17), true);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T18:30:00+07:00'), 17), true);
  });
  it('gio chot 07:30: 07:29 chua canh bao, 07:30 va sau do canh bao', () => {
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T07:00:00+07:00'), 7, 30), false);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T07:29:00+07:00'), 7, 30), false);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T07:30:00+07:00'), 7, 30), true);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T08:00:00+07:00'), 7, 30), true);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T07:29:00+07:00'), EPG_TODAY_ALERT_CUTOFF_HOUR, EPG_TODAY_ALERT_CUTOFF_MINUTE), false);
    assert.equal(isPastDailyCutoff(new Date('2026-11-04T07:30:00+07:00'), EPG_TODAY_ALERT_CUTOFF_HOUR, EPG_TODAY_ALERT_CUTOFF_MINUTE), true);
  });
});

describe('A1 phai tra role buoc bang workflowKey (loi bai bao in 2026-11-04)', () => {
  it("module 'print-article' (workflowKey) thay MD o buoc 1; meta.key 'printArticle' thi khong", () => {
    const roles = stepRolesFromDefinitions([
      { moduleKey: 'print-article', steps: [
        { roleName: 'MD', sortOrder: 1 }, { roleName: 'T.PP', sortOrder: 2 },
        { roleName: 'P.TBT', sortOrder: 3 }, { roleName: 'TBT', sortOrder: 4 },
      ] },
    ]);
    const item = { module: 'print-article', workflowStep: 1, status: 'pending_review', createdBy: 'ktv-1', approvalActorIds: [] };
    const md = { id: 'md-1', roleName: 'MD', isFullAdmin: false };
    assert.equal(filterMyQueue([item], md, roles).length, 1);
    // Bay cu: wA1 truyen meta.key 'printArticle' -> tra role ra undefined -> A1 luon rong.
    assert.equal(filterMyQueue([{ ...item, module: 'printArticle' }], md, roles).length, 0);
  });
});

describe('B7 dem thanh vien theo role hieu luc, loai user khoa', () => {
  it('uu tien role quan he, fallback cot roleName, bo qua disabled va rong', () => {
    const m = countMembersByRole([
      { roleName: null, status: 'active', role: { name: 'TBT' } },
      { roleName: 'TBT', status: 'active', role: null },
      { roleName: 'TBT', status: 'disabled', role: null },
      { roleName: null, status: 'active', role: null },
      { roleName: 'MD', status: 'active', role: { name: null } },
    ]);
    assert.equal(m.get('tbt'), 2);
    assert.equal(m.get('md'), 1);
    assert.equal(m.size, 2);
  });
});

describe('fmtBytes', () => {
  it('B/KB/MB/GB dung don vi, so le kieu Viet Nam', () => {
    assert.equal(fmtBytes(0), '0 B');
    assert.equal(fmtBytes(512), '512 B');
    assert.equal(fmtBytes(2048), '2 KB');
    assert.equal(fmtBytes(1536), '1,5 KB');
    assert.equal(fmtBytes(5 * 1024 * 1024), '5 MB');
    assert.equal(fmtBytes(3 * 1024 * 1024 * 1024), '3 GB');
  });
});

describe('inferFileType (D3): suy loai file tu MIME + duoi file', () => {
  it('MIME co prefix nhan dang duoc -> loai do', () => {
    assert.equal(inferFileType('a.bin', 'video/mp4'), 'video');
    assert.equal(inferFileType('a.bin', 'audio/mpeg'), 'audio');
    assert.equal(inferFileType('a.bin', 'image/png'), 'image');
    assert.equal(inferFileType('a.bin', 'application/pdf'), 'pdf');
    assert.equal(inferFileType('a.bin', 'text/vtt'), 'subtitle');
    assert.equal(inferFileType('a.bin', 'video/mp4; codecs="avc1"'), 'video');
  });
  it('MIME thieu/chung chung -> suy tu duoi file', () => {
    assert.equal(inferFileType('song.mp3', ''), 'audio');
    assert.equal(inferFileType('song.mp3', 'application/octet-stream'), 'audio');
    assert.equal(inferFileType('doc.pdf', null), 'pdf');
    assert.equal(inferFileType('sub.vtt', 'application/octet-stream'), 'subtitle');
    assert.equal(inferFileType('sub.srt', 'text/plain'), 'subtitle');
    assert.equal(inferFileType('photo.JPG', 'application/octet-stream'), 'image');
  });
  it('hai nguon mau thuan -> UU TIEN duoi file', () => {
    // MIME mac dinh 'video/mp4' nhung duoi .mp3 -> audio (loi gap o init).
    assert.equal(inferFileType('song.mp3', 'video/mp4'), 'audio');
    assert.equal(inferFileType('clip.mp4', 'audio/mpeg'), 'video');
    assert.equal(inferFileType('anh.png', 'video/mp4'), 'image');
    assert.equal(inferFileType('tai-lieu.pdf', 'video/mp4'), 'pdf');
  });
  it('ca hai khong nhan ra -> other', () => {
    assert.equal(inferFileType('file.xyz', 'application/octet-stream'), 'other');
    assert.equal(inferFileType('file.xyz', 'application/x-unknown'), 'other');
    assert.equal(inferFileType('README', ''), 'other');
    assert.equal(inferFileType(null, null), 'other');
  });
  it('planUpload gan fileType suy ra (duong init)', () => {
    assert.equal(planUpload('song.mp3', 1000, 'video/mp4').fileType, 'audio');
    assert.equal(planUpload('clip.mp4', 1000, 'video/mp4').fileType, 'video');
    assert.equal(planUpload('anh.png', 1000, 'image/png').fileType, 'image');
  });
});

describe('wD3: 5 dong goc + dong HLS (qua buildStorageRows + measureHlsStorage)', () => {
  it('du 6 dong theo thu tu, Khac gop phu de + loai la + chua phan loai, drill Khac/HLS null', () => {
    const aggs = sumMediaSizes([
      { fileType: 'image', sizeBytes: 2000 },
      { fileType: 'video', sizeBytes: 4000 },
      { fileType: 'audio', sizeBytes: null },
      { fileType: 'subtitle', sizeBytes: 700 },
      { fileType: 'weird', sizeBytes: 11 },
      { fileType: null, sizeBytes: 500 },
    ]);
    const rows = buildStorageRows(aggs, 3, 9000, 2, 12345);
    assert.deepEqual(rows.map((r) => r.type), ['image', 'video', 'audio', 'pdf', 'other', 'hls']);
    assert.deepEqual(rows.map((r) => r.label), ['Ảnh', 'Video', 'Âm thanh', 'PDF báo in', 'Khác', 'Bản chuyển mã (HLS)']);
    const byType = Object.fromEntries(rows.map((r) => [r.type, r]));
    assert.deepEqual([byType.image.files, byType.image.bytes], [1, 2000]);
    assert.deepEqual([byType.video.files, byType.video.bytes], [1, 4000]);
    assert.deepEqual([byType.audio.files, byType.audio.bytes], [1, 0]);
    assert.deepEqual([byType.pdf.files, byType.pdf.bytes], [3, 9000]);
    // Khac = subtitle (1/700) + loai la (1/11) + chua phan loai (1/500).
    assert.deepEqual([byType.other.files, byType.other.bytes], [3, 1211]);
    assert.deepEqual([byType.hls.files, byType.hls.bytes], [2, 12345]);
    assert.deepEqual(byType.image.drill, { route: '/thu-vien', query: { kind: 'image' } });
    assert.deepEqual(byType.video.drill, { route: '/thu-vien', query: { kind: 'video' } });
    assert.deepEqual(byType.audio.drill, { route: '/thu-vien', query: { kind: 'audio' } });
    assert.deepEqual(byType.pdf.drill, { route: '/bao-in', query: {} });
    assert.equal(byType.other.drill, null);
    assert.equal(byType.hls.drill, null);
    // Dong HLS dem theo video, khong goi la 'file' (CMS hien unit nay).
    assert.equal(byType.hls.unit, 'video đã chuyển mã');
    assert.equal(byType.image.unit, undefined);
    assert.equal(byType.other.unit, undefined);
  });
  it('khong co du lieu van du 5 dong goc (0/0) + dong HLS', () => {
    const rows = buildStorageRows([], 0, 0, 0, 0);
    assert.deepEqual(rows.map((r) => r.type), ['image', 'video', 'audio', 'pdf', 'other', 'hls']);
    assert.ok(rows.slice(0, 5).every((r) => r.files === 0 && r.bytes === 0));
  });
  it('measureHlsStorage: files = so thu muc con, bytes = tong cay; thu muc khong co -> 0/0', () => {
    assert.deepEqual(measureHlsStorage(join(tmpdir(), 'd3-khong-ton-tai-xyz')), { files: 0, bytes: 0 });
    const root = mkdtempSync(join(tmpdir(), 'd3-hls-'));
    try {
      const v1 = join(root, 'hls', 'vid1');
      const v2 = join(root, 'hls', 'vid2');
      mkdirSync(v1, { recursive: true });
      mkdirSync(v2, { recursive: true });
      writeFileSync(join(v1, 'master.m3u8'), 'x'.repeat(100));
      writeFileSync(join(v1, 'seg-0.ts'), 'y'.repeat(1000));
      writeFileSync(join(v2, 'master.m3u8'), 'z'.repeat(50));
      assert.deepEqual(measureHlsStorage(root), { files: 2, bytes: 1150 });
      // Thu muc con cap 2 khong tinh vao files, chi cong bytes.
      mkdirSync(join(v1, 'sub'), { recursive: true });
      writeFileSync(join(v1, 'sub', 'extra.ts'), 'w'.repeat(10));
      assert.deepEqual(measureHlsStorage(root), { files: 2, bytes: 1160 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
