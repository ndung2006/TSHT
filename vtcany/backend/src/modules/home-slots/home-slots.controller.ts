import { Body, Controller, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { AuditService } from '../audit/audit.service';
import { HomeSlotService } from './home-slots.service';

class SaveHomeSlotsDto {
  @IsArray()
  @IsString({ each: true })
  items!: string[];

  @IsInt()
  version!: number;

  // Q1: so vi tri toi da doi duoc trong cau hinh (chi zones:publish,
  // guard o route PUT). Q6: giam xuong duoi so bai dang co -> service
  // chan luu (400) chu khong am tham cat bot.
  @IsOptional()
  @IsInt()
  @Min(1)
  maxSlots?: number;
}

// Sap xep Tin noi bat / Tin tieu diem — Buoc 0 2026-11-05, phuong an A.
// Xem danh sach + kho la zones:view; luu bulk la zones:publish (vi doi
// truc tiep noi dung trang chu), dung quyen zones hien co, khong tao
// quyen moi — giong ZoneAdminController.
@UseGuards(PermissionsGuard)
@Controller('admin/home-slots')
export class HomeSlotAdminController {
  constructor(
    private readonly slots: HomeSlotService,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return {
      id: req.user?.sub || null,
      username: req.user?.username || req.user?.sub || null,
      roleName: id?.roleName || null,
      isFullAdmin: !!id?.isFullAdmin,
    };
  }

  @RequirePerms('zones:view')
  @Get(':block')
  async get(@Param('block') block: string) {
    return this.slots.getList(block);
  }

  @RequirePerms('zones:view')
  @Get(':block/pool')
  async pool(
    @Param('block') block: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.slots.listPool(block, q, page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @RequirePerms('zones:publish')
  @Put(':block')
  async save(@Param('block') block: string, @Body() dto: SaveHomeSlotsDto, @Req() req: any) {
    const a = await this.actor(req);
    const out = await this.slots.save(block, dto, a);
    // Q8: ghi them in-memory de hien ngay o trang Nhat ky (bang
    // audit_logs da ghi trong transaction o service).
    this.audit.record({
      at: Date.now(),
      actor: a.username || 'unknown',
      role: a.roleName || undefined,
      action: 'home-slots.save',
      resource: block,
    });
    return out;
  }
}

// Khoi cong khai trang chu doc qua proxy TSHT /api/v2/home-slots/:block.
// Chi tra bai da xuat ban, dung thu tu da sap; rong la hop le.
@Controller('home-slots')
export class HomeSlotPublicController {
  constructor(private readonly slots: HomeSlotService) {}

  @Get(':block')
  async block(@Param('block') block: string) {
    return this.slots.getPublicBlock(block);
  }
}
