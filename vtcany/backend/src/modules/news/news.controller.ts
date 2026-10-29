import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { NewsService } from './news.service';

class ArticleDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sapo?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  coverPath?: string | null;

  @IsOptional()
  authors?: string[];

  @IsOptional()
  tags?: string[];

  @IsOptional()
  @IsString()
  publishAt?: string | null;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  // Dot 1a: dinh dang + co hien thi + nhan tin dia phuong. contentType la
  // bi service reject (400); DTO chi khai bao de whitelist khong luoc mat.
  @IsOptional()
  @IsString()
  contentType?: string;

  // Goi 1B (fix 2026-10-29): formatData BAT BUOC khai bao o day. Ly do:
  // main.ts dung ValidationPipe whitelist:true nen POST tao bai (@Body()
  // dto: ArticleDto — class that) se luoc bo moi truong khong khai bao,
  // service nhan formatData=undefined -> luu null -> tao bai mat media.
  // PATCH dung Partial<ArticleDto> (runtime metatype Object) nen pipe bo
  // qua, formatData di qua nguyen ven — vi vay sua thi luu duoc, dung
  // su khong nhat quan tao/cap nhat. Validate that (chi 4 key media,
  // scheme nguy hiem -> 400) do service dam nhan qua normalizeFormatData;
  // DTO chi giu truong di qua. null di qua @IsOptional (bai khong media).
  @IsOptional()
  @IsObject()
  formatData?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isSpotlight?: boolean;

  @IsOptional()
  @IsBoolean()
  isPhoto?: boolean;

  @IsOptional()
  @IsBoolean()
  isInfographic?: boolean;

  @IsOptional()
  @IsBoolean()
  allowComments?: boolean;

  @IsOptional()
  @IsString()
  localNews?: string | null;
}

class CategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isVisible?: boolean;
}

@UseGuards(PermissionsGuard)
@Controller('admin/news')
export class NewsController {
  constructor(
    private readonly news: NewsService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  @RequirePerms('articles:view')
  @Get()
  async list(@Query() q: any) {
    return this.news.listAdmin({ q: q?.q, status: q?.status, categoryId: q?.categoryId, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('articles:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.news.getAdmin(publicId);
  }

  @RequirePerms('articles:create')
  @Post()
  async create(@Body() dto: ArticleDto, @Req() req: any) {
    return this.news.create(dto, await this.actor(req));
  }

  @RequirePerms('articles:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<ArticleDto>, @Req() req: any) {
    return this.news.patch(publicId, dto, await this.actor(req));
  }

  @RequirePerms('articles:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.news.remove(publicId);
  }

  // Xuat ban truc tiep co gate quy trinh (xem news.service.ts): bai nhap
  // chi toan quyen moi xuat ban truc tiep; bai dang cho duyet phai duyet
  // xong (approve buoc cuoi tu xuat ban) hoac toan quyen duyet tat.
  @RequirePerms('articles:publish')
  @Post(':publicId/publish')
  async publish(@Param('publicId') publicId: string, @Body() dto: { publishAt?: string | null }, @Req() req: any) {
    const a = await this.actor(req);
    return this.news.setPublished(publicId, true, dto?.publishAt, a, a.isFullAdmin);
  }

  @RequirePerms('articles:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    const a = await this.actor(req);
    return this.news.setPublished(publicId, false, null, a, a.isFullAdmin);
  }

  // Quy trinh duyet tin bai: PV (tac gia) -> TP -> PBDT -> BBT -> XB
  // (duyet buoc cuoi = xuat ban). Xem news-workflow.ts.
  @RequirePerms('articles:update')
  @Post(':publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    return this.news.submitForReview(publicId, await this.actor(req));
  }

  @RequirePerms('articles:publish')
  @Post(':publicId/approve')
  async approve(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.news.approveStep(publicId, a, a.isFullAdmin, { breakingNews: !!body?.breakingNews, breakingNewsReason: body?.breakingNewsReason || '' });
  }

  @RequirePerms('articles:publish')
  @Post(':publicId/return')
  async returnArticle(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    return this.news.returnArticle(publicId, await this.actor(req), body?.reason || '');
  }

  @RequirePerms('articles:view')
  @Get(':publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.news.listApprovals(publicId);
  }
}

@UseGuards(PermissionsGuard)
@Controller('admin/news-categories')
export class NewsCategoryController {
  constructor(private readonly news: NewsService) {}

  @RequirePerms('articles:view')
  @Get()
  async list() {
    return this.news.listCategoriesAdmin();
  }

  @RequirePerms('category:create')
  @Post()
  async create(@Body() dto: CategoryDto) {
    return this.news.createCategory(dto);
  }

  @RequirePerms('category:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<CategoryDto>) {
    return this.news.patchCategory(publicId, dto);
  }

  @RequirePerms('category:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.news.removeCategory(publicId);
  }
}

@Controller('news')
export class NewsPublicController {
  constructor(private readonly news: NewsService) {}

  @Get()
  async list(@Query() q: any) {
    return this.news.listPublic({ category: q?.category, q: q?.q, featured: q?.featured, page: q?.page, limit: q?.limit });
  }

  @Get(':slug')
  async get(@Param('slug') slug: string) {
    return this.news.getPublic(slug);
  }
}

@Controller('news-categories')
export class NewsCategoryPublicController {
  constructor(private readonly news: NewsService) {}

  @Get()
  async list() {
    return this.news.listCategoriesPublic();
  }
}
