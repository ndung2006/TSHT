import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { UploadsService } from '../uploads/uploads.service';
import { RolesService } from '../auth/roles.service';
import { EpaperService } from './epaper.service';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';

class CreateIssueDto {
  @IsInt()
  @Min(1)
  issueNumber!: number;

  @IsString()
  issueType!: string;

  @IsString()
  publishDate!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  pdfPath?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pdfSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pageCount?: number;

  @IsOptional()
  @IsString()
  coverPath?: string;
}

class PatchIssueDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  issueNumber?: number;

  @IsOptional()
  @IsString()
  issueType?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  publishDate?: string;

  @IsOptional()
  @IsString()
  pdfPath?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  pdfSizeBytes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  pageCount?: number;

  @IsOptional()
  @IsString()
  coverPath?: string;

  @IsOptional()
  @IsString()
  changeReason?: string;
}

// Quan tri bao in (E-paper) cho CMS VTCANY, thuoc repo TSHT.
// Tat ca route deu qua PermissionsGuard (JWT + ma tran quyen epaper:*).
// Khong co route doc cong khai o day — doc cong khai la giai doan rieng.
@UseGuards(PermissionsGuard)
@Controller('admin/epaper')
export class EpaperController {
  constructor(
    private epaper: EpaperService,
    private audit: AuditService,
    private uploads: UploadsService,
    private roles: RolesService,
  ) {}

  private actor(req: any) {
    return { actor: req.user?.username || req.user?.sub || 'unknown', role: req.user?.role };
  }

  /** Danh tinh duyet: ten Role + toan quyen (de chan buoc sai vai). */
  private async identity(req: any) {
    const id = await this.roles.adminIdentity(req.user?.sub || '');
    return { actorId: req.user?.sub || null, actorRole: id?.roleName || null, isFullAdmin: !!id?.isFullAdmin };
  }

  private auditSafe(req: any, action: string, resource: string) {
    try {
      this.audit.record({ at: Date.now(), ...this.actor(req), action, resource });
    } catch { /* audit khong duoc lam hong request chinh */ }
  }

  @RequirePerms('epaper:view')
  @Get()
  async list(@Query() q: any) {
    return this.epaper.list({
      issueType: q?.issueType, q: q?.q, status: q?.status, page: q?.page, limit: q?.limit,
    });
  }

  @RequirePerms('epaper:view')
  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    return this.epaper.get(publicId);
  }

  @RequirePerms('epaper:create')
  @Post()
  async create(@Body() dto: CreateIssueDto, @Req() req: any) {
    const row = await this.epaper.create(dto, req.user?.sub || null);
    this.auditSafe(req, 'epaper.create', row.publicId);
    return row;
  }

  @RequirePerms('epaper:update')
  @Patch(':publicId')
  async patch(@Param('publicId') publicId: string, @Body() dto: PatchIssueDto, @Req() req: any) {
    const row = await this.epaper.patch(publicId, dto, req.user?.sub || null);
    this.auditSafe(req, 'epaper.update', row.publicId);
    return row;
  }

  @RequirePerms('epaper:publish')
  @Post(':publicId/publish')
  async publish(@Param('publicId') publicId: string, @Req() req: any) {
    const id = await this.identity(req);
    const row = await this.epaper.setPublished(publicId, true, id.actorId, id.actorRole, id.isFullAdmin);
    this.auditSafe(req, 'epaper.publish', row.publicId);
    return row;
  }

  @RequirePerms('epaper:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    const id = await this.identity(req);
    const row = await this.epaper.setPublished(publicId, false, id.actorId, id.actorRole, id.isFullAdmin);
    this.auditSafe(req, 'epaper.unpublish', row.publicId);
    return row;
  }

  // --- Quy trinh duyet (xem epaper-workflow.ts) ---
  @RequirePerms('epaper:update')
  @Post(':publicId/submit')
  async submit(@Param('publicId') publicId: string, @Req() req: any) {
    const id = await this.identity(req);
    const row = await this.epaper.submitForReview(publicId, id.actorId, id.actorRole);
    this.auditSafe(req, 'epaper.workflow.submit', row.publicId);
    return row;
  }

  @RequirePerms('epaper:publish')
  @Post(':publicId/approve')
  async approve(@Param('publicId') publicId: string, @Req() req: any) {
    const id = await this.identity(req);
    const row = await this.epaper.approveStep(publicId, id.actorId, id.actorRole, id.isFullAdmin);
    this.auditSafe(req, 'epaper.workflow.approve', row.publicId);
    return row;
  }

  @RequirePerms('epaper:publish')
  @Post(':publicId/return')
  async returnIssue(@Param('publicId') publicId: string, @Body() body: any, @Req() req: any) {
    const id = await this.identity(req);
    const row = await this.epaper.returnIssue(publicId, id.actorId, id.actorRole, body?.reason || '');
    this.auditSafe(req, 'epaper.workflow.return', row.publicId);
    return row;
  }

  @RequirePerms('epaper:view')
  @Get(':publicId/approvals')
  async approvals(@Param('publicId') publicId: string) {
    return this.epaper.listApprovals(publicId);
  }

  @RequirePerms('epaper:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string, @Req() req: any) {
    const out = await this.epaper.remove(publicId);
    this.auditSafe(req, 'epaper.delete', publicId);
    return out;
  }

  // Anh 1 trang cho dialog Xem duyet trong CMS (moi trang thai, ke ca
  // nhap/cho duyet — khac route cong khai chi cho so da xuat ban).
  // JWT + epaper:view do guard chan; anh render lazy chung cache voi
  // route cong khai (cung thu muc theo fingerprint).
  @RequirePerms('epaper:view')
  @Get(':publicId/pages/:page')
  async pageImage(@Param('publicId') publicId: string, @Param('page') page: string, @Res() res: Response) {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1) throw new HttpException('trang khong hop le', HttpStatus.NOT_FOUND);
    const { abs } = await this.epaper.pageImageAdmin(publicId, n);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(abs).pipe(res);
  }

  // Tai file PDF goc cua mot so bao (chi admin co epaper:view). File khong
  // phuc vu cong khai qua static assets; chi stream qua route co JWT nay.
  @RequirePerms('epaper:view')
  @Get(':publicId/pdf')
  async downloadPdf(@Param('publicId') publicId: string, @Req() req: Request, @Res() res: Response) {
    const row = await this.epaper.get(publicId);
    if (!row.pdfPath) throw new HttpException('so bao chua co file PDF', HttpStatus.NOT_FOUND);
    const abs = join(this.uploads.storageRoot(), row.pdfPath);
    if (!abs.startsWith(this.uploads.storageRoot()) || !existsSync(abs)) {
      throw new HttpException('file PDF khong ton tai', HttpStatus.NOT_FOUND);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="bao-so-${row.issueNumber}.pdf"`);
    createReadStream(abs).pipe(res);
  }
}
