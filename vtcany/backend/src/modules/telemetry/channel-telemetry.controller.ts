import { Body, Controller, Headers, HttpException, HttpStatus, Logger, Post, Query, UseGuards } from '@nestjs/common';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { ChannelTelemetryService } from './channel-telemetry.service';
import { CollectRateLimitGuard } from '../auth/rate-limit.guard';

// Thu telemetry kenh (GĐ3 nen). Endpoint heartbeat CONG KHAI, khong JWT:
// body chi co sessionId ngau nhien + ten kenh + loai xem + contentId
// (VOD) + 3 truong beat cuoi VOD (watchedSeconds/final/durationSec),
// khong dinh danh nguoi dung; gioi han body bang DTO (kem gioi
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

  // Beat cuoi VOD (3c-final-beat): portal gui them watchedSeconds (so
  // giay THUC SU phat) + final:true + durationSec. DTO PHAI khai du
  // 3 truong nay — neu khong, global ValidationPipe (whitelist: true,
  // main.ts) se luoc bo chung truoc khi service nhan (bug phat hien
  // 2026-11-08: beat cuoi bi ghi thanh beat thuong).
  @IsOptional()
  @IsInt()
  @Min(0)
  watchedSeconds?: number;

  @IsOptional()
  @IsBoolean()
  final?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;
}

@Controller()
export class ChannelTelemetryController {
  private readonly logger = new Logger(ChannelTelemetryController.name);

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
      // Buoc 0.5: ghi day du chi tiet loi ra log backend (ten + message
      // + stack) thay vi nuot — loi 0.1 (PrismaClientValidationError
      // "Unknown argument `watchedSeconds`") truoc day chi tra body
      // generic {"error":{"code":"internal_error"...}} va khong de lai
      // dong log nao nen kho chan doan. Body HTTP tra ve GIU NGUYEN
      // (khong doi contract): Nest tu doi loi chua bat thanh 500.
      this.logger.error(
        `rollup-daily failed (date=${date ?? '(auto)'}): ${e?.name || 'Error'}: ${e?.message || e}`,
        e?.stack,
      );
      throw e;
    }
  }
}
