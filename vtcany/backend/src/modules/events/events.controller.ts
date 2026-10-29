import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { EventsService } from './events.service';

class EventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  coverPath?: string | null;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

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

// Quan tri SU KIEN TOA SOAN (Goi 2A) — module rieng voi su kien catalog
// OTT (key quyen 'events', trang su-kien.vue); o day dung key quyen
// 'newsroom_events'. Route admin dung /admin/events cho ngan gon (catalog
// khong dung route nay) — da neu trong thiet ke 2A.
@UseGuards(PermissionsGuard)
@Controller('admin/events')
export class EventsController {
  constructor(
    private readonly events: EventsService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  @RequirePerms('newsroom_events:view')
  @Get()
  async list(@Query() q: any) {
    return this.events.listAdmin({ q: q?.q, status: q?.status, categoryId: q?.categoryId, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('newsroom_events:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.events.getAdmin(publicId);
  }

  @RequirePerms('newsroom_events:create')
  @Post()
  async create(@Body() dto: EventDto, @Req() req: any) {
    return this.events.create(dto, await this.actor(req));
  }

  @RequirePerms('newsroom_events:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<EventDto>, @Req() req: any) {
    return this.events.patch(publicId, dto, await this.actor(req));
  }

  @RequirePerms('newsroom_events:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.events.remove(publicId);
  }

  @RequirePerms('newsroom_events:publish')
  @Post(':publicId/publish')
  async publish(@Param('publicId') publicId: string, @Body() dto: { publishAt?: string | null }, @Req() req: any) {
    const a = await this.actor(req);
    return this.events.setPublished(publicId, true, dto?.publishAt, a, a.isFullAdmin);
  }

  @RequirePerms('newsroom_events:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    const a = await this.actor(req);
    return this.events.setPublished(publicId, false, null, a, a.isFullAdmin);
  }

  // Quy trinh duyet su kien: QLSK (tac gia) -> TBT (duyet = xuat ban).
  // Buoc nop chi can quyen update (giu mau news/epaper, chot 29/10/2026).
  @RequirePerms('newsroom_events:update')
  @Post(':publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    return this.events.submitForReview(publicId, await this.actor(req));
  }

  @RequirePerms('newsroom_events:publish')
  @Post(':publicId/approve')
  async approve(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.events.approveStep(publicId, a, a.isFullAdmin, { breakingNews: !!body?.breakingNews, breakingNewsReason: body?.breakingNewsReason || '' });
  }

  @RequirePerms('newsroom_events:publish')
  @Post(':publicId/return')
  async returnEvent(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    return this.events.returnEvent(publicId, await this.actor(req), body?.reason || '');
  }

  @RequirePerms('newsroom_events:view')
  @Get(':publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.events.listApprovals(publicId);
  }
}

// Doc cong khai su kien toa soan (phuc vu goi 1E cua Nguoi 1 tich hop
// hien thi). Khong guard: chi tra ban da published + da toi gio hen,
// khong lo truong noi bo (createdBy/updatedBy/id noi bo).
@Controller('events')
export class EventsPublicController {
  constructor(private readonly events: EventsService) {}

  @Get()
  async list(@Query() q: any) {
    return this.events.listPublic({ q: q?.q, page: q?.page, limit: q?.limit });
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    return this.events.getPublic(slug);
  }
}
