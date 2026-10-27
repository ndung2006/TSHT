import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseEpgCsv, parseEpgXlsx, parseEpgFile, buildEpgTemplateXlsx, toHHmm } from './dist/modules/content/epg-file.js';
import { EpgService } from './dist/modules/content/epg.service.js';
import { CatalogService } from './dist/modules/catalog/catalog.service.js';

test('toHHmm chuan hoa moi dang gio Excel/CSV', () => {
  assert.equal(toHHmm('19:00'), '19:00');
  assert.equal(toHHmm('7:05'), '07:05');
  assert.equal(toHHmm(19 / 24), '19:00'); // Excel: phan so cua ngay
  assert.equal(toHHmm(20.5 / 24), '20:30');
  assert.equal(toHHmm(new Date(2026, 0, 1, 21, 15)), '21:15');
  assert.equal(toHHmm(''), '00:00');
});

test('parseEpgCsv doc dung mau cu (ke ca BOM + ngoac kep)', () => {
  const csv = '﻿ten_chuong_trinh,noi_dung,bat_dau,ket_thuc,xem_lai\n"Thoi su 19h","Ban tin thoi su",19:00,19:45,1\n"Phim truyen","Tap 12",20:00,21:00,0\n';
  const rows = parseEpgCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Thoi su 19h');
  assert.equal(rows[0].time, '19:00');
  assert.equal(rows[0].end, '19:45');
  assert.equal(rows[0].status, 'REPLAY');
  assert.equal(rows[1].status, 'UPCOMING');
});

test('parseEpgFile nhan dien va doc duoc .xlsx that', () => {
  const aoa = [
    ['ten_chuong_trinh', 'noi_dung', 'bat_dau', 'ket_thuc', 'xem_lai'],
    ['Thoi su 19h', 'Ban tin', 19 / 24, 19.75 / 24, 1],
    ['Phim truyen', 'Tap 12', '20:00', '21:00', 0],
    ['', '', '', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'EPG');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  const { format, items } = parseEpgFile(buf, 'lich.xlsx');
  assert.equal(format, 'xlsx');
  assert.equal(items.length, 2); // dong trong bi bo
  assert.equal(items[0].time, '19:00');
  assert.equal(items[0].end, '19:45');
  assert.equal(items[0].status, 'REPLAY');
  assert.equal(items[1].time, '20:00');

  const csvBuf = Buffer.from('h1,h2,h3,h4,h5\nA,B,08:00,09:00,0\n', 'utf8');
  assert.equal(parseEpgFile(csvBuf, 'lich.csv').format, 'csv');
});

test('buildEpgTemplateXlsx tao file mau doc lai duoc', () => {
  const buf = buildEpgTemplateXlsx();
  assert.equal(buf[0], 0x50); // 'P' cua ZIP
  const rows = parseEpgXlsx(buf);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'Thoi su 19h');
});

test('EpgService persist qua catalog_settings: restart van con lich', async () => {
  const m = new Map();
  const prisma = {
    catalogSetting: {
      findMany: async () => [...m.entries()].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, create, update }) => {
        m.set(where.key, m.has(where.key) ? update.value : create.value);
        return {};
      },
    },
  };
  const e1 = new EpgService(prisma);
  e1.set('LAICHAU', [{ time: '19:00', title: 'Thoi su', status: 'UPCOMING' }], '2026-10-01');
  await new Promise((r) => setTimeout(r, 30)); // persist ghi xuyen suot async
  assert.ok(m.has('epg:LAICHAU:2026-10-01'));

  const e2 = new EpgService(prisma);
  await e2.onModuleInit();
  assert.equal(e2.get('LAICHAU', '2026-10-01')[0].title, 'Thoi su');
});

test('CatalogService.getSettings an khoa noi bo epg:, putSettings khong ghi de', async () => {
  const m = new Map([
    ['site_name', 'VTC ANY'],
    ['epg:LAICHAU:2026-10-01', '[]'],
  ]);
  const prisma = {
    catalogSetting: {
      findMany: async () => [...m.entries()].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, create, update }) => {
        m.set(where.key, m.has(where.key) ? update.value : create.value);
        return {};
      },
    },
  };
  const svc = new CatalogService(prisma);
  const s = await svc.getSettings();
  assert.equal(s.site_name, 'VTC ANY');
  assert.equal(s['epg:LAICHAU:2026-10-01'], undefined);
  await svc.putSettings({ 'epg:HACK:2026-01-01': 'x', theme: 'dark' });
  assert.equal(m.has('epg:HACK:2026-01-01'), false);
  assert.equal(m.get('theme'), 'dark');
});
