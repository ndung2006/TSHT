import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Query, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { UploadsService } from '../uploads/uploads.service';
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
  ) {}

  private actor(req: any) {
    return { actor: req.user?.username || req.user?.sub || 'unknown', role: req.user?.role };
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
      issueType: q?.issueType, q: q?.q, page: q?.page, limit: q?.limit,
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
    const row = await this.epaper.setPublished(publicId, true, req.user?.sub || null);
    this.auditSafe(req, 'epaper.publish', row.publicId);
    return row;
  }

  @RequirePerms('epaper:publish')
  @Post(':publicId/unpublish')
  async unpublish(@Param('publicId') publicId: string, @Req() req: any) {
    const row = await this.epaper.setPublished(publicId, false, req.user?.sub || null);
    this.auditSafe(req, 'epaper.unpublish', row.publicId);
    return row;
  }

  @RequirePerms('epaper:delete')
  @Delete(':publicId')
  async remove(@Param('publicId') publicId: string, @Req() req: any) {
    const out = await this.epaper.remove(publicId);
    this.auditSafe(req, 'epaper.delete', publicId);
    return out;
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
