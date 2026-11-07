// E1 — bien the anh (derivatives) cho anh upload.
// Quy uoc: anh goc giu nguyen tai /images/<id>.<ext> (khong ghi de,
// khong xoa); 3 co phai sinh /images/<id>-1920|-800|-400.<ext>
// (canh dai toi da, chat luong ~80). Portal dung srcset khi co phai
// sinh, khong co thi dung src goc — khong bao gio vo hinh.
// Chi anh tinh moi sinh bien the: GIF bo qua (anh dong, resize se
// pha khung hinh); AVIF thu qua sharp, fail-open bo qua neu khong duoc.
import { existsSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { storageRootDefault } from './local-store';

export const IMAGE_VARIANT_WIDTHS = [1920, 800, 400] as const;
export const IMAGE_VARIANT_QUALITY = 80;
/** Nguong nghiem thu E1: anh phuc vu (moi co phai sinh) <= 300KB.
 *  Anh JPEG/WebP vuot nguong o q80 thi ha dan chat luong 70 -> 60
 *  cho den khi vua nguong (dung o 60). PNG khong co chat luong nen
 *  khong ap dung (hiem khi la anh bia). */
export const IMAGE_VARIANT_MAX_BYTES = 300 * 1024;
export const IMAGE_VARIANT_QUALITY_STEPS = [80, 70, 60] as const;
/** Dinh dang duoc sinh bien the (chi anh tinh). */
export const VARIANT_INPUT_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);

export function variantFileName(id: string, ext: string, width: number): string {
  return `${id}-${width}.${ext}`;
}

/** Tach /images/<id>.<ext> tu URL bia.
 *  Chi chap nhan URL TUONG DOI /images/... — coverPath trong DB luon
 *  luu dang nay. Moi URL tuyet doi (ke ca cung goc API) deu tra null:
 *  khong the phan biet "cung goc" voi "CDN ngoai co duong dan giong
 *  nhau" chi bang pathname, nen an toan la coi tat ca URL tuyet doi
 *  nhu URL ngoai (khong sinh srcset, dung src goc). */
export function parseLocalImageUrl(url: string | null | undefined): { id: string; ext: string } | null {
  if (!url || typeof url !== 'string') return null;
  const m = /^\/images\/([A-Za-z0-9_-]+)\.([A-Za-z0-9]+)$/.exec(url);
  if (!m) return null;
  return { id: m[1], ext: m[2].toLowerCase() };
}

/** Thu muc anh tren dia (uu tien STORAGE_DIR, giong UploadsService). */
export function imagesDirDefault(): string {
  return join(process.env.STORAGE_DIR || storageRootDefault(), 'images');
}

/** Cac co da co file bien the tren dia (chi doc, khong sinh moi).
 *  Chi tinh cac co NHO HON chieu rong goc (khong phong to anh nho);
 *  rong goc lay tu metadata truyen vao (neu khong biet thi giu tat ca). */
export function existingVariantWidths(
  imagesDir: string,
  fileUrl: string | null | undefined,
  originalWidth?: number,
): number[] {
  const parsed = parseLocalImageUrl(fileUrl);
  if (!parsed) return [];
  if (!VARIANT_INPUT_EXTS.has(parsed.ext)) return [];
  return IMAGE_VARIANT_WIDTHS.filter((w) => {
    if (originalWidth !== undefined && w >= originalWidth) return false;
    return existsSync(join(imagesDir, variantFileName(parsed.id, parsed.ext, w)));
  });
}

/** Chuoi srcset (cung dang URL nhu fileUrl goc: tuong doi giu tuong doi,
 *  tuyet doi giu tuyet doi) — chi gom cac co da ton tai. Tra null neu
 *  khong co bien the nao (portal dung src goc, khong vo hinh). */
export function buildSrcset(fileUrl: string, widths: number[]): string | null {
  const parsed = parseLocalImageUrl(fileUrl);
  if (!parsed || !widths.length) return null;
  const suffix = `${parsed.id}.${parsed.ext}`;
  const idx = fileUrl.lastIndexOf(suffix);
  if (idx < 0) return null;
  const base = fileUrl.slice(0, idx);
  return widths.map((w) => `${base}${variantFileName(parsed.id, parsed.ext, w)} ${w}w`).join(', ');
}

/** Srcset cho anh bia (coverPath trong DB): tra null neu khong co bien the. */
export function coverSrcset(
  coverPath: string | null | undefined,
  imagesDir: string = imagesDirDefault(),
): string | null {
  if (!coverPath) return null;
  return buildSrcset(coverPath, existingVariantWidths(imagesDir, coverPath));
}

export interface ImageVariantResult {
  width: number;
  fileName: string;
  fileUrl: string;
  sizeBytes: number;
}

/** Chieu rong goc cua anh (px); tra 0 neu khong doc duoc.
 *  Dung de tinh "cac co can co" (= cac co < rong goc, khong phong to). */
export async function probeImageWidth(inputPath: string): Promise<number> {
  try {
    const { default: sharp } = await import('sharp');
    const meta = await sharp(inputPath).metadata();
    if (meta.width) return meta.width;
  } catch {
    /* thu ffprobe ben duoi */
  }
  try {
    const probe = await execFileAsync('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width',
      '-of', 'default=noprint_wrappers=1:nokey=1', inputPath,
    ], { maxBuffer: 10 * 1024 * 1024 });
    return parseInt((probe.stdout || '').trim(), 10) || 0;
  } catch {
    return 0;
  }
}

