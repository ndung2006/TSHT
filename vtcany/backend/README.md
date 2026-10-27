# Backend — VTC ANY

Lớp API core cho toàn hệ thống.

Đề xuất stack: Node.js + NestJS + PostgreSQL + Redis (có thể thay bằng FastAPI/Python).

## Cấu trúc đề xuất `src/`

```
src/
├── modules/      # auth, users, media, billing...
├── common/       # guards, interceptors, filters, decorators
├── config/       # env, database, redis
├── database/     # migrations, seeds
└── main.ts       # entry point
```

## Lệnh

```bash
npm install
npm run dev
```

## Phase 1 (da code + verified)

```bash
cp .env.example .env   # sua VTC_HLS_SECRET, JWT_SECRET
npm install
npm test               # build + 5 test ky HMAC
npm run dev            # :3001
```

- Login: `POST /api/v1/auth/login {admin/admin123}` -> JWT.
- Live token: `POST /api/v1/playback/token {type:live, slug:PHUTHO, ttlMinutes:10}` -> `/hls/<CHANNEL>/master.m3u8?token=&exp=`.
- Duyet bai: `POST /videos -> /videos/:id/submit -> /videos/:id/publish`.
- Secret HLS chi o server, ho tro xoay `VTC_HLS_SECRET_PREVIOUS`.
