// Hoi quy loi 1B (2026-10-29): tao bai moi mat formatData trong khi sua
// thi luu duoc. Nguyen nhan goc: ArticleDto thieu truong formatData nen
// ValidationPipe whitelist:true (main.ts) luoc mat no o POST tao bai;
// PATCH dung Partial<ArticleDto> (runtime metatype Object) nen pipe bo
// qua. Test nay khoa chan: DTO phai khai bao formatData (kem @IsOptional
// de null di qua), va duong tao phai chuan hoa dung nhu duong sua
// (qua normalizeFormatData — ham that, khong mo phong).
// Chay: node --test news-create-formatdata.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeFormatData } from './news-format-data.ts';

const controllerSrc = readFileSync(new URL('./news.controller.ts', import.meta.url), 'utf8');
const dtoBlock = controllerSrc.slice(
  controllerSrc.indexOf('class ArticleDto'),
  controllerSrc.indexOf('class CategoryDto'),
);

test('ArticleDto khai bao formatData (whitelist khong luoc mat khi tao bai)', () => {
  assert.ok(dtoBlock.includes('class ArticleDto'), 'khong tim thay ArticleDto');
  // Truong phai co decorator @IsOptional ngay truoc (null = bai khong media phai di qua).
  assert.match(dtoBlock, /@IsOptional\(\)\s*\n\s*@IsObject\(\)\s*\n\s*formatData\?:/);
});

test('duong tao: payload co formatData -> chuan hoa giu media (nhu duong sua)', () => {
  // Mo phong dung dong service create: normalizeFormatData(input.formatData) ?? undefined.
  const create = (input) => normalizeFormatData(input.formatData) ?? undefined;
  assert.deepEqual(create({ formatData: { videoUrl: ' https://cdn.example/v.mp4 ' } }), { videoUrl: 'https://cdn.example/v.mp4' });
  assert.deepEqual(create({ formatData: { imageUrl: '/images/info.png', images: ['/images/a.jpg', '/images/a.jpg'] } }), { imageUrl: '/images/info.png', images: ['/images/a.jpg'] });
  // Bai cu / bai khong media: undefined -> undefined (Prisma giu default null).
  assert.equal(create({}), undefined);
  assert.equal(create({ formatData: null }), undefined);
  // Scheme nguy hiem -> throw (service doi thanh 400), ca tao lan sua.
  assert.throws(() => create({ formatData: { videoUrl: 'javascript:alert(1)' } }), /khong hop le/);
});
