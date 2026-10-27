# services/api — Core API (NestJS)

Implementation hiện tại nằm ở `../../backend/` (NestJS 10 + JWT + in-memory store ở Phase 1).

Bước 1/8 chỉ yêu cầu skeleton + migration. Migration chuẩn ở:
- `prisma/migrations/0001_step1_init.sql` (bản copy)
- `../../backend/prisma/migrations/0001_step1_init.sql` (bản chính)

Bước 2 (đã xong trong `../../backend/`):
- `GET /api/v1/layout/home` → `src/modules/layout/` (service + `seed-data.ts` 6 blocks)
- `POST /auth/oauth/:provider`, `POST /auth/admin/login`, `GET /auth/me` → `src/modules/auth/`
- Seed: `src/seed/seed.ts`, chạy `npm run seed -w backend`
