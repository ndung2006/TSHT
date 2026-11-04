import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PageViewService } from './pageview.service';

// POST /api/v1/pageviews — cong khai, khong can auth. Body: { articlePublicId?, path?, sessionId? }.
// Chi luu bai duoc xem + thoi diem + sessionId (token phien do client tu sinh);
// khong luu IP/user-agent/user id. UA chi dung de loc bot roi bo.
@Controller('pageviews')
export class PageViewController {
  constructor(private readonly pageviews: PageViewService) {}

  @Post()
  async record(@Body() body: any, @Headers('user-agent') ua?: string) {
    return this.pageviews.record(body || {}, ua);
  }
}
