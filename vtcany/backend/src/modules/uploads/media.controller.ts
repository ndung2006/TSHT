import { Controller, Get, HttpException, HttpStatus, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createReadStream, statSync } from 'fs';
import { UploadsService } from './uploads.service';
import { isValidUploadId, verifyMedia } from './media-sign';
import { parseRangeHeader } from './range-parse';
import { PrismaService } from '../../prisma/prisma.service';

// Playlist HLS cho VOD tu host: /api/v1/media/<uploadId>/playlist.m3u8?exp=..&sig=..
// Khong dung Bearer (player khong gui duoc) - xac thuc bang chu ky HMAC trong query.
// Controller viet lai segment URL thanh URL ky rieng (han 8h) vi player
// khong phai luc nao cung forward query string sang segment.
@Controller('media')
export class MediaController {
  constructor(
    private readonly uploads: UploadsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':uploadId/playlist.m3u8')
  playlist(
    @Param('uploadId') uploadId: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    if (!verifyMedia(uploadId, exp, sig)) {
      throw new HttpException(
        { error: { code: 'media_forbidden', message: 'URL phat media het han hoac khong hop le' } },
        HttpStatus.FORBIDDEN,
      );
    }
    try {
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
      const baseUrl = `${proto}://${req.get('host')}`;
      const body = this.uploads.signedPlaylist(uploadId, baseUrl);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-store');
      res.send(body);
    } catch {
      throw new HttpException(
        { error: { code: 'playlist_not_found', message: 'playlist chua san sang' } },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // Variant playlist cho multibitrate (360p.m3u8, 480p.m3u8, ...):
  // /api/v1/media/<uploadId>/v/<variant>.m3u8?exp=..&sig=..
  // Rewrite segment ben trong thanh URL ky tuyet doi (player khong forward query).
  @Get(':uploadId/v/:variant')
  variant(
    @Param('uploadId') uploadId: string,
    @Param('variant') variant: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    if (!verifyMedia(uploadId, exp, sig)) {
      throw new HttpException(
        { error: { code: 'media_forbidden', message: 'URL phat media het han hoac khong hop le' } },
        HttpStatus.FORBIDDEN,
      );
    }
    try {
      const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
      const baseUrl = `${proto}://${req.get('host')}`;
      const body = this.uploads.signedVariantPlaylist(uploadId, variant, baseUrl);
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
      res.set('Cache-Control', 'no-store');
      res.send(body);
    } catch {
      throw new HttpException(
        { error: { code: 'playlist_not_found', message: 'playlist chua san sang' } },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  // File MP4 goc cua upload (DAM Proxy MP4):
  // GET /api/v1/media/<uploadId>/file.mp4 — phuc vu truc tiep qua TSHT
  // proxy /api/v2/media/<uploadId>/mp4 (URL on dinh cho ban nhap video).
  //
  // Khac playlist HLS (ky HMAC, het han 8h): route nay KHONG ky, thay
  // vao do gate bang hien thi catalog — chi phuc vu khi co it nhat mot
  // video/short catalog DANG HIEN THI tro toi upload nay (entity
  // videos|shorts, data.videoFileId = uploadId, data.isVisible = true).
  // Gate lay isVisible === true (chat hon quy uoc list cong khai
  // '!== false') de fail-closed: video bi an hoac chua tung hien thi
  // deu khong lo file. Moi truong hop khong phuc vu (id sai dinh dang,
  // khong co catalog hien thi, khong co ban ghi, khong co file) deu tra
  // CHUNG mot 404, khong lo dang thieu cai nao.
  // Cache no-store: trang thai hien thi co the doi bat ky luc nao.
  // Range: khong co Range -> 200 toan file; Range hop le -> 206 +
  // Content-Range; Range khong thoa man -> 416 + 'bytes */<size>'.
  @Get(':uploadId/file.mp4')
  async fileMp4(
    @Param('uploadId') uploadId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // @Res() bat Nest phai tu gui nen moi loi o day deu gui tay dang
    // JSON, khong throw HttpException (tranh request treo khi headers
    // da gui hoac exception filter khong bat kip trong luc stream).
    const notFound = (): void => {
      if (!res.headersSent) {
        res.status(404).json({ error: { code: 'media_not_found', message: 'khong tim thay file media' } });
      }
    };
    try {
      if (!isValidUploadId(uploadId)) return notFound();
      const gate = await this.prisma.catalogItem.findFirst({
        where: {
          entity: { in: ['videos', 'shorts'] },
          AND: [
            { data: { path: ['videoFileId'], equals: uploadId } },
            { data: { path: ['isVisible'], equals: true } },
          ],
        },
        select: { id: true },
      });
      if (!gate) return notFound();
      const localPath = this.uploads.resolveLocalFile(uploadId);
      if (!localPath) return notFound();
      const size = statSync(localPath).size;
      const range = req.headers.range;
      res.set('Accept-Ranges', 'bytes');
      res.set('Cache-Control', 'no-store');
      res.set('Content-Type', 'video/mp4');
      if (!range) {
        res.set('Content-Length', String(size));
        res.status(200);
        createReadStream(localPath).on('error', () => res.destroy()).pipe(res);
        return;
      }
      const parsed = parseRangeHeader(range, size);
      if (!parsed) {
        res.set('Content-Range', `bytes */${size}`);
        res.status(416).end();
        return;
      }
      res.set('Content-Length', String(parsed.end - parsed.start + 1));
      res.set('Content-Range', `bytes ${parsed.start}-${parsed.end}/${size}`);
      res.status(206);
      createReadStream(localPath, { start: parsed.start, end: parsed.end })
        .on('error', () => res.destroy())
        .pipe(res);
    } catch {
      // DB/stat loi cung an thanh 404 de khong lo cau truc noi bo.
      return notFound();
    }
  }
}
