import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { LiveblogService } from './liveblog.service';

class LiveblogDto {
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
  eventId?: string | null;

  @IsOptional()
  @IsString()
  publishAt?: string | null;
}

class EntryDto {
  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  mediaPath?: string | null;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;
}

// Quan tri TUONG THUAT TRUC TIEP (liveblog) — Goi 2A, key quyen 'liveblog'.
@UseGuards(PermissionsGuard)
@Controller('admin/liveblogs')
export class LiveblogController {
  constructor(
    private readonly liveblog: LiveblogService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  @RequirePerms('liveblog:view')
  @Get()
  async list(@Query() q: any) {
    return this.liveblog.listAdmin({ q: q?.q, status: q?.status, eventId: q?.eventId, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('liveblog:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.liveblog.getAdmin(publicId);
  }

  @RequirePerms('liveblog:create')
  @Post()
  async create(@Body() dto: LiveblogDto, @Req() req: any) {
    return this.liveblog.create(dto, await this.actor(req));
  }

  @RequirePerms('liveblog:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<LiveblogDto>, @Req() req: any) {
    return this.liveblog.patch(publicId, dto, await this.actor(req));
  }

  @RequirePerms('liveblog:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.liveblog.remove(publicId);
  }

  @RequirePerms('liveblog:publish')
  @Post(':publicId/publish')
  async publish(@Param('publicId') publicId: string, @Body() dto: { publishAt?: string | null }, @Req() req: any) {
    const a = await this.actor(req);
    return this.liveblog.setPublished(publicId, true, dto?.publishAt, a, a.isFullAdmin);
  }

  @RequirePerms('liveblog:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    const a = await this.actor(req);
    return this.liveblog.setPublished(publicId, false, null, a, a.isFullAdmin);
  }

  // Quy trinh duyet liveblog: PVTT (tac gia) -> PTTT (duyet = xuat ban).
  // Buoc nop chi can quyen update (giu mau news/epaper, chot 29/10/2026).
  @RequirePerms('liveblog:update')
  @Post(':publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    return this.liveblog.submitForReview(publicId, await this.actor(req));
  }

  @RequirePerms('liveblog:publish')
  @Post(':publicId/approve')
  async approve(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.liveblog.approveStep(publicId, a, a.isFullAdmin, { breakingNews: !!body?.breakingNews, breakingNewsReason: body?.breakingNewsReason || '' });
  }

  @RequirePerms('liveblog:publish')
  @Post(':publicId/return')
  async returnLiveblog(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    return this.liveblog.returnLiveblog(publicId, await this.actor(req), body?.reason || '');
  }

  @RequirePerms('liveblog:view')
  @Get(':publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.liveblog.listApprovals(publicId);
  }

  // ---------------- Dong tuong thuat (entries) ----------------
  // Xem = view; them/sua = update; xoa = delete (anh xa theo thiet ke 2A).

  @RequirePerms('liveblog:view')
  @Get(':publicId/entries')
  async listEntries(@Param('publicId') publicId: string) {
    return this.liveblog.listEntries(publicId);
  }

  @RequirePerms('liveblog:update')
  @Post(':publicId/entries')
  async createEntry(@Param('publicId') publicId: string, @Body() dto: EntryDto, @Req() req: any) {
    return this.liveblog.createEntry(publicId, dto, await this.actor(req));
  }

  @RequirePerms('liveblog:update')
  @Patch(':publicId/entries/:entryId')
  async patchEntry(@Param('publicId') publicId: string, @Param('entryId') entryId: string, @Body() dto: EntryDto, @Req() req: any) {
    return this.liveblog.patchEntry(publicId, entryId, dto, await this.actor(req));
  }

  @RequirePerms('liveblog:delete')
  @Delete(':publicId/entries/:entryId')
  async removeEntry(@Param('publicId') publicId: string, @Param('entryId') entryId: string) {
    return this.liveblog.removeEntry(publicId, entryId);
  }
}

// Doc cong khai liveblog (phuc vu goi 1E cua Nguoi 1 tich hop hien thi).
// Khong guard, KHONG realtime o 2A (chot 29/10/2026): chi GET thong
// thuong, chi tra ban da published kem entries ASC, khong lo truong
// noi bo.
@Controller('liveblogs')
export class LiveblogPublicController {
  constructor(private readonly liveblog: LiveblogService) {}

  @Get()
  async list(@Query() q: any) {
    return this.liveblog.listPublic({ q: q?.q, page: q?.page, limit: q?.limit });
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    return this.liveblog.getPublic(slug);
  }
}
