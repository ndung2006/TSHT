FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl poppler-utils ffmpeg
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npx prisma migrate deploy || echo 'WARN: prisma migrate deploy failed, continuing without it'; fi; node worker/transcode-worker.mjs & exec node dist/main.js"]
