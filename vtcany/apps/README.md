# Apps — Các ứng dụng dựa trên VTC ANY Core

| App | Mô tả | Stack gợi ý |
|-----|-------|-------------|
| `mobile-app/` | App end-user | Flutter / React Native |
| `admin-portal/` | Quản trị nội bộ | Next.js / Retool |

Mỗi app chỉ gọi Backend qua REST/gRPC, không truy cập DB trực tiếp.
Dùng chung `packages/shared-types` và `packages/ui-kit`.
