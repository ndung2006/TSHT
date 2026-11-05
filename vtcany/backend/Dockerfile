FROM node:20-alpine
WORKDIR /app
# wget: Coolify healthcheck trong container (curl khong co san tren alpine).
RUN apk add --no-cache openssl poppler-utils ffmpeg wget
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
# Healthcheck that (2026-11-05): chi bao healthy khi /api/v1/health tra
# 200 — endpoint nay kiem tra DB that (SELECT 1). start-period 120s de
# cho `prisma migrate deploy` + Nest bootstrap + lan khoi dong Prisma
# engine xong truoc khi tinh that bai; giong mau HEALTHCHECK cua CMS.
# Cung image dung cho 2 app: backend chay API (WORKER_MODE unset) va
# worker chay `exec node worker/transcode-worker.mjs` (WORKER_MODE=true)
# — worker KHONG co HTTP server cong 3001 nen goi /health luon fail.
# Healthcheck tu nhan biet qua WORKER_MODE: worker kiem tra file heartbeat
# /tmp/worker-alive — worker ghi timestamp moi vong poll (them setInterval
# de file khong cu trong luc transcode dai) — file phai ton tai va tuoi
# <= 90s thi dat, khong thi truot. KHONG cham DB/backend trong healthcheck.
# Backend giu kiem tra HTTP nhu cu.
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD if [ "$WORKER_MODE" = "true" ] || [ "$WORKER_MODE" = "1" ]; then f=${WORKER_HEARTBEAT_FILE:-/tmp/worker-alive}; [ -f "$f" ] && [ $(( $(date +%s) - $(stat -c %Y "$f") )) -le 90 ]; else wget -qO- http://127.0.0.1:3001/api/v1/health > /dev/null; fi
CMD ["sh", "worker-entrypoint.sh"]
