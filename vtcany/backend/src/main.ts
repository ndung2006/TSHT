import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { verifyMedia } from './modules/uploads/media-sign';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const express = app.getHttpAdapter().getInstance();
  // JSON cho API; chunk nhi phan di stream rieng, khong qua parser.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  express.use('/api', require('express').json({ limit: '256kb' }));
  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new ApiExceptionFilter());
  // Serve file local: /media/<file> <- storage/hls (VOD sau transcode).
  // BAT BUOC co chu ky HMAC hop le (?exp=&sig=) - chan hotlink truc tiep.
  // Middleware chay TRUOC static assets (dang ky truoc = chay truoc).
  express.use('/media', (req: any, res: any, next: any) => {
    const uploadId = (req.path as string).split('/').filter(Boolean)[0] || '';
    const { exp, sig } = (req.query || {}) as { exp?: string; sig?: string };
    if (!verifyMedia(uploadId, exp, sig)) {
      res.status(403).json({
        error: { code: 'media_forbidden', message: 'URL phat media het han hoac khong hop le' },
      });
      return;
    }
    next();
  });
  const storageRoot = process.env.STORAGE_DIR || join(__dirname, '..', '..', 'storage');
  const hlsDir = join(storageRoot, 'hls');
  mkdirSync(hlsDir, { recursive: true });
  app.useStaticAssets(hlsDir, { prefix: '/media/' });
  // Anh thumbnail/poster/banner: noi dung hien thi cong khai nen khong ky HMAC.
  const imagesDir = join(storageRoot, 'images');
  mkdirSync(imagesDir, { recursive: true });
  app.useStaticAssets(imagesDir, { prefix: '/images/' });
  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`VTC ANY backend listening on :${port}`);
}
bootstrap();
