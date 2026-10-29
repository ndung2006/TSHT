import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { ZoneService } from './zone.service';

class PinDto {
  @IsString()
  articlePublicId!: string;
}

class MoveDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}

// Quan ly vung hien thi — Gói 1A. Ghim/bo ghim/sap xep bai trong vung
// la hanh dong "Cong khai" (zones:publish) vi no doi truc tiep noi dung
// trang chu; xem danh sach va ung vien la zones:view.
@UseGuards(PermissionsGuard)
@Controller('admin/zones')
export class ZoneAdminController {
  constructor(private readonly zones: ZoneService) {}

  @RequirePerms('zones:view')
  @Get()
  async list() {
    return this.zones.listAdmin();
  }

  @RequirePerms('zones:view')
  @Get('candidates')
  async candidates(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.zones.listCandidates(q, limit ? Number(limit) : 50);
  }

  @RequirePerms('zones:publish')
  @Post(':key/pin')
  async pin(@Param('key') key: string, @Body() dto: PinDto) {
    return this.zones.pin(key, dto.articlePublicId);
  }

  @RequirePerms('zones:publish')
  @Delete(':key/pin/:articlePublicId')
  async unpin(@Param('key') key: string, @Param('articlePublicId') articlePublicId: string) {
    return this.zones.unpin(key, articlePublicId);
  }

  @RequirePerms('zones:publish')
  @Post(':key/move')
  async move(@Param('key') key: string, @Body() dto: MoveDto & { articlePublicId: string }) {
    return this.zones.move(key, dto.articlePublicId, dto.direction);
  }
}

// Khoi cong khai cua mot vung (trang chu doc qua proxy TSHT
// /api/v2/zones/:key). Chi tra bai da xuat ban, khong tra truong noi bo.
@Controller('zones')
export class ZonePublicController {
  constructor(private readonly zones: ZoneService) {}

  @Get(':key')
  async block(@Param('key') key: string) {
    return this.zones.getPublicBlock(key);
  }
}
