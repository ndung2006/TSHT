import test from 'node:test';
import assert from 'node:assert/strict';
import { ContentService } from './dist/modules/content/content.service.js';
import { EpgService } from './dist/modules/content/epg.service.js';
import { ApiExceptionFilter } from './dist/common/api-exception.filter.js';
import { HttpException, HttpStatus } from '@nestjs/common';

test('videos paginate with total', () => {
  const c = new ContentService();
  for (let i = 0; i < 5; i++) c.create(`v${i}`);
  const p1 = c.listPaged(1, 2);
  assert.equal(p1.data.length, 2);
  assert.equal(p1.meta.total, 5);
  assert.equal(c.listPaged(3, 2).data.length, 1);
});

test('epg isolates timelines by date', () => {
  const e = new EpgService();
  e.set('PHUTHO', [{ time: '20:00', title: 'A', status: 'LIVE' }], '2026-09-25');
  assert.equal(e.get('PHUTHO', '2026-09-25').length, 1);
  assert.equal(e.get('PHUTHO', '2026-09-26').length, 0);
});

test('errors use { error: { code, message } } envelope', () => {
  const f = new ApiExceptionFilter();
  let out;
  const host = { switchToHttp: () => ({ getResponse: () => ({ status: () => ({ json: (b) => (out = b) }) }) }) };
  f.catch(new HttpException('nope', HttpStatus.NOT_FOUND), host);
  assert.equal(out.error.code, 'not_found');
});
