# Setup

1. Cài Node 20+, Docker, Git.
2. Copy env:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```
3. Chạy infra: `docker-compose up -d postgres redis`
4. Chạy backend, frontend riêng hoặc `npm run dev`.
