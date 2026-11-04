import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { PageViewService } from './pageview.service';
import { CollectRateLimitGuard } from '../auth/rate-limit.guard';

// POST /api/v1/pageviews — cong khai, khong can auth. Body: { articlePublicId?, path?, sessionId? }.
// Chi luu bai duoc xem + thoi diem + sessionId (token phien do client tu sinh);
// khong luu IP/user-agent/user id. UA chi dung de loc bot roi bo.
// Gioi han tan suat theo IP: guard thu thap (300 req/phut/IP, xem rate-limit.guard).
@Controller('pageviews')
export class PageViewController {
  constructor(private readonly pageviews: PageViewService) {}

  @UseGuards(CollectRateLimitGuard)
  @Post()
  async record(@Body() body: any, @Headers('user-agent') ua?: string) {
    return this.pageviews.record(body || {}, ua);
  }
}
