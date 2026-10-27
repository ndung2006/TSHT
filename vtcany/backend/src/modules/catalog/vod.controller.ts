import { Controller, Get, HttpException, HttpStatus, Param } from '@nestjs/common';
import { VodKind, VodService } from './vod.service';

const KINDS: VodKind[] = ['episode', 'video', 'short'];

// Phat VOD cong khai cho noi dung catalog da xuat ban:
// GET /api/v1/vod/episode/:id/play | /vod/video/:id/play | /vod/short/:id/play
// Khong can JWT: noi dung chua xuat ban tra 404, URL playlist ky HMAC han 15 phut.
@Controller('vod')
export class VodController {
  constructor(private vod: VodService) {}

  @Get(':kind/:id/play')
  async play(@Param('kind') kind: string, @Param('id') id: string) {
    if (!KINDS.includes(kind as VodKind)) {
      throw new HttpException({ error: { code: 'bad_kind', message: 'kind phai la episode|video|short' } }, HttpStatus.BAD_REQUEST);
    }
    try {
      return await this.vod.resolvePlay(kind as VodKind, id);
    } catch (e: any) {
      const msg = e?.message || '';
      if (msg === 'not published' || msg === 'not found') {
        throw new HttpException({ error: { code: 'not_published', message: 'noi dung chua xuat ban' } }, HttpStatus.NOT_FOUND);
      }
      throw new HttpException({ error: { code: 'vod_not_ready', message: 'video chua san sang (chua gan file hoac transcode chua xong)' } }, HttpStatus.NOT_FOUND);
    }
  }
}
