// Logic DIEM NHUAN BUT thuan — khong phu thuoc DB, test bang node --test.
// Theo file thong ke that cua toa soan (Th_ng_K__Nhu_n_B_t_Market.xlsx,
// khoi diem hien hanh) + thiet ke 2C chot 30/10/2026:
//   - Diem theo 5 thanh phan cua bai: noi dung / anh / video / audio /
//     khac. Moi thanh phan la SO NGUYEN trong [SCORE_MIN, SCORE_MAX].
//     Thang 0..3 la gia tri quan sat duoc trong file that; nang thang
//     chi can doi SCORE_MAX o day (va o CMS).
//   - Bai nhieu tac gia: chia theo ti le % nhap trong panel, mac dinh
//     chia deu, tong percent bat buoc = 100. Diem tac gia = diem thanh
//     phan x percent / 100, lam tron 2 chu so thap phan. Tac gia duy
//     nhat (100%) -> diem nguyen nhu file mau.

export const SCORE_MIN = 0;
export const SCORE_MAX = 3;

export const SCORE_COMPONENTS = ['content', 'image', 'video', 'audio', 'other'] as const;
export type ScoreComponent = (typeof SCORE_COMPONENTS)[number];

export interface ComponentScores {
  content: number;
  image: number;
  video: number;
  audio: number;
  other: number;
}

export interface AuthorShare {
  author: string;
  percent: number;
}

export interface AuthorPoints extends ComponentScores {
  author: string;
  percent: number;
  total: number;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Kiem tra 5 diem thanh phan; tra ve mang loi (rong = hop le). */
export function validateScores(scores: Partial<ComponentScores>): string[] {
  const errors: string[] = [];
  for (const c of SCORE_COMPONENTS) {
    const v = scores[c];
    if (v === undefined || v === null) continue; // thieu = 0 khi luu (service chuan hoa)
    if (!Number.isInteger(v)) errors.push(`diem ${c} phai la so nguyen`);
    else if (v < SCORE_MIN || v > SCORE_MAX) errors.push(`diem ${c} phai trong ${SCORE_MIN}..${SCORE_MAX}`);
  }
  return errors;
}

/** Chuan hoa input thanh du 5 thanh phan (thieu -> 0). */
export function normalizeScores(scores: Partial<ComponentScores>): ComponentScores {
  const out = {} as ComponentScores;
  for (const c of SCORE_COMPONENTS) out[c] = scores[c] ?? 0;
  return out;
}

/** Ti le chia deu cho danh sach tac gia (phan du don vao tac gia dau). */
export function equalShares(authors: string[]): AuthorShare[] {
  const names = authors.map((a) => (a || '').trim()).filter(Boolean);
  if (names.length === 0) return [];
  const base = Math.floor(100 / names.length);
  const shares = names.map((author) => ({ author, percent: base }));
  shares[0].percent += 100 - base * names.length;
  return shares;
}

/**
 * Kiem tra ti le chia so voi danh sach tac gia HIEN TAI cua bai:
 * - Moi tac gia cua bai xuat hien dung 1 lan, khong thua nguoi la.
 * - percent la so nguyen 0..100, tong = 100.
 * - Bai khong co tac gia: shares phai rong.
 * Tra ve mang loi (rong = hop le).
 */
export function validateShares(authors: string[], shares: AuthorShare[]): string[] {
  const errors: string[] = [];
  const names = authors.map((a) => (a || '').trim()).filter(Boolean);
  if (names.length === 0) {
    if (shares.length > 0) errors.push('bai khong co tac gia, khong the chia ti le');
    return errors;
  }
  const seen = new Set<string>();
  let total = 0;
  for (const s of shares) {
    const author = (s?.author || '').trim();
    if (!names.includes(author)) errors.push(`tac gia "${author}" khong thuoc bai viet nay`);
    if (seen.has(author)) errors.push(`tac gia "${author}" bi trung trong ti le chia`);
    seen.add(author);
    if (!Number.isInteger(s?.percent)) errors.push(`ti le cua "${author}" phai la so nguyen`);
    else if (s.percent < 0 || s.percent > 100) errors.push(`ti le cua "${author}" phai trong 0..100`);
    else total += s.percent;
  }
  for (const n of names) {
    if (!seen.has(n)) errors.push(`thieu ti le cua tac gia "${n}"`);
  }
  if (errors.length === 0 && total !== 100) errors.push(`tong ti le phai bang 100 (dang la ${total})`);
  return errors;
}

/** Diem tung tac gia sau chia (theo thu tu shares). */
export function authorPoints(scores: ComponentScores, shares: AuthorShare[]): AuthorPoints[] {
  return shares.map((s) => {
    const p = {} as AuthorPoints;
    p.author = s.author;
    p.percent = s.percent;
    let total = 0;
    for (const c of SCORE_COMPONENTS) {
      const v = round2((scores[c] * s.percent) / 100);
      p[c] = v;
      total += v;
    }
    p.total = round2(total);
    return p;
  });
}

/** Tong diem cua bai (truoc chia) — tong 5 thanh phan. */
export function articleTotal(scores: ComponentScores): number {
  return SCORE_COMPONENTS.reduce((sum, c) => sum + (scores[c] || 0), 0);
}
