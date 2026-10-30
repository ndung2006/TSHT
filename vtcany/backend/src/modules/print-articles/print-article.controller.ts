// API admin cho Bai bao in — CHI noi bo (khong co route public):
// bai bao in la nguyen lieu dan trang, khong phai noi dung web.
// Gate theo module quyen 'print_articles' (xem permissions.catalog).
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { PrintArticleService } from './print-article.service';

class FromNewsDto {
  @IsString()
  newsPublicId!: string;
}

// DTO tao tay / sua: khai du moi truong (whitelist se loc truong khong
// khai, bai hoc tu 1B). authors/tags la mang chuoi (CMS gui mang sau khi
// tach dau phay); title bat buoc khi tao, tuy chon khi sua (khuon ArticleDto).
class PrintArticleInputDto {
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
}

class CreatePrintArticleDto extends PrintArticleInputDto {
  @IsString()
  title!: string;
}

class PatchPrintArticleDto extends PrintArticleInputDto {
  @IsOptional()
  @IsString()
  title?: string;
}

@UseGuards(PermissionsGuard)
@Controller('admin/print-articles')
export class PrintArticleController {
  constructor(
    private readonly printArticles: PrintArticleService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  // POST 'from-news' khong xung dot voi ':publicId/*' (khac so doan duong
  // dan); GET ':publicId' cung khong nuot route nay vi khac method.
  @RequirePerms('print_articles:create')
  @Post('from-news')
  async fromNews(@Body() dto: FromNewsDto, @Req() req: any) {
    return this.printArticles.fromNews(dto.newsPublicId, await this.actor(req));
  }

  // Tao bai bao in bang tay (khong qua chuyen doi): ban moi o 'draft',
  // khong co bai goc.
  @RequirePerms('print_articles:create')
  @Post()
  async create(@Body() dto: CreatePrintArticleDto, @Req() req: any) {
    return this.printArticles.createManual(dto, await this.actor(req));
  }

  // Sua bai bao in: CHI bai nhap moi sua duoc (service chan 409 khi bai
  // dang cho duyet hoac da duyet).
  @RequirePerms('print_articles:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: PatchPrintArticleDto, @Req() req: any) {
    return this.printArticles.patchArticle(publicId, dto, await this.actor(req));
  }

  @RequirePerms('print_articles:view')
  @Get()
  async list(@Query() q: any) {
    return this.printArticles.listAdmin({ q: q?.q, status: q?.status, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('print_articles:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.printArticles.getAdmin(publicId);
  }

  // Quy trinh duyet bai bao in: KTV (tao/chuyen) -> MD -> T.PP ->
  // P.TBT -> TBT (duyet buoc cuoi = da duyet, cho dan trang).
  // Xem print-article-workflow.ts.
  @RequirePerms('print_articles:update')
  @Post(':publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    return this.printArticles.submitForReview(publicId, await this.actor(req));
  }

  @RequirePerms('print_articles:publish')
  @Post(':publicId/approve')
  async approve(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.printArticles.approveStep(publicId, a, a.isFullAdmin, { breakingNews: !!body?.breakingNews, breakingNewsReason: body?.breakingNewsReason || '' });
  }

  @RequirePerms('print_articles:publish')
  @Post(':publicId/return')
  async returnArticle(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    return this.printArticles.returnArticle(publicId, await this.actor(req), body?.reason || '');
  }

  @RequirePerms('print_articles:view')
  @Get(':publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.printArticles.listApprovals(publicId);
  }

  @RequirePerms('print_articles:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string) {
    return this.printArticles.remove(publicId);
  }
}
