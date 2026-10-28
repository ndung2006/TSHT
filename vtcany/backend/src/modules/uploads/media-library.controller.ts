import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { MediaLibraryService } from './media-library.service';

// GET /api/v1/admin/media?kind=image|video|audio&q=...&page=&limit=
// Thu vien dung chung cho CMS (trang Thu vien + chon anh tu editor).
// Quyen catalog:read — giong endpoint /uploads/images hien co.
@UseGuards(PermissionsGuard)
@Controller('admin/media')
export class MediaLibraryController {
  constructor(private readonly library: MediaLibraryService) {}

  @RequirePerms('catalog:read')
  @Get()
  async list(@Query() q: any) {
    return this.library.list({ kind: q?.kind, q: q?.q, page: q?.page, limit: q?.limit });
  }
}
