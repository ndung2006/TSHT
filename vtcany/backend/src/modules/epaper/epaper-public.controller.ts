import { Controller, Get, HttpException, HttpStatus, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { EpaperService } from './epaper.service';
import { UploadsService } from '../uploads/uploads.service';

// Doc cong khai bao in he moi (chi so moi tu CMS moi, giai doan noi he
// moi voi trang cong khai). Khong JWT, khong ma tran quyen: chi so co
// status='published' moi hien; so nhap/chua xuat ban tra 404 nhu khong
// ton tai. Khong bao gio tra pdfPath, createdBy hay revisions — chi
// pdfUrl (route stream cong khai ben duoi) va coverPath (duong dan
// hien thi; TSHT proxy se ghep duong dan tuong doi voi origin backend).
@Controller('epaper')
export class EpaperPublicController {
  constructor(
    private epaper: EpaperService,
    private uploads: UploadsService,
  ) {}

  @Get()
  async list(@Query() q: any) {
    return this.epaper.listPublished({
      issueType: q?.issueType, q: q?.q, page: q?.page, limit: q?.limit,
    });
  }

  @Get(':publicId')
  async get(@Param('publicId') publicId: string) {
    const item = await this.epaper.getPublished(publicId);
    return { ...item, pdfUrl: `/api/v1/epaper/${publicId}/pdf` };
  }

  // Stream PDF cho trinh doc cong khai (PDF.js doc truc tiep, khong phai
  // nut tai PDF goc — nut tai goc van chi co o CMS co login + quyen).
  // Chi stream khi so da xuat ban; guard chong path traversal giong
  // route admin (join storageRoot + startsWith + exists).
  @Get(':publicId/pdf')
  async pdf(@Param('publicId') publicId: string, @Res() res: Response) {
    const pdfPath = await this.epaper.publishedPdfPath(publicId);
    if (!pdfPath) throw new HttpException('so bao chua co file PDF', HttpStatus.NOT_FOUND);
    const root = this.uploads.storageRoot();
    const abs = join(root, pdfPath);
    if (!abs.startsWith(root) || !existsSync(abs)) {
      throw new HttpException('file PDF khong ton tai', HttpStatus.NOT_FOUND);
    }
    res.setHeader('Content-Type', 'application/pdf');
    createReadStream(abs).pipe(res);
  }
}
