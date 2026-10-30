import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { MediaLibraryService } from './media-library.service';

// GET /api/v1/admin/media?kind=image|video|audio&q=...&page=&limit=
// Thu vien dung chung cho CMS (trang Thu vien + chon anh tu editor).
// Quyen catalog:read — giong endpoint /uploads/images hien co.
// DELETE /api/v1/admin/media/:id — quyen catalog:delete (module Catalog
// trong ma tran quyen da co san hanh dong delete, khong can khai bao moi;
// CMS gate nut bang can('catalog:delete'), fail-closed khi thieu quyen).
//
// Thu muc logic (Goi 2D-1): /admin/media-folders CRUD + PATCH
// /admin/media/:id/folder de chuyen file giua cac thu muc. Dung chung
// quyen catalog (read/create/update/delete), khong them module quyen moi.
@UseGuards(PermissionsGuard)
@Controller('admin/media')
export class MediaLibraryController {
  constructor(private readonly library: MediaLibraryService) {}

  @RequirePerms('catalog:read')
  @Get()
  async list(@Query() q: any) {
    return this.library.list({ kind: q?.kind, q: q?.q, page: q?.page, limit: q?.limit, folderId: q?.folderId });
  }

  @RequirePerms('catalog:update')
  @Patch(':id/folder')
  async move(@Param('id') id: string, @Body() body: any) {
    return this.library.moveItem(id, body || {});
  }

  @RequirePerms('catalog:delete')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.library.remove(id);
  }
}

@UseGuards(PermissionsGuard)
@Controller('admin/media-folders')
export class MediaFoldersController {
  constructor(private readonly library: MediaLibraryService) {}

  @RequirePerms('catalog:read')
  @Get()
  async list() {
    return this.library.listFolders();
  }

  @RequirePerms('catalog:create')
  @Post()
  async create(@Body() body: any) {
    return this.library.createFolder(body || {});
  }

  @RequirePerms('catalog:update')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.library.updateFolder(id, body || {});
  }

  @RequirePerms('catalog:delete')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.library.deleteFolder(id);
  }
}
