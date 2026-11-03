FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl poppler-utils ffmpeg
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
CMD ["sh", "worker-entrypoint.sh"]
