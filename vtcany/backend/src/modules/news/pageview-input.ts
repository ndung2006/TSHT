// Validate/normalize input cho endpoint thu pageview (Dot 1a + chong bot
// khi dong GĐ1, 2026-11-04).
// File thuan, khong import Nest/Prisma — test truc tiep bang node --test.
// Ton trong rieng tu: chi nhan bai (publicId) hoac duong dan + sessionId
// (token phien do client tu sinh, khong dinh danh nguoi dung); khong nhan
// IP/user id, khong luu user-agent (UA chi dung de loc bot roi bo).
// Chong lam dung hien co: loc UA bot + chong gui lap tu cung phien
// (xem PageViewService); chua rate-limit — lam sau neu can.

const MAX_LEN = 500;
const MAX_SESSION_LEN = 128;

/** Dau hieu UA bot/crawler/cong cu quet — khop chuoi con, khong phan biet
 *  hoa/thuong. UA rong khong bi loc (client an danh van co the de trong).
 *  Chu y 'bot' bat ca 'robot'; khong them chuoi chung chung nhu 'mozilla'
 *  hay 'applewebkit' de khong chan trinh duyet that. */
export const BOT_UA_SUBSTRINGS: string[] = [
  'bot', 'spider', 'crawler', 'crawl', 'slurp', 'headless', 'phantomjs',
  'selenium', 'puppeteer', 'playwright', 'scrapy', 'curl', 'wget',
  'python-requests', 'go-http', 'httpclient', 'okhttp', 'pingdom',
  'uptimerobot', 'monitor', 'facebookexternal', 'twitterbot',
  'linkedinbot', 'discordbot', 'telegrambot', 'whatsapp', 'googlebot',
  'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot', 'applebot',
  'semrushbot', 'ahrefsbot', 'mj12bot', 'dotbot', 'petalbot', 'bytespider',
];

export function isBotUserAgent(ua: unknown): boolean {
  if (typeof ua !== 'string' || !ua.trim()) return false;
  const lower = ua.toLowerCase();
  return BOT_UA_SUBSTRINGS.some((s) => lower.includes(s));
}

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.slice(0, MAX_LEN);
}

export interface PageViewInput {
  articlePublicId?: unknown;
  path?: unknown;
  sessionId?: unknown;
}

export interface NormalizedPageView {
  articlePublicId: string | null;
  path: string;
  sessionId: string | null;
}

/**
 * It nhat 1 trong 2 truong phai co gia tri; ca 2 rong -> throw Error
 * (service doi thanh BadRequestException). path mac dinh '' khi chi co
 * articlePublicId. sessionId neu co thi cat o 128 ky tu, khong co thi null
 * (luc do khong dedupe theo phien duoc, van ghi nhu binh thuong).
 */
export function normalizePageViewInput(input: PageViewInput): NormalizedPageView {
  const articlePublicId = clean(input?.articlePublicId);
  const path = clean(input?.path);
  if (!articlePublicId && !path) {
    throw new Error('pageview can articlePublicId hoac path');
  }
  const rawSession = typeof input?.sessionId === 'string' ? input.sessionId.trim() : '';
  const sessionId = rawSession ? rawSession.slice(0, MAX_SESSION_LEN) : null;
  return { articlePublicId, path: path || '', sessionId };
}
