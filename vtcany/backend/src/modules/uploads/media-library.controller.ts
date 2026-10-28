import { Controller, Delete, Get, Param, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { MediaLibraryService } from './media-library.service';

// GET /api/v1/admin/media?kind=image|video|audio&q=...&page=&limit=
// Thu vien dung chung cho CMS (trang Thu vien + chon anh tu editor).
// Quyen catalog:read — giong endpoint /uploads/images hien co.
// DELETE /api/v1/admin/media/:id — quyen catalog:delete (module Catalog
// trong ma tran quyen da co san hanh dong delete, khong can khai bao moi;
// CMS gate nut bang can('catalog:delete'), fail-closed khi thieu quyen).
@UseGuards(PermissionsGuard)
@Controller('admin/media')
export class MediaLibraryController {
  constructor(private readonly library: MediaLibraryService) {}

  @RequirePerms('catalog:read')
  @Get()
  async list(@Query() q: any) {
    return this.library.list({ kind: q?.kind, q: q?.q, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('catalog:delete')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.library.remove(id);
  }
}
