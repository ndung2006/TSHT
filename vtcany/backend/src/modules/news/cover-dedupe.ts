// Anh bia luc luu bai (create/patch) — phia server.
// Quy tac uu tien vi tri anh trong body (2026-10-30, sua huong strip cu):
// anh bia KHONG duoc day len dau bai bang cach xoa anh khoi body; anh o
// yen vi tri tac gia dat trong body. Vai tro cua server chi la chuan hoa:
// neu anh trong body trung byte voi bia nhung khac URL (vd bia la ban tai
// len lai cua anh goc bao khac), doi src cua anh body ve dung URL bia —
// tu do client (portal + popup Xem duyet) nhan ra "bia da co trong body"
// bang khop pathname va khong render hero/bia rieng nua. Anh giu nguyen
// vi tri, caption giu nguyen, khong bo khoi nao.
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

/**
 * Doi src cua cac <img> co src nam trong tap `from` thanh `to`. Chi doi
 * gia tri thuoc tinh src, giu nguyen moi thu khac cua the (class, width,
 * caption o cung khoi khong dong toi). Tra ve so the da doi.
 */
export function replaceImgSrcs(body: string, from: Set<string>, to: string): { html: string; replaced: number } {
  if (!body || from.size === 0) return { html: body || '', replaced: 0 };
  let replaced = 0;
  const html = body.replace(IMG_TAG, (tag) => {
    if (!from.has(tagSrc(tag))) return tag;
    replaced += 1;
    // src co the dung nhay don hoac nhay kep; giu nguyen loai nhay.
    return tag.replace(/src\s*=\s*"[^"]*"|src\s*=\s*'[^']*'/, (m) => {
      const q = m.includes('"') ? '"' : "'";
      return `src=${q}${to}${q}`;
    });
  });
  return { html, replaced };
}

export interface DedupeResult {
  body: string;
  coverPath: string | null;
  replacedCount: number;
  /** true khi bia truoc do rong va duoc lay tu anh dau body. */
  defaultedCover: boolean;
}

/**
 * 1. Neu chua co bia: lay anh dau body lam bia mac dinh (bo qua data:).
 * 2. So byte (sha256) bia voi tung anh body; anh nao trung byte thi doi
 *    src ve dung URL bia (khong xoa anh, khong doi vi tri).
 * Lay anh that bai: fetch loi -> giu nguyen body (fail-open, luu bai
 * khong bao gio hong vi buoc nay), nhung bia mac dinh van giu.
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
    return { body: body || '', coverPath: effectiveCover, replacedCount: 0, defaultedCover };
  }
  let coverBytes: Buffer | null = null;
  try {
    coverBytes = await fetchBytes(effectiveCover);
  } catch {
    coverBytes = null;
  }
  if (!coverBytes) {
    return { body: body || '', coverPath: effectiveCover, replacedCount: 0, defaultedCover };
  }
  const coverHash = sha256Hex(coverBytes);
  const match = new Set<string>();
  for (const src of srcs) {
    if (src === effectiveCover) continue;
    try {
      const bytes = await fetchBytes(src);
      if (bytes && sha256Hex(bytes) === coverHash) match.add(src);
    } catch {
      // Anh loi -> giu lai, khong chan luu bai.
    }
  }
  if (match.size === 0) {
    return { body: body || '', coverPath: effectiveCover, replacedCount: 0, defaultedCover };
  }
  const replaced = replaceImgSrcs(body || '', match, effectiveCover);
  return {
    body: replaced.html,
    coverPath: effectiveCover,
    replacedCount: replaced.replaced,
    defaultedCover,
  };
}
