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
    // So trang that tu PDF + fingerprint de trinh doc dung anh trang
    // render san (Hybrid). Khong co PDF hoac dem loi => null, trinh doc
    // fallback ve PDF.js nhu cu. Khong lo pdfPath (chi size+mtime).
    let pdfPageCount: number | null = null;
    let pageVersion: string | null = null;
    try {
      const info = await this.epaper.publishedPdfInfo(publicId);
      pdfPageCount = info.pdfPageCount;
      pageVersion = info.fingerprint;
    } catch { /* giu null => fallback */ }
    return { ...item, pdfUrl: `/api/v1/epaper/${publicId}/pdf`, pdfPageCount, pageVersion };
  }

  // Anh 1 trang render san phia server (Hybrid): chi so da xuat ban,
  // render lazy o lan goi dau tien roi cache tren storage ben vung.
  // Query ?v=<fingerprint> do trinh doc gan de doi URL khi PDF bi thay
  // (backend bo qua query, fingerprint nam trong thu muc cache).
  @Get(':publicId/pages/:page')
  async page(@Param('publicId') publicId: string, @Param('page') page: string, @Res() res: Response) {
    const n = Number(page);
    if (!Number.isInteger(n) || n < 1) throw new HttpException('trang khong hop le', HttpStatus.NOT_FOUND);
    const { abs } = await this.epaper.pageImage(publicId, n);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(abs).pipe(res);
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
