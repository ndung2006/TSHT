// Ngay VN dang chuoi YYYY-MM-DD — THUAN, khong phu thuoc mui gio trinh
// duyet (xem phuong-an-dashboard §12). Dung cho ky loc dashboard CMS
// (hopp dong `to` = ngay cuoi, BAO HAM — xem pages/index.vue).
//
// Quy tac: cong/tru ngay CHI tren chuoi YYYY-MM-DD bang so hoc lich UTC
// (new Date('YYYY-MM-DDT00:00:00Z') + setUTCDate). KHONG dung
// getDate()/setDate() local cua trinh duyet: nguoi dung di cong tac sang
// mui gio khac (hoac qua moc DST o mui gio do) co the lech 1 ngay.

/** Cong/tru n ngay tren chuoi YYYY-MM-DD, tra ve chuoi YYYY-MM-DD. */
export function addDaysStr(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
