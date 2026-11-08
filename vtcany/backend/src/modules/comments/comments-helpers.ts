// Logic thuan cho goi "Binh luan dot 1" (thiet ke §6.1) — KHONG import
// NestJS/Prisma, test truc tiep bang node --test (xem
// comments-helpers.test.mjs). Service goi lai cac ham nay.

/** Dem ky tu theo code point Unicode (emoji = 1, khong phai 2 nhu .length). */
export function countCodePoints(s: string): number {
  return [...(s || '')].length;
}

/** Cat chuoi theo code point (khong cat giua surrogate pair). */
export function sliceCodePoints(s: string, max: number): string {
  return [...(s || '')].slice(0, max).join('');
}

const URL_RE = /https?:\/\/\S+|www\.\S+/g;

/**
 * Loai URL khoi noi dung (§6.1 luat 5, Q3): thay URL bang chuoi rong,
 * gom khoang trang ngang thua, giu xuong dong. Tra ve noi dung da loai
 * + co link nao bi loai khong. Khong luu URL vao DB.
 */
export function stripLinks(body: string): { text: string; linksRemoved: boolean } {
  const src = body || '';
  const linksRemoved = URL_RE.test(src);
  URL_RE.lastIndex = 0;
  const text = src
    .replace(URL_RE, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .trim();
  return { text, linksRemoved };
}

/**
 * Chuan hoa noi dung de so trung (§6.1 luat 6): trim + gop moi khoang
 * trang lien tiep (ke ca xuong dong) thanh 1 + lowercase.
 */
export function normalizeForDuplicate(body: string): string {
  return (body || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Khop tu cam (§6.1 luat 7): chuoi con, khong phan biet hoa/thuong,
 * tren noi dung da chuan hoa (lowercase). Tra ve tu cam dau tien khop
 * (de ghi log/debug), null neu khong co.
 */
export function findBannedWord(normalizedBody: string, bannedWords: string[]): string | null {
  const hay = (normalizedBody || '').toLowerCase();
  for (const w of bannedWords || []) {
    const needle = String(w || '').trim().toLowerCase();
    if (needle && hay.includes(needle)) return needle;
  }
  return null;
}

/** Tien ich: co tu cam nao khong. */
export function containsBannedWord(normalizedBody: string, bannedWords: string[]): boolean {
  return findBannedWord(normalizedBody, bannedWords) !== null;
}

/**
 * Trung vi cua mot danh sach so (giay) — dung cho C6 thoi gian duyet
 * trung vi (§3.6): sap xep, so le lay gia tri giua, so chan lay trung
 * binh 2 gia tri giua. Rong -> null.
 */
export function medianNumbers(nums: number[]): number | null {
  if (!nums || !nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Trung vi thoi gian duyet (giay) tu cac cap createdAt/moderatedAt. */
export function medianReviewSeconds(
  pairs: Array<{ createdAt: Date | string | number; moderatedAt: Date | string | number | null | undefined }>,
): number | null {
  const secs: number[] = [];
  for (const p of pairs || []) {
    if (!p?.moderatedAt) continue;
    const d = (new Date(p.moderatedAt).getTime() - new Date(p.createdAt).getTime()) / 1000;
    if (Number.isFinite(d) && d >= 0) secs.push(d);
  }
  return medianNumbers(secs);
}

/**
 * Validate body cua POST /internal/cleanup-old-comment-meta (§6.2).
 * Worker gui {op:'list', cutoff:<ISO>} hoac {op:'clear', ids:[...]}.
 * Tra ve request da chuan hoa; sai thi nem Error co .code/.status (400).
 */
export function parseCleanupMetaRequest(
  body: any,
): { op: 'list'; cutoff: Date } | { op: 'clear'; ids: string[] } {
  const err = (code: string, message: string) => {
    const e = new Error(message) as Error & { code: string; status: number };
    e.code = code;
    e.status = 400;
    return e;
  };
  if (!body || typeof body !== 'object') throw err('bad_request', 'Body phải là object');
  if (body.op === 'list') {
    const d = new Date(body.cutoff);
    if (!body.cutoff || Number.isNaN(d.getTime())) {
      throw err('invalid_cutoff', 'cutoff phải là ngày ISO hợp lệ');
    }
    return { op: 'list', cutoff: d };
  }
  if (body.op === 'clear') {
    if (!Array.isArray(body.ids)) throw err('invalid_ids', 'ids phải là mảng');
    const ids = body.ids.filter((x: any) => typeof x === 'string' && x.length > 0);
    if (ids.length !== body.ids.length) {
      throw err('invalid_ids', 'ids phải là mảng chuỗi không rỗng');
    }
    return { op: 'clear', ids };
  }
  throw err('invalid_op', "op phải là 'list' hoặc 'clear'");
}
