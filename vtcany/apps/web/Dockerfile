FROM node:20-alpine
# wget: Coolify healthcheck trong container (curl không có sẵn trên alpine).
RUN apk add --no-cache wget
WORKDIR /app
COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
ENV HOST=0.0.0.0 PORT=3000 NITRO_HOST=0.0.0.0 NITRO_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=90s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/ > /dev/null || exit 1
CMD ["node", ".output/server/index.mjs"]
