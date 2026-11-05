import { Body, Controller, Headers, HttpException, HttpStatus, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { ChannelTelemetryService } from './channel-telemetry.service';
import { CollectRateLimitGuard } from '../auth/rate-limit.guard';

// Thu telemetry kenh (GĐ3 nen). Endpoint heartbeat CONG KHAI, khong JWT:
// body chi co sessionId ngau nhien + ten kenh + loai xem + contentId
// (VOD), khong dinh danh nguoi dung; gioi han body bang DTO (kem gioi
// han JSON 256kb toan cuc) + gioi han tan suat theo IP (guard).
// Endpoint gop ngay: internal, giu bang shared secret giong
// /internal/transcode-queue (x-webhook-secret = MEDIA_WEBHOOK_SECRET),
// worker tick goi moi gio.
class ChannelHeartbeatDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  sessionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  channel?: string;

  @IsString()
  @IsIn(['live', 'timeshift', 'vod'])
  type!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  contentId?: string;
}

@Controller()
export class ChannelTelemetryController {
  constructor(
    private readonly telemetry: ChannelTelemetryService,
    private readonly config: ConfigService,
  ) {}

  @UseGuards(CollectRateLimitGuard)
  @Post('channel-telemetry/heartbeat')
  async heartbeat(@Body() body: ChannelHeartbeatDto, @Headers('user-agent') ua?: string) {
    return this.telemetry.heartbeat(body, ua);
  }

  // Gop tay 1 ngay cu: POST /internal/rollup-daily?date=YYYY-MM-DD.
  // Khong co ?date= thi job gio chi gop lai N ngay VN gan nhat.
  @Post('internal/rollup-daily')
  async rollup(@Headers('x-webhook-secret') secret: string, @Query('date') date?: string) {
    const expected = this.config.get<string>('MEDIA_WEBHOOK_SECRET', '');
    if (!expected || secret !== expected) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    try {
      return await this.telemetry.rollupDaily(date);
    } catch (e: any) {
      if (e?.message?.startsWith('INVALID_DATE:')) {
        throw new HttpException(e.message, HttpStatus.BAD_REQUEST);
      }
      throw e;
    }
  }
}
