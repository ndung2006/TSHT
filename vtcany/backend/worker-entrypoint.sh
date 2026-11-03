#!/bin/sh
# Entrypoint chon giua backend API va transcode worker (cung image, 2 app
# rieng tren Coolify — giong mo hinh WORKER rieng cua VTCANY).
#
# - WORKER_MODE=true (hoac 1): chi chay worker, khong migrate, khong API.
#   Worker app can: WORKER_MODE=true, cung mount STORAGE_DIR voi backend
#   (shared volume), MEDIA_WEBHOOK_SECRET trung backend, TRANSCODE_API_BASE
#   tro toi URL API public cua backend.
# - Mac dinh (WORKER_MODE unset hoac khac): hanh vi goc cua backend, khong
#   doi — migrate khi co DATABASE_URL roi chay API (nguyen van lenh CMD cu).
if [ "$WORKER_MODE" = "true" ] || [ "$WORKER_MODE" = "1" ]; then
  exec node worker/transcode-worker.mjs
fi
if [ -n "$DATABASE_URL" ]; then npx prisma migrate deploy || echo 'WARN: prisma migrate deploy failed, continuing without it'; fi
node dist/main.js
