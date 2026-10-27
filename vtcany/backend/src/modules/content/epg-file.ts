import * as XLSX from 'xlsx';

// Phan tich file lich EPG tai len tu CMS: Excel .xlsx that (SheetJS) hoac CSV.
// Cot theo mau: ten_chuong_trinh, noi_dung, bat_dau, ket_thuc, xem_lai (1 = xem lai).
export interface EpgFileRow {
  title: string;
  description: string;
  time: string;
  end: string;
  status: 'REPLAY' | 'UPCOMING';
}

function truthy(v: any): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v === 1;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'x' || s === 'yes';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Excel luu gio dang phan so cua ngay (19:00 = 0.79166...) hoac Date;
// CSV dang chuoi "19:00"/"7:05". Chuan hoa ve "HH:mm".
export function toHHmm(v: any): string {
  if (v === null || v === undefined || v === '') return '00:00';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return `${pad2(v.getHours())}:${pad2(v.getMinutes())}`;
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v >= 0 && v < 1) {
      const mins = Math.round(v * 1440) % 1440;
      return `${pad2(Math.floor(mins / 60))}:${pad2(mins % 60)}`;
    }
    if (v >= 1 && v < 24) {
      const h = Math.floor(v);
      return `${pad2(h)}:${pad2(Math.round((v - h) * 60) % 60)}`;
    }
    return '00:00';
  }
  const m = String(v).trim().match(/(\d{1,2}):(\d{2})/);
  if (m) return `${pad2(Number(m[1]))}:${m[2]}`;
  return '00:00';
}

function mapRow(cols: any[]): EpgFileRow {
  return {
    title: String(cols[0] ?? '').trim() || 'Chuong trinh',
    description: String(cols[1] ?? '').trim(),
    time: toHHmm(cols[2]),
    end: cols[3] === '' || cols[3] === null || cols[3] === undefined ? '' : toHHmm(cols[3]),
    status: truthy(cols[4]) ? 'REPLAY' : 'UPCOMING',
  };
}

// CSV don gian: ho tro dau phay trong ngoac kep (logic giu nhu truoc).
export function parseEpgCsv(text: string): EpgFileRow[] {
  const clean = String(text || '').replace(/^﻿/, '');
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) throw new Error('file trong hoac thieu dong tieu de');
  return lines.slice(1).map((line) => {
    const cols = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map((c) => c.replace(/^"|"$/g, '').trim()) || [];
    return mapRow(cols);
  });
}

export function parseEpgXlsx(buffer: Buffer): EpgFileRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  } catch {
    throw new Error('khong doc duoc file Excel (file hong hoac khong phai .xlsx)');
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('file Excel khong co sheet nao');
  const aoa = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, defval: '' });
  const rows = aoa.slice(1).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) throw new Error('file Excel khong co dong du lieu (sau dong tieu de)');
  return rows.map(mapRow);
}

// Nhan dien theo magic bytes: .xlsx la ZIP (PK\x03\x04), con lai coi la CSV.
export function parseEpgFile(buffer: Buffer, _filename = ''): { format: 'xlsx' | 'csv'; items: EpgFileRow[] } {
  if (!buffer?.length) throw new Error('file is required (multipart field "file")');
  const isZip = buffer.length > 3 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZip) return { format: 'xlsx', items: parseEpgXlsx(buffer) };
  const items = parseEpgCsv(buffer.toString('utf8'));
  return { format: 'csv', items };
}

// File mau Excel that (2 dong vi du, cung cot nhu ban CSV).
export function buildEpgTemplateXlsx(): Buffer {
  const aoa = [
    ['ten_chuong_trinh', 'noi_dung', 'bat_dau', 'ket_thuc', 'xem_lai'],
    ['Thoi su 19h', 'Ban tin thoi su', '19:00', '19:45', 1],
    ['Phim truyen', 'Tap 12', '20:00', '21:00', 0],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'EPG');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
