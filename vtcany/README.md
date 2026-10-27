# VTC ANY — Fullstack System

Monorepo cho hệ thống Full-stack gồm Backend, Frontend và các ứng dụng mở rộng.

## Cấu trúc

```
VTC ANY/
├── backend/            # API Backend (NestJS / FastAPI / Express - tùy chọn)
│   └── src/
├── frontend/           # Web Frontend (Next.js / React)
│   ├── src/
│   └── public/
├── apps/               # Các ứng dụng dựa trên core
│   ├── mobile-app/     # App Mobile (Flutter / React Native)
│   └── admin-portal/   # Trang quản trị
├── packages/           # Code dùng chung
│   ├── shared-types/   # Types / DTO dùng chung BE-FE
│   ├── ui-kit/         # Component UI dùng chung
│   └── utils/          # Hàm tiện ích chung
├── infra/              # Hạ tầng
│   ├── docker/
│   ├── k8s/
│   └── nginx/
├── docs/               # Tài liệu kiến trúc, API, setup
└── scripts/            # Script dev / build / deploy
```

## Quickstart

```bash
# 1. Backend
cd backend && npm install && npm run dev

# 2. Frontend
cd frontend && npm install && npm run dev

# 3. All services (DB, Redis...)
docker-compose up -d
```

Xem chi tiết: `docs/setup.md`, `docs/architecture.md`.
