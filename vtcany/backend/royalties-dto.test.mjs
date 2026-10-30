// Test hoi quy cho loi 400 khi luu nhuan but cua bai CO tac gia:
// ValidationPipe toan cuc chay { whitelist: true } (src/main.ts) nen moi
// truong DTO khong co decorator class-validator se bi CAT khoi payload
// truoc khi vao service. ShareDto.author tung thieu decorator -> ten tac
// gia bien mat -> validateShares bao 'tac gia "" khong thuoc bai viet'
// -> 400. Bai khong co tac gia gui shares: [] nen khong lo loi.
// Test nay chay dung co che cua pipe (plainToInstance + validate voi
// whitelist) tren DTO that lay tu dist/ sau npm run build.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RoyaltyDto } from './dist/modules/royalties/royalties.controller.js';

test('shares giu duoc author sau ValidationPipe whitelist', async () => {
  const payload = {
    scores: { content: 2, image: 1, video: 0, audio: 0, other: 0 },
    shares: [
      { author: 'Tac gia kiem tra 2C', percent: 60 },
      { author: 'Dong tac gia kiem tra 2C', percent: 40 },
    ],
  };
  const dto = plainToInstance(RoyaltyDto, payload);
  const errors = await validate(dto, { whitelist: true });
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert.equal(dto.shares?.length, 2);
  assert.equal(dto.shares?.[0]?.author, 'Tac gia kiem tra 2C');
  assert.equal(dto.shares?.[1]?.author, 'Dong tac gia kiem tra 2C');
  assert.equal(dto.shares?.[0]?.percent, 60);
  assert.equal(dto.shares?.[1]?.percent, 40);
  assert.equal(dto.scores?.content, 2);
  assert.equal(dto.scores?.image, 1);
});
