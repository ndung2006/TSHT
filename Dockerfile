# E-paper phase 1 — Stage 1 (viewer StPageFlip + PDF.js) + Stage 2 (DB + CMS).
# Node stdlib + pg only. Can poppler-utils (pdfinfo/pdftoppm) de render trang khi upload qua CMS.
FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY lib ./lib
COPY public ./public
COPY test ./test
COPY tools ./tools
COPY db ./db
# Du lieu mau cua 2 so seed (319 = 12 trang, 558 vung cao = 4 trang).
# Chi la ban sao de khoi dong lan dau; file upload that nam o STORAGE_DIR (volume).
COPY storage-seed ./storage-seed
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && mkdir -p /app/storage

ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/app/storage

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.mjs"]
