// Logic tim kiem tin bai (Buoc 0 tim kiem portal, Q1-Q5 da chot 2026-11-05).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test
// (giong news-content.ts / rollup-daily.ts). Service chi goi 2 ham:
// parseSearchQuery() validate tham so, buildSearchQuery() sinh SQL + values
// cho $queryRawUnsafe (moi gia tri nguoi dung deu qua placeholder $n,
// khong noi chuoi truc tiep vao SQL).
//
// Quy tac khop (cap nhat 2026-11-06 theo quyet dinh user: tu nguyen):
// - Khong tick "Tim chinh xac": tach tu khoa thanh tung tu theo khoang
//   trang; MOI tu phai xuat hien (AND) o it nhat mot truong trong pham vi,
//   so khop tren dang chuan hoa immutable_unaccent(lower(truong)) — nho do
//   "y te" khop "Y te" (ca hai ve "y te"), thu tu tu khong quan trong.
//   MOI TU (tru tu cuoi) khop NGUYEN TU: regex ~* '\y<tu>\y' — "y te"
//   KHONG khop "yeu cau" (khong co tu "y" dung mot minh) hay "Computer"
//   (khong co tu bat dau bang "te" o day). TU CUOI khop TIEN TO: regex
//   ~* '\m<tu>' (chi rang buoc dau tu) — de thanh tim nhanh van goi y
//   khi dang go do ("y t" van ra "y te"); tu duy nhat cua cum tu cung
//   la tu cuoi nen cung khop tien to.
//   Tu khoa phia JS cung duoc chuan hoa bang stripAccents() truoc khi dua
//   vao pattern, de hai ve khop nhau. Ky tu dac biet cua regex trong tu
//   khoa duoc escape (escapeRegExp) — gia tri nguoi dung van qua
//   placeholder $n, khong noi chuoi truc tiep vao SQL.
// - Tick "Tim chinh xac": khop dung cum tu tren dang GIU DAU
//   lower(truong) LIKE '%cum tu%' (chi bo hoa/thuong) — "y te" tick chinh
//   xac ra 0 ket qua truoc "Y te".
// - Xep hang relevance: diem similarity trigram, trong so title > sapo >
//   body (che do chinh xac: diem CASE WHEN theo truong khop); CONG THEM
//   diem uu tien cum lien nhau: bai khop ca cum tu lien tiep (regex
//   '\y<cum tu>\y', cac tu noi bang \s+) duoc +10 title / +5 sapo / +2
//   body cho moi cum tu — nam tren moi bai chi chua roi rac cac tu.
//   CONG THEM diem uu tien CO DAU (goi B4, 2026-11-07): moi tu khoa thuc
//   su co dau cong +10 title / +5 sapo / +2 body khi dang GIU DAU cua
//   truong khop dung tu do — bai co "Đảng" dung tren bai chi co "đang".
//   Tu khong dau khong sinh bonus; chi doi scoreSql, recall khong doi.
//   Hoa diem thi publishAt DESC. Khong co tu khoa -> sort mac dinh
//   newest (Q4).
// - Ngay xuat ban theo gio VN qua vnDayRange (KHONG dung new Date(...T00:00:00)
//   gio server-local, KHONG dung cong thuc AT TIME ZONE — ca hai da chung
//   minh sai truoc day).

import { isContentType } from './news-content';
import { vnDayRange } from '../dashboard/dashboard-helpers';

export const MAX_KEYWORD_LEN = 200;
export const SEARCH_SCOPES = ['title', 'title-sapo', 'all'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];
export const SEARCH_SORTS = ['relevance', 'newest'] as const;
export type SearchSort = (typeof SEARCH_SORTS)[number];

export interface SearchParams {
  q?: string;
  q2?: string;
  scope: SearchScope;
  category?: string;
  contentType?: string;
  from?: string;
  to?: string;
  exact: boolean;
  sort: SearchSort;
  page: number;
  limit: number;
}

/** Bo dau tieng Viet: NFD + bo dau ket hop + đ→d (giong normalizeChannelKey). */
export function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Tach tu khoa thanh tung tu theo khoang trang (bo khoang thua). */
export function splitWords(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}

