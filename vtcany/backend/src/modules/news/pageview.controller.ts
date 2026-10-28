import { Body, Controller, Post } from '@nestjs/common';
import { PageViewService } from './pageview.service';

// POST /api/v1/pageviews — cong khai, khong can auth. Body: { articlePublicId?, path? }.
// Chi luu bai duoc xem + thoi diem; khong luu IP/user-agent/user id.
@Controller('pageviews')
export class PageViewController {
  constructor(private readonly pageviews: PageViewService) {}

  @Post()
  async record(@Body() body: any) {
    return this.pageviews.record(body || {});
  }
}
