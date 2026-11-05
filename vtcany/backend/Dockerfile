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
HEALTHCHECK --interval=10s --timeout=5s --start-period=120s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/v1/health > /dev/null || exit 1
CMD ["sh", "worker-entrypoint.sh"]
