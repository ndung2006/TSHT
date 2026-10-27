import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
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
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null };
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

  // Xuat ban truc tiep (v1, chua co quy trinh duyet tin bai): ai co
  // articles:publish deu xuat ban duoc; workflow se gate lai sau.
  @RequirePerms('articles:publish')
  @Post(':publicId/publish')
  async publish(@Param('publicId') publicId: string, @Body() dto: { publishAt?: string | null }, @Req() req: any) {
    return this.news.setPublished(publicId, true, dto?.publishAt, await this.actor(req));
  }

  @RequirePerms('articles:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    return this.news.setPublished(publicId, false, null, await this.actor(req));
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
