// Chong trung anh bia o phia server — chay khi luu bai (create/patch).
// Van de goc: anh bia thuong la ban tai len lai cua anh dau body, khac URL
// nhung cung byte (vd anh goc Dien Bien vs /images/... local). Guard o
// trinh duyet chi so duoc duong dan nen khong xu ly duoc truong hop nay;
// o server tai duoc ca 2 file nen so duoc byte that.
// Thuan + async, khong import NestJS de node --test import truc tiep duoc.
import { createHash } from 'node:crypto';

export type FetchBytes = (url: string) => Promise<Buffer | null>;

/** Lay src cac <img> trong body theo thu tu xuat hien, bo trung, bo rong. */
export function collectImgSrcs(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  if (!body) return out;
  for (const tag of body.match(/<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi) || []) {
    const m = /src\s*=\s*"([^"]*)"|src\s*=\s*'([^']*)'/.exec(tag);
    const src = (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&').trim();
    if (src && !seen.has(src)) {
      seen.add(src);
      out.push(src);
    }
  }
  return out;
}

/** Src duoc chon lam bia mac dinh: URL http(s) hoac duong dan tuyet doi.
 *  Anh data: (base64) khong lam bia — vua nang JSON vua khong phai file. */
export function isDefaultCoverCandidate(src: string): boolean {
  return /^https?:\/\//.test(src) || src.startsWith('/');
}

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

const IMG_TAG = /<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

function tagSrc(tag: string): string {
  const m = /src\s*=\s*"([^"]*)"|src\s*=\s*'([^']*)'/.exec(tag);
  return (m?.[1] ?? m?.[2] ?? '').replace(/&amp;/g, '&').trim();
}

function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCentered(openTag: string): boolean {
  return /ql-align-center/.test(openTag) || /text-align\s*:\s*center/.test(openTag);
}

/**
 * Bo khoi body cac <img> co src nam trong tap remove.
 * - Khoi <p>/<figure>/<div> sau khi bo anh: neu khong con anh va
 *   (khong con chu) hoac (la <figure> — figcaption mo coi) hoac
 *   (khoi can giua + chu ngan <= 200 ky tu — dang figure + caption
 *   kieu anh nhap tu bao khac) thi bo ca khoi.
 * - Doan van xuoi co chu dai van giu lai chu, chi bo anh (tranh xoa
 *   nham noi dung that khi anh chen giua doan van).
 * - Anh ngoai khoi: chi bo the <img>.
 */
export function stripImgsBySrc(body: string, remove: Set<string>): { html: string; removed: number } {
  if (!body || remove.size === 0) return { html: body || '', removed: 0 };
  let removed = 0;
  const stripTags = (html: string) =>
    html.replace(IMG_TAG, (tag) => {
      if (remove.has(tagSrc(tag))) {
        removed += 1;
        return '';
      }
      return tag;
    });
  const blockRe = /<(p|figure|div)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let out = '';
  let last = 0;
  for (const m of body.matchAll(blockRe)) {
    const idx = m.index ?? 0;
    out += stripTags(body.slice(last, idx));
    const block = m[0];
    const openEnd = block.indexOf('>');
    const openTag = block.slice(0, openEnd + 1);
    const tagName = (m[1] || 'p').toLowerCase();
    const closeTag = `</${tagName}>`;
    const inner = block.slice(openEnd + 1, block.length - closeTag.length);
    const newInner = stripTags(inner);
    const imgsLeft = (newInner.match(/<img\b/gi) || []).length;
    const text = visibleText(newInner);
    const drop =
      imgsLeft === 0 &&
      (text === '' || tagName === 'figure' || (isCentered(openTag) && text.length <= 200));
    if (!drop) out += openTag + newInner + closeTag;
    last = idx + block.length;
  }
  out += stripTags(body.slice(last));
  return { html: out, removed };
}

export interface DedupeResult {
  body: string;
  coverPath: string | null;
  removedCount: number;
  /** true khi bia truoc do rong va duoc lay tu anh dau body. */
  defaultedCover: boolean;
}

/**
 * 1. Neu chua co bia: lay anh dau body lam bia mac dinh (bo qua data:).
 * 2. So byte (sha256) bia voi tung anh body; anh nao trung byte thi bo
 *    khoi body. Lay anh that bai: fetch loi -> giu nguyen body (fail-open,
 *    luu bai khong bao gio hong vi dedupe), nhung bia mac dinh van giu
 *    (guard cung-URL o trinh duyet xu ly tiep truong hop cung URL).
 */
export async function resolveCoverAndDedupe(
  body: string,
  coverPath: string | null | undefined,
  fetchBytes: FetchBytes,
): Promise<DedupeResult> {
  const srcs = collectImgSrcs(body || '');
  let effectiveCover: string | null =
    coverPath && String(coverPath).trim() ? String(coverPath).trim() : null;
  let defaultedCover = false;
  if (!effectiveCover) {
    const first = srcs.find(isDefaultCoverCandidate);
    if (first) {
      effectiveCover = first;
      defaultedCover = true;
    }
  }
  if (!effectiveCover || srcs.length === 0) {
    return { body: body || '', coverPath: effectiveCover, removedCount: 0, defaultedCover };
  }
  let coverBytes: Buffer | null = null;
  try {
    coverBytes = await fetchBytes(effectiveCover);
  } catch {
    coverBytes = null;
  }
  if (!coverBytes) {
    return { body: body || '', coverPath: effectiveCover, removedCount: 0, defaultedCover };
  }
  const coverHash = sha256Hex(coverBytes);
  const remove = new Set<string>();
  for (const src of srcs) {
    try {
      const bytes = await fetchBytes(src);
      if (bytes && sha256Hex(bytes) === coverHash) remove.add(src);
    } catch {
      // Anh loi -> giu lai, khong chan luu bai.
    }
  }
  if (remove.size === 0) {
    return { body: body || '', coverPath: effectiveCover, removedCount: 0, defaultedCover };
  }
  const stripped = stripImgsBySrc(body || '', remove);
  return {
    body: stripped.html,
    coverPath: effectiveCover,
    removedCount: stripped.removed,
    defaultedCover,
  };
}
