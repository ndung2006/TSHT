import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, ValidateNested } from 'class-validator';
import * as XLSX from 'xlsx';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { RolesService } from '../auth/roles.service';
import { RoyaltiesService } from './royalties.service';

class ScoresDto {
  @IsOptional() @IsInt() content?: number;
  @IsOptional() @IsInt() image?: number;
  @IsOptional() @IsInt() video?: number;
  @IsOptional() @IsInt() audio?: number;
  @IsOptional() @IsInt() other?: number;
}

class ShareDto {
  author!: string;

  @IsInt()
  percent!: number;
}

class RoyaltyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ScoresDto)
  scores?: ScoresDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShareDto)
  shares?: ShareDto[];
}

// Quan tri NHUAN BUT (Goi 2C) — panel rieng lien ket theo bai viet,
// khong nhung vao trang tin bai. Key quyen 'royalties'. Khong co API
// cong khai: diem nhuan but la du lieu noi bo.
@UseGuards(PermissionsGuard)
@Controller('admin/royalties')
export class RoyaltiesController {
  constructor(
    private readonly royalties: RoyaltiesService,
    private readonly roles: RolesService,
  ) {}

  private async actor(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { id: req.user?.sub || null, username: req.user?.username || req.user?.sub || null, roleName: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  @RequirePerms('royalties:view')
  @Get('articles')
  async list(@Query() q: any) {
    return this.royalties.listArticles({ q: q?.q, royaltyStatus: q?.royaltyStatus, page: q?.page, limit: q?.limit });
  }

  @RequirePerms('royalties:view')
  @Get('dashboard')
  async dashboard(@Query() q: any) {
    return this.royalties.dashboard(q?.from, q?.to);
  }

  // Xuat Excel dung mau file thong ke that cua toa soan:
  // STT | Tieu de bai viet | Tac gia | Noi dung | Anh | Video | Audio | Khac.
  @RequirePerms('royalties:view')
  @Get('export')
  async export(@Query() q: any, @Res() res: any) {
    const rows = await this.royalties.exportRows(q?.from, q?.to);
    const aoa: any[][] = [['STT', 'Tiêu đề bài viết', 'Tác giả', 'Nội dung', 'Ảnh', 'Video', 'Audio', 'Khác']];
    rows.forEach((r, i) => aoa.push([i + 1, r.title, r.author, r.content, r.image, r.video, r.audio, r.other]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 5 }, { wch: 80 }, { wch: 24 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Thống kê nhuận bút');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const suffix = [q?.from, q?.to].filter(Boolean).join('_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="thong-ke-nhuan-but${suffix ? `-${suffix}` : ''}.xlsx"`);
    res.send(buf);
  }

  @RequirePerms('royalties:view')
  @Get('articles/:publicId')
  async get(@Param('publicId') publicId: string) {
    return this.royalties.getArticle(publicId);
  }

  @RequirePerms('royalties:create')
  @Post('articles/:publicId')
  async create(@Param('publicId') publicId: string, @Body() dto: RoyaltyDto, @Req() req: any) {
    return this.royalties.create(publicId, dto, await this.actor(req));
  }

  @RequirePerms('royalties:update')
  @Patch('articles/:publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: Partial<RoyaltyDto>, @Req() req: any) {
    return this.royalties.patch(publicId, dto, await this.actor(req));
  }

  // Quy trinh duyet nhuan but: TP (de xuat) -> BBT (duyet = khoa diem).
  // Buoc nop chi can quyen update (giu mau news/epaper/events/ads).
  @RequirePerms('royalties:update')
  @Post('articles/:publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    return this.royalties.submitForReview(publicId, await this.actor(req));
  }

  @RequirePerms('royalties:publish')
  @Post('articles/:publicId/approve')
  async approve(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.royalties.approveStep(publicId, a, a.isFullAdmin, { breakingNews: !!body?.breakingNews, breakingNewsReason: body?.breakingNewsReason || '' });
  }

  @RequirePerms('royalties:publish')
  @Post('articles/:publicId/return')
  async returnRoyalty(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    return this.royalties.returnRoyalty(publicId, await this.actor(req), body?.reason || '');
  }

  // Mo khoa ngoai le diem da khoa: chi BBT/toan quyen, bat buoc ly do.
  @RequirePerms('royalties:publish')
  @Post('articles/:publicId/unlock')
  async unlock(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const a = await this.actor(req);
    return this.royalties.unlock(publicId, a, a.isFullAdmin, body?.reason || '');
  }

  @RequirePerms('royalties:view')
  @Get('articles/:publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.royalties.listApprovals(publicId);
  }
}