/** Escape 3 ky tu dac biet cua LIKE (\, %, _) — dung escape mac dinh \. */
export function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/** Escape cac ky tu dac biet cua regex Postgres (. * + ? ^ $ { } ( ) | [ ] \) — dung cho pattern ~* (gia tri van qua placeholder). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Pattern regex (Postgres ARE) khop mot tu da chuan hoa (khong dau, lower)
 * tren dang chuan hoa cua truong.
 * - Tu thuong: NGUYEN TU — '\y<tu>\y' (ranh gioi tu hai dau).
 * - Tu cuoi cua cum tu: TIEN TO — '\m<tu>' (chi rang buoc dau tu, de goi y
 *   khi dang go do; tu duy nhat cua cum tu cung la tu cuoi).
 */
export function wordRegexPattern(wordNorm: string, isLast: boolean): string {
  const w = escapeRegExp(wordNorm);
  return isLast ? `\\m${w}` : `\\y${w}\\y`;
}

/**
 * Pattern regex khop ca cum tu lien nhau tren dang chuan hoa: '\y<tu1>\s+<tu2>...\y'
 * (ranh gioi tu hai dau cum, cac tu noi bang \s+ de chiu khoang trang thua
 * / xuong dong trong text). Dung cho diem uu tien cum lien nhau.
 */
export function phraseRegexPattern(wordsNorm: string[]): string {
  return `\\y${wordsNorm.map(escapeRegExp).join('\\s+')}\\y`;
}

/** Ngay dang YYYY-MM-DD; sai dinh dang HOAC khong phai ngay lich that -> null. */
function parseDateOnly(v?: string | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Kiem tra ngay lich that (loai '2026-13-01', '2026-02-30'): Date.UTC
  // tu dong cuon ngay khong hop le sang thang sau nen doi chieu lai.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t;
}

