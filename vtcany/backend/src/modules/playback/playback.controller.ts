import { Body, Controller, Get, HttpException, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RateLimitGuard } from '../auth/rate-limit.guard';
import { PlaybackService } from './playback.service';

class MintTokenDto {
  @IsIn(['live'])
  type!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  ttlMinutes?: number;
}

@Controller('playback')
export class PlaybackController {
  constructor(private playback: PlaybackService) {}

  // Live-only (kenh AIO). VOD local phat thang qua /media, khong qua day.
  @UseGuards(JwtAuthGuard, RateLimitGuard)
  @Post('token')
  async token(@Body() dto: MintTokenDto) {
    try {
      return await this.playback.stream((dto.slug || 'PHUTHO').toUpperCase(), dto.ttlMinutes);
    } catch (e: any) {
      const msg = e?.message || 'playback failed';
      throw new HttpException({ error: { code: 'upstream_error', message: msg } }, HttpStatus.BAD_GATEWAY);
    }
  }

  // Danh muc kenh opt-in tu AIO (poll lai khi doi kenh/secret).
  @UseGuards(JwtAuthGuard)
  @Get('channels')
  async channels() {
    try {
      return await this.playback.listChannels();
    } catch (e: any) {
      throw new HttpException(
        { error: { code: 'upstream_error', message: e?.message || 'channels failed' } },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
