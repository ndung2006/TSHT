import { Controller, Get, Query } from '@nestjs/common';
import { DistributionService } from './distribution.service';

// Doc cong khai phan phoi: khong JWT, khong ma tran quyen. Chi bai
// status='published' moi hien; bai nhap tra nhu khong ton tai. Khong bao
// gio tra createdBy hay id noi bo; link dich chi hien khi dich da posted.
@Controller('distribution')
export class DistributionPublicController {
  constructor(private readonly dist: DistributionService) {}

  @Get()
  async list(@Query() q: any) {
    return this.dist.listPublic({ platform: q?.platform, page: q?.page, limit: q?.limit });
  }
}