/**
 * Sinh 3 co phai sinh cho anh goc tai `inputPath` (chi thu nho, khong
 * phong to: chi sinh co < chieu rong goc). Anh goc KHONG bi thay doi.
 * Thu sharp truoc; neu sharp khong dung duoc thi fallback ffmpeg;
 * neu ca hai deu loi thi tra [] (upload van thanh cong, anh van hien
 * bang src goc — fail-open, khong bao gio vo hinh vi E1).
 */
export async function generateImageVariants(
  inputPath: string,
  imagesDir: string,
  id: string,
  ext: string,
  opts?: { force?: 'sharp' | 'ffmpeg' },
): Promise<ImageVariantResult[]> {
  const normalizedExt = ext.toLowerCase();
  if (!VARIANT_INPUT_EXTS.has(normalizedExt)) return [];
  const out: ImageVariantResult[] = [];
  try {
    if (opts?.force !== 'ffmpeg') {
      const made = await generateWithSharp(inputPath, imagesDir, id, normalizedExt);
      if (made.length) return made;
      // sharp chay nhung khong sinh duoc co nao (vd anh nho hon 400px)
      // -> khong can thu ffmpeg.
      if (opts?.force === 'sharp') return [];
    }
  } catch (err) {
    console.warn('[image-variants] sharp that bai, thu ffmpeg:', (err as Error)?.message || err);
  }
  try {
    return await generateWithFfmpeg(inputPath, imagesDir, id, normalizedExt);
  } catch (err) {
    console.warn('[image-variants] ffmpeg cung that bai, bo qua bien the:', (err as Error)?.message || err);
    return out;
  }
}

async function generateWithSharp(
  inputPath: string,
  imagesDir: string,
  id: string,
  ext: string,
): Promise<ImageVariantResult[]> {
  const { default: sharp } = await import('sharp');
  const meta = await sharp(inputPath).metadata();
  const width = meta.width || 0;
  if (!width) return [];
  const targets = IMAGE_VARIANT_WIDTHS.filter((w) => w < width);
  const out: ImageVariantResult[] = [];
  for (const w of targets) {
    const fileName = variantFileName(id, ext, w);
    const outPath = join(imagesDir, fileName);
    // JPEG/WebP: ma o q80; neu file vuot 300KB thi ha dan 70 -> 60
    // cho den khi vua nguong (dung o 60). PNG: 1 lan duy nhat.
    const qualities = ext === 'png' ? [IMAGE_VARIANT_QUALITY] : [...IMAGE_VARIANT_QUALITY_STEPS];
    for (const q of qualities) {
      let pipeline = sharp(inputPath).resize(w, null, { withoutEnlargement: true });
      if (ext === 'jpg' || ext === 'jpeg') pipeline = pipeline.jpeg({ quality: q });
      else if (ext === 'png') pipeline = pipeline.png({ compressionLevel: 9 });
      else if (ext === 'webp') pipeline = pipeline.webp({ quality: q });
      await pipeline.toFile(outPath);
      const size = statSync(outPath).size;
      if (size <= IMAGE_VARIANT_MAX_BYTES || q === qualities[qualities.length - 1]) {
        out.push({ width: w, fileName, fileUrl: `/images/${fileName}`, sizeBytes: size });
        break;
      }
    }
  }
  return out;
}

const execFileAsync = promisify(execFile);

async function generateWithFfmpeg(
  inputPath: string,
  imagesDir: string,
  id: string,
  ext: string,
): Promise<ImageVariantResult[]> {
  const probe = await execFileAsync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width',
    '-of', 'default=noprint_wrappers=1:nokey=1', inputPath,
  ], { maxBuffer: 10 * 1024 * 1024 });
  const width = parseInt((probe.stdout || '').trim(), 10) || 0;
  if (!width) return [];
  const out: ImageVariantResult[] = [];
  for (const w of IMAGE_VARIANT_WIDTHS.filter((x) => x < width)) {
    const fileName = variantFileName(id, ext, w);
    const outPath = join(imagesDir, fileName);
    // JPEG: -q:v 4 ≈ q80; vuot 300KB thi ha dan 5 (≈q75) -> 6 (≈q70).
    // WebP: -quality 80 -> 70 -> 60. PNG: 1 lan duy nhat.
    const qualities = ext === 'png' ? [null] : ext === 'webp' ? [80, 70, 60] : [4, 5, 6];
    for (let qi = 0; qi < qualities.length; qi++) {
      const q = qualities[qi];
      const args = ['-y', '-i', inputPath, '-vf', `scale=${w}:-2`];
      if (ext === 'jpg' || ext === 'jpeg') args.push('-q:v', String(q));
      else if (ext === 'webp') args.push('-c:v', 'libwebp', '-quality', String(q));
      args.push(outPath);
      await execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });
      const size = statSync(outPath).size;
      if (size <= IMAGE_VARIANT_MAX_BYTES || qi === qualities.length - 1) {
        out.push({ width: w, fileName, fileUrl: `/images/${fileName}`, sizeBytes: size });
        break;
      }
    }
  }
  return out;
}
