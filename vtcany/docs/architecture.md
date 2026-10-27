# Kiến trúc VTC ANY

```
[Mobile App] [Web Frontend] [Admin Portal]
        \        |          /
         └── API Gateway / Backend ── PostgreSQL / Redis / S3
```

- Backend: REST + Auth JWT, phân module theo domain.
- Frontend/Apps: stateless, xác thực qua Backend.
- Packages chung để đồng bộ DTO, UI, utils.
- Infra: Docker Compose (dev), K8s + Nginx (prod).
