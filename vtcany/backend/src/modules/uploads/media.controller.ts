import { Controller, Get, HttpException, HttpStatus, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UploadsService } from './uploads.service';
import { verifyMedia } from './media-sign';

// Playlist HLS cho VOD tu host: /api/v1/media/<uploadId>/playlist.m3u8?exp=..&sig=..
// Khong dung Bearer (player khong gui duoc) - xac thuc bang chu ky HMAC trong query.
// Controller viet lai segment URL thanh URL ky rieng (han 8h) vi player
// khong phai luc nao cung forward query string sang segment.
@Controller('media')
export class MediaController {
  constructor(private readonly uploads: UploadsService) {}

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
}