function asStr(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

/**
 * Validate + chuan hoa tham so tim kiem tu query string.
 * Throw Error (service doi thanh BadRequestException) khi: tu khoa dai
 * qua 200 ky tu; scope/contentType/sort/exact khong hop le; from/to sai
 * dinh dang YYYY-MM-DD; from > to.
 * Quy uoc chon (ghi ro): enum la -> 400 (giong normalizeContentType o
 * admin); slug chuyen muc khong ton tai -> service tra rong chu khong 400
 * (giong listPublic).
 */
export function parseSearchQuery(input: Record<string, unknown>): SearchParams {
  const q = asStr(input.q);
  const q2 = asStr(input.q2);
  if (q !== undefined && q.length > MAX_KEYWORD_LEN) {
    throw new Error(`tu khoa toi da ${MAX_KEYWORD_LEN} ky tu`);
  }
  if (q2 !== undefined && q2.length > MAX_KEYWORD_LEN) {
    throw new Error(`tu khoa them toi da ${MAX_KEYWORD_LEN} ky tu`);
  }
  const scopeRaw = asStr(input.scope);
  const scope: SearchScope = scopeRaw === undefined ? 'title-sapo' : (scopeRaw as SearchScope);
  if (!(SEARCH_SCOPES as readonly string[]).includes(scope)) {
    throw new Error(`scope khong hop le: ${scopeRaw} (chi nhan ${SEARCH_SCOPES.join(', ')})`);
  }
  const contentType = asStr(input.contentType);
  if (contentType !== undefined && contentType !== 'all' && !isContentType(contentType)) {
    throw new Error(`content_type khong hop le: ${contentType}`);
  }
  const fromRaw = input.from !== undefined && input.from !== null && input.from !== '' ? input.from : undefined;
  const toRaw = input.to !== undefined && input.to !== null && input.to !== '' ? input.to : undefined;
  const from = fromRaw === undefined ? undefined : parseDateOnly(fromRaw as string);
  const to = toRaw === undefined ? undefined : parseDateOnly(toRaw as string);
  if (fromRaw !== undefined && from === null) throw new Error('tu ngay khong hop le (YYYY-MM-DD)');
  if (toRaw !== undefined && to === null) throw new Error('den ngay khong hop le (YYYY-MM-DD)');
  if (from && to && from > to) throw new Error('tu ngay phai <= den ngay');
  const exactRaw = asStr(input.exact);
  let exact = false;
  if (exactRaw !== undefined) {
    if (exactRaw === '1' || exactRaw.toLowerCase() === 'true') exact = true;
    else if (exactRaw === '0' || exactRaw.toLowerCase() === 'false') exact = false;
    else throw new Error(`exact khong hop le: ${exactRaw} (chi nhan 0/1)`);
  }
  const hasKeyword = Boolean(q || q2);
  const sortRaw = asStr(input.sort);
  const sort: SearchSort =
    sortRaw === undefined ? (hasKeyword ? 'relevance' : 'newest') : (sortRaw as SearchSort);
  if (!(SEARCH_SORTS as readonly string[]).includes(sort)) {
    throw new Error(`sort khong hop le: ${sortRaw} (chi nhan ${SEARCH_SORTS.join(', ')})`);
  }
  const pageNum = Number(input.page);
  const page = Number.isFinite(pageNum) ? Math.max(1, Math.floor(pageNum)) : 1;
  const limitNum = Number(input.limit);
  const limit = Number.isFinite(limitNum) ? Math.min(20, Math.max(1, Math.floor(limitNum))) : 20;
  return {
    q,
    q2,
    scope,
    category: asStr(input.category),
    contentType: contentType === 'all' ? undefined : contentType,
    from: from ?? undefined,
    to: to ?? undefined,
    exact,
    sort,
    page,
    limit,
  };
}

/** Co tu khoa hay bo loc nao khong — khong co gi thi service tra rong, khong truy van. */
export function hasSearchInput(p: SearchParams): boolean {
  return Boolean(p.q || p.q2 || p.category || p.contentType || p.from || p.to);
}

// Bieu thuc SQL cua tung truong theo che do (fuzzy = chuan hoa khong dau,
// exact = giu dau). Body tru the HTML truoc khi chuan hoa.
function fieldExprs(scope: SearchScope, exact: boolean): string[] {
  const norm = exact ? 'lower' : 'immutable_unaccent(lower';
  const close = exact ? '' : ')';
  const title = `${norm}(a."title"${close})`;
  const sapo = `${norm}(a."sapo"${close})`;
  const body = `${norm}(regexp_replace(a."body", '<[^>]*>', ' ', 'g')${close})`;
  if (scope === 'title') return [title];
  if (scope === 'title-sapo') return [title, sapo];
  return [title, sapo, body];
}

export interface SearchSql {
  whereSql: string;
  orderSql: string;
  scoreSql: string;
  values: unknown[];
}

/**
 * Sinh WHERE + ORDER + bieu thuc diem + values cho $queryRawUnsafe.
 * categoryIds: null = khong loc chuyen muc; mang id (cha + con 1 cap, da
 * duoc service giai tu slug — slug khong ton tai thi service tra rong
 * truoc, khong goi ham nay). Moi gia tri deu qua placeholder $n.
 */
export function buildSearchQuery(p: SearchParams, categoryIds: string[] | null): SearchSql {
  const values: unknown[] = [];
  const ph = (v: unknown): string => {
    values.push(v);
    return `$${values.length}`;
  };
  const where: string[] = [`a.status = 'published'`, `a."publish_at" <= now()`];
  if (categoryIds !== null) {
    where.push(`a."category_id" IN (${categoryIds.map((id) => ph(id)).join(', ')})`);
  }
  if (p.contentType) where.push(`a."content_type" = ${ph(p.contentType)}`);
  if (p.from) where.push(`a."publish_at" >= ${ph(vnDayRange(p.from).from)}`);
  if (p.to) where.push(`a."publish_at" < ${ph(vnDayRange(p.to).to)}`);

  const hasKeyword = Boolean(p.q || p.q2);
  const exprs = fieldExprs(p.scope, p.exact);
  const phrases = [p.q, p.q2].filter((s): s is string => Boolean(s));
  for (const phrase of phrases) {
    if (p.exact) {
      const pattern = `%${escapeLike(phrase.toLowerCase())}%`;
      where.push(`(${exprs.map((e) => `${e} LIKE ${ph(pattern)}`).join(' OR ')})`);
    } else {
      const words = splitWords(phrase).map((w) => stripAccents(w).toLowerCase());
      words.forEach((word, i) => {
        const pattern = wordRegexPattern(word, i === words.length - 1);
        where.push(`(${exprs.map((e) => `${e} ~* ${ph(pattern)}`).join(' OR ')})`);
      });
    }
  }

  let scoreSql = '0';
  if (hasKeyword && p.sort === 'relevance') {
    if (p.exact) {
      const phrase = phrases.join(' ').toLowerCase();
      const pattern = `%${escapeLike(phrase)}%`;
      const [t, s, b] = fieldExprs('all', true);
      scoreSql =
        `(CASE WHEN ${t} LIKE ${ph(pattern)} THEN 3 ELSE 0 END` +
        ` + CASE WHEN ${s} LIKE ${ph(pattern)} THEN 2 ELSE 0 END` +
        ` + CASE WHEN ${b} LIKE ${ph(pattern)} THEN 1 ELSE 0 END)`;
    } else {
      const qNorm = stripAccents(phrases.join(' ')).toLowerCase().trim();
      const [t, s, b] = fieldExprs('all', false);
      // Uu tien cum lien nhau: moi cum tu khop lien tiep o mot truong cong
      // diem lon hon tong similarity toi da (3+1.5+0.5=5) de bai khop cum
      // luon dung tren bai chi chua roi rac cac tu.
      const phraseBonus = phrases
        .map((phrase) => {
          const words = splitWords(phrase).map((w) => stripAccents(w).toLowerCase());
          const pattern = phraseRegexPattern(words);
          return (
            `(CASE WHEN ${t} ~* ${ph(pattern)} THEN 10 ELSE 0 END` +
            ` + CASE WHEN ${s} ~* ${ph(pattern)} THEN 5 ELSE 0 END` +
            ` + CASE WHEN ${b} ~* ${ph(pattern)} THEN 2 ELSE 0 END)`
          );
        })
        .join(' + ');
      // Uu tien khop CO DAU (goi B4): moi tu khoa thuc su co dau cong them
      // diem khi dang GIU DAU cua truong (lower(), khong bo dau) khop dung
      // tu do — bai co "Đảng" o tieu de luon dung tren bai chi co "đang"
      // (ca hai deu khop dang khong dau o phraseBonus). Tu khong dau
      // khong sinh bonus, hanh vi giu nguyen. Chi them vao scoreSql,
      // khong dung whereSql nen recall khong doi.
      const [tAcc, sAcc, bAcc] = fieldExprs('all', true);
      const accentBonus = phrases
        .flatMap((phrase) => splitWords(phrase).map((w) => w.toLowerCase()))
        .filter((w) => stripAccents(w) !== w)
        .map((word) => {
          const pattern = phraseRegexPattern([word]);
          return (
            `(CASE WHEN ${tAcc} ~* ${ph(pattern)} THEN 10 ELSE 0 END` +
            ` + CASE WHEN ${sAcc} ~* ${ph(pattern)} THEN 5 ELSE 0 END` +
            ` + CASE WHEN ${bAcc} ~* ${ph(pattern)} THEN 2 ELSE 0 END)`
          );
        })
        .join(' + ');
      scoreSql =
        `3 * similarity(${t}, ${ph(qNorm)})` +
        ` + 1.5 * similarity(${s}, ${ph(qNorm)})` +
        ` + 0.5 * similarity(${b}, ${ph(qNorm)})` +
        ` + ${phraseBonus}` +
        (accentBonus ? ` + ${accentBonus}` : '');
    }
  }
  const orderSql =
    hasKeyword && p.sort === 'relevance'
      ? 'ORDER BY score DESC, a."publish_at" DESC'
      : 'ORDER BY a."publish_at" DESC';
  return { whereSql: where.join(' AND '), orderSql, scoreSql, values };
}
