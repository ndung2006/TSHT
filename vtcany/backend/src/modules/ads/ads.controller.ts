import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { AdsService } from './ads.service';

class AdDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  placement?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  imagePath?: string | null;

  @IsOptional()
  @IsString()
  linkUrl?: string | null;

  @IsOptional()
  @IsString()
  htmlContent?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsString()
  startsAt?: string | null;

  @IsOptional()
  @IsString()
  endsAt?: string | null;

  @IsOptional()
  @IsString()
  publishAt?: string | null;
}

// Quan tri QUANG CAO TOA SOAN (Goi 2B) — module rieng voi banner catalog
// OTT (key quyen 'banners', trang banner.vue); o day dung key quyen
// 'newsroom_ads'. Route admin /admin/ads (da ra: khong trung route nao).
@UseGuards(PermissionsGuard)
@Controller('admin/ads')
export class AdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  @RequirePerms('newsroom_ads:view')
  @Get()
  async list(@Query() q: any) {
    return this.ads.listAdmin({ q: q?.q, status: q?.status, placement: q?.placement, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('newsroom_ads:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.ads.getAdmin(publicId);
  }

  @RequirePerms('newsroom_ads:create')
  @Post()
  async create(@Body() dto: AdDto, @Req() req: any) {
    return this.ads.create(dto, await this.actor(req));
  }

  @RequirePerms('newsroom_ads:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<AdDto>, @Req() req: any) {
    return this.ads.patch(publicId, dto, await this.actor(req));
  }

  @RequirePerms('newsroom_ads:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.ads.remove(publicId);
  }

  @RequirePerms('newsroom_ads:publish')
  @Post(':publicId/publish')
  async publish(@Param('publicId') publicId: string, @Body() dto: { publishAt?: string | null }, @Req() req: any) {
    const a = await this.actor(req);
    return this.ads.setPublished(publicId, true, dto?.publishAt, a, a.isFullAdmin);
  }

  @RequirePerms('newsroom_ads:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    const a = await this.actor(req);
    return this.ads.setPublished(publicId, false, null, a, a.isFullAdmin);
  }

  // Quy trinh duyet quang cao: QL-QC (tac gia) -> TBT (duyet = xuat ban).
  // Buoc nop chi can quyen update (giu mau news/epaper/events).
  @RequirePerms('newsroom_ads:update')
  @Post(':publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    return this.ads.submitForReview(publicId, await this.actor(req));
  }

  @RequirePerms('newsroom_ads:publish')
  @Post(':publicId/approve')
  async approve(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.ads.approveStep(publicId, a, a.isFullAdmin, { breakingNews: !!body?.breakingNews, breakingNewsReason: body?.breakingNewsReason || '' });
  }

  @RequirePerms('newsroom_ads:publish')
  @Post(':publicId/return')
  async returnAd(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    return this.ads.returnAd(publicId, await this.actor(req), body?.reason || '');
  }

  @RequirePerms('newsroom_ads:view')
  @Get(':publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.ads.listApprovals(publicId);
  }
}

// Doc cong khai quang cao toa soan (phuc vu goi hien thi cong khai cua
// Nguoi 1 tich hop sau, nhu mau 2A/1E). Khong guard: chi tra quang cao
// dang chay (da xuat ban + trong lich), khong lo truong noi bo. Ma
// HTML/JS trong htmlContent PHAI duoc phia hien thi nhung iframe sandbox.
@Controller('ads')
export class AdsPublicController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  async list(@Query() q: any) {
    return this.ads.listPublic({ placement: q?.placement, page: q?.page, limit: q?.limit });
  }
}
