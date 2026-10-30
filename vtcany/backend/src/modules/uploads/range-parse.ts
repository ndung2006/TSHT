// Parse header Range HTTP cho file MP4 (DAM Proxy MP4).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test.
//
// Chi ho tro M0T range dang bytes=A-B / bytes=A- / bytes=-N (suffix).
// Tra { start, end } bao ham (end da clamp ve size - 1), hoac null khi
// header khong hop le / nhieu range / khong thoa man — controller doi
// null thanh 416 + 'Content-Range: bytes */<size>'.
// Khong co header Range thi khong goi ham nay: controller tra 200 toan file.
export function parseRangeHeader(
  range: string | undefined,
  size: number,
): { start: number; end: number } | null {
  if (typeof range !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (a === '' && b === '') return null;
  if (size <= 0) return null;
  if (a === '') {
    // Suffix: N byte cuoi file.
    const n = Number(b);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    if (n >= size) return { start: 0, end: size - 1 };
    return { start: size - n, end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isSafeInteger(start) || start >= size) return null;
  if (b === '') return { start, end: size - 1 };
  const end = Number(b);
  if (!Number.isSafeInteger(end) || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}
