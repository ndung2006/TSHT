// Test logic DIEM NHUAN BUT (Goi 2C) — node --test truc tiep.
// Diem theo 5 thanh phan (nguyen 0..3), chia theo ti le %, mac dinh
// chia deu — theo file thong ke that + thiet ke 2C chot 30/10/2026.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  SCORE_MAX,
  articleTotal,
  authorPoints,
  equalShares,
  normalizeScores,
  validateScores,
  validateShares,
} from './src/modules/royalties/royalties-score.ts';

test('diem thanh phan phai la so nguyen trong thang 0..3', () => {
  assert.equal(SCORE_MAX, 3);
  assert.deepEqual(validateScores({ content: 2, image: 3, video: 0, audio: 0, other: 1 }), []);
  assert.equal(validateScores({ content: 4 }).length, 1);
  assert.equal(validateScores({ content: -1 }).length, 1);
  assert.equal(validateScores({ content: 2.5 }).length, 1);
  assert.deepEqual(validateScores({}), []); // thieu = 0
  assert.deepEqual(normalizeScores({ content: 2 }), { content: 2, image: 0, video: 0, audio: 0, other: 0 });
});

test('chia deu: phan du don vao tac gia dau, tong luon 100', () => {
  assert.deepEqual(equalShares(['A']), [{ author: 'A', percent: 100 }]);
  assert.deepEqual(equalShares(['A', 'B']), [{ author: 'A', percent: 50 }, { author: 'B', percent: 50 }]);
  const three = equalShares(['A', 'B', 'C']);
  assert.equal(three.reduce((s, x) => s + x.percent, 0), 100);
  assert.equal(three[0].percent, 34);
  assert.deepEqual(equalShares([]), []);
});

test('validate ti le: du tac gia, khong trung, tong 100', () => {
  assert.deepEqual(validateShares(['A'], [{ author: 'A', percent: 100 }]), []);
  assert.deepEqual(validateShares(['A', 'B'], [{ author: 'A', percent: 60 }, { author: 'B', percent: 40 }]), []);
  assert.ok(validateShares(['A', 'B'], [{ author: 'A', percent: 100 }]).length > 0); // thieu B
  assert.ok(validateShares(['A'], [{ author: 'A', percent: 90 }]).length > 0); // tong != 100
  assert.ok(validateShares(['A'], [{ author: 'X', percent: 100 }]).length > 0); // nguoi la
  assert.ok(validateShares(['A'], [{ author: 'A', percent: 60 }, { author: 'A', percent: 40 }]).length > 0); // trung
  assert.ok(validateShares(['A'], [{ author: 'A', percent: 101 }]).length > 0); // vuot 100
  assert.deepEqual(validateShares([], []), []);
  assert.ok(validateShares([], [{ author: 'A', percent: 100 }]).length > 0); // bai khong tac gia
});

test('diem tac gia = diem thanh phan x ti le; 1 tac gia giu nguyen so nguyen nhu file mau', () => {
  const scores = { content: 2, image: 2, video: 0, audio: 0, other: 0 };
  const one = authorPoints(scores, [{ author: 'A', percent: 100 }]);
  assert.deepEqual(one, [{ author: 'A', percent: 100, content: 2, image: 2, video: 0, audio: 0, other: 0, total: 4 }]);
  const two = authorPoints(scores, [{ author: 'A', percent: 50 }, { author: 'B', percent: 50 }]);
  assert.equal(two[0].content, 1);
  assert.equal(two[0].total, 2);
  assert.equal(two[1].total, 2);
  const odd = authorPoints({ content: 3, image: 0, video: 0, audio: 0, other: 0 }, [{ author: 'A', percent: 34 }, { author: 'B', percent: 66 }]);
  assert.equal(odd[0].content, 1.02); // lam tron 2 chu so thap phan
  assert.equal(odd[1].content, 1.98);
});

test('tong diem bai = tong 5 thanh phan', () => {
  assert.equal(articleTotal({ content: 2, image: 1, video: 0, audio: 0, other: 3 }), 6);
  assert.equal(articleTotal({ content: 0, image: 0, video: 0, audio: 0, other: 0 }), 0);
});
