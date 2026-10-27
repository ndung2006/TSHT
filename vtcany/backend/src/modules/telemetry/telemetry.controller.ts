import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TelemetryService } from './telemetry.service';

class HeartbeatDto {
  @IsString()
  session_id!: string;
  @IsString()
  content_id!: string;
  @IsInt()
  @Min(0)
  current_time_seconds!: number;
  @IsOptional()
  @IsString()
  bitrate?: string;
  @IsOptional()
  @IsString()
  device_type?: string;
}

@Controller('telemetry')
export class TelemetryController {
  constructor(private telemetry: TelemetryService, private jwt: JwtService) {}

  // Bước 4: ẩn danh vẫn gửi được (xem không cần login). user_id lấy từ JWT,
  // không tin client gửi lên; ẩn danh dùng khóa anon:{session_id}.
  @Post('heartbeat')
  heartbeat(@Body() dto: HeartbeatDto, @Req() req: any) {
    const userId = this.optionalSub(req) || `anon:${dto.session_id}`;
    try {
      return this.telemetry.heartbeat({
        userId,
        sessionId: dto.session_id,
        contentId: dto.content_id,
        positionSec: dto.current_time_seconds,
        bitrate: dto.bitrate,
        ip: req.ip,
      });
    } catch (e: any) {
      if (e?.status === 403) throw new HttpException('device limit exceeded', HttpStatus.FORBIDDEN);
      throw e;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('continue-watching')
  continueWatching(@Req() req: any) {
    const userId = req.user?.sub || req.user?.username || 'unknown';
    return this.telemetry.continueWatching(userId);
  }

  @Get('continue-watching/:userId')
  continueWatchingBy(@Param('userId') userId: string) {
    return this.telemetry.continueWatching(userId);
  }

  private optionalSub(req: any): string | undefined {
    const header: string = req.headers?.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return undefined;
    try {
      return this.jwt.verify(token)?.sub;
    } catch {
      return undefined;
    }
  }
}
