// Test logic thuan Facebook (Goi 2D-3): cau hinh env, URL OAuth, ke hoach
// dang bai, doc phan hoi Graph. Khong goi mang — phan goi Graph that nam
// o facebook.service.ts va chi chay khi da ket noi Page that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  absolutize, buildOAuthUrl, facebookConfigFromEnv, graphErrorMessage,
  parseGraphPostResult, planFacebookPost,
} from './src/modules/distribution/facebook.ts';

const ENV = { FB_APP_ID: '123', FB_APP_SECRET: 's3cr3t', FB_REDIRECT_URI: 'https://api.example.vn/api/v1/admin/distribution/facebook/callback' };

test('facebookConfigFromEnv: thieu truong -> null (khong hien nut gia)', () => {
  assert.equal(facebookConfigFromEnv({}), null);
  assert.equal(facebookConfigFromEnv({ FB_APP_ID: '1', FB_APP_SECRET: 'x' }), null);
  const cfg = facebookConfigFromEnv(ENV);
  assert.equal(cfg.appId, '123');
  assert.equal(cfg.redirectUri, ENV.FB_REDIRECT_URI);
});

test('buildOAuthUrl: dung dialog/oauth + scope dang bai', () => {
  const cfg = facebookConfigFromEnv(ENV);
  const u = buildOAuthUrl(cfg, 'state-abc');
  assert.ok(u.startsWith('https://www.facebook.com/v21.0/dialog/oauth?'));
  assert.ok(u.includes('client_id=123'));
  assert.ok(u.includes('state=state-abc'));
  assert.ok(decodeURIComponent(u).includes('pages_manage_posts'));
});

test('absolutize: tuong doi -> tuyet doi theo base; thieu base -> null', () => {
  assert.equal(absolutize('/images/a.png', 'https://api.example.vn'), 'https://api.example.vn/images/a.png');
  assert.equal(absolutize('https://cdn.example.vn/a.png', 'https://api.example.vn'), 'https://cdn.example.vn/a.png');
  assert.equal(absolutize('/images/a.png', ''), null);
  assert.equal(absolutize(null, 'https://api.example.vn'), null);
});

test('planFacebookPost: anh -> /photos; khong anh -> /feed kem link', () => {
  const withImg = planFacebookPost('PAGE1', { title: 'Tieu de', caption: 'Mo ta', mediaUrl: '/images/a.png', mediaType: 'image' }, 'https://api.example.vn');
  assert.equal(withImg.endpoint, 'PAGE1/photos');
  assert.equal(withImg.body.url, 'https://api.example.vn/images/a.png');
  assert.equal(withImg.body.caption, 'Tieu de\n\nMo ta');

  const noImg = planFacebookPost('PAGE1', { title: 'Chi chu', mediaUrl: null, mediaType: 'image' }, 'https://api.example.vn');
  assert.equal(noImg.endpoint, 'PAGE1/feed');
  assert.equal(noImg.body.message, 'Chi chu');
  assert.equal(noImg.body.link, undefined);

  const video = planFacebookPost('PAGE1', { title: 'Video', mediaUrl: 'https://cdn.example.vn/v.mp4', mediaType: 'video' }, '');
  assert.equal(video.endpoint, 'PAGE1/feed');
  assert.equal(video.body.link, 'https://cdn.example.vn/v.mp4');
});

test('parseGraphPostResult: feed id / photos post_id / thieu id -> null', () => {
  assert.deepEqual(parseGraphPostResult({ id: '111_222' }), { postId: '111_222', url: 'https://www.facebook.com/111_222' });
  assert.deepEqual(parseGraphPostResult({ id: '999', post_id: '111_333' }), { postId: '111_333', url: 'https://www.facebook.com/111_333' });
  assert.equal(parseGraphPostResult({}), null);
  assert.equal(parseGraphPostResult(null), null);
});

test('graphErrorMessage: lay message Graph, cat 500 ky tu', () => {
  assert.equal(graphErrorMessage({ error: { message: 'Invalid OAuth access token.' } }), 'Invalid OAuth access token.');
  assert.equal(graphErrorMessage({}), 'Graph API loi khong ro');
  assert.equal(graphErrorMessage({ error: { message: 'x'.repeat(900) } }).length, 500);
});
