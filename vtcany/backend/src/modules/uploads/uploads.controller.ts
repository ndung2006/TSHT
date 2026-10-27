import { Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { UploadsService } from './uploads.service';

class InitUploadDto {
  @IsString()
  filename!: string;
  @IsInt()
  @Min(1)
  sizeBytes!: number;
  @IsOptional()
  @IsString()
  contentType?: string;
  @IsOptional()
  @IsString()
  videoId?: string;
}

@Controller()
export class UploadsController {
  constructor(private uploads: UploadsService) {}

  // CMS (editor+): xin URL upload. File di thang len storage, khong qua backend.
  @UseGuards(PermissionsGuard)
  @RequirePerms('video:create')
  @Post('uploads/init')
  init(@Body() dto: InitUploadDto) {
    try {
      return this.uploads.init(dto.filename, dto.sizeBytes, dto.contentType || 'video/mp4', dto.videoId);
    } catch (e: any) {
      throw new HttpException(e?.message || 'invalid upload', HttpStatus.BAD_REQUEST);
    }
  }

  // Thu vien anh (thumbnail/poster/banner) cho CMS chon lai.
  // Khai bao TRUOC uploads/:id de khong bi param nuot mat.
  @UseGuards(PermissionsGuard)
  @RequirePerms('catalog:read')
  @Get('uploads/images')
  listImages() {
    return { data: this.uploads.listImages() };
  }

  @UseGuards(PermissionsGuard)
  @RequirePerms('video:create')
  @Get('uploads/:id')
  status(@Param('id') id: string) {
    try {
      return this.uploads.get(id);
    } catch {
      throw new HttpException('upload not found', HttpStatus.NOT_FOUND);
    }
  }

  // Nhan chunk nhi phan (application/octet-stream), stream thang ra dia.
  // Khong di qua JSON body parser - file khong lot vao API logic.
  @UseGuards(PermissionsGuard)
  @RequirePerms('video:create')
  @Put('storage-local/raw/:id/chunks/:n')
  async putChunk(@Param('id') id: string, @Param('n') n: string, @Req() req: Request, @Res() res: Response) {
    try {
      const out = await this.uploads.putChunk(id, Number(n), req as any);
      res.json(out);
    } catch (e: any) {
      res.status(HttpStatus.BAD_REQUEST).json({ error: e?.message || 'chunk failed' });
    }
  }

  // Browser bao da nhan du file -> backend day job cho worker.
  @UseGuards(PermissionsGuard)
  @RequirePerms('video:create')
  @Post('uploads/:id/complete')
  complete(@Param('id') id: string) {
    try {
      const rec = this.uploads.complete(id);
      return { ...rec, next: 'worker transcode p480/p720 -> HLS' };
    } catch (e: any) {
      throw new HttpException(e?.message || 'invalid transition', HttpStatus.BAD_REQUEST);
    }
  }

  // Upload anh thumbnail/poster/banner: PUT nhi phan (Content-Type: image/*,
  // ten file goc o header x-file-name da encodeURIComponent). Khong transcode.
  @UseGuards(PermissionsGuard)
  @RequirePerms('catalog:write')
  @Put('uploads/image')
  async putImage(@Req() req: Request, @Res() res: Response) {
    const rawName = (req.headers['x-file-name'] as string) || 'image';
    let filename = rawName;
    try { filename = decodeURIComponent(rawName); } catch { /* giu ten tho */ }
    const contentType = ((req.headers['content-type'] as string) || '').split(';')[0].trim();
    try {
      const out = await this.uploads.saveImage(req as any, filename, contentType);
      res.json(out);
    } catch (e: any) {
      const tooLarge = /too large/.test(e?.message || '');
      res.status(tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST).json({ error: e?.message || 'image upload failed' });
    }
  }

  // Upload file PDF goc cho so bao in: PUT nhi phan (Content-Type:
  // application/pdf, ten file goc o header x-file-name da encodeURIComponent).
  // Chi admin co epaper:create. File khong phuc vu cong khai.
  @UseGuards(PermissionsGuard)
  @RequirePerms('epaper:create')
  @Put('uploads/pdf')
  async putPdf(@Req() req: Request, @Res() res: Response) {
    const rawName = (req.headers['x-file-name'] as string) || 'document.pdf';
    let filename = rawName;
    try { filename = decodeURIComponent(rawName); } catch { /* giu ten tho */ }
    const contentType = ((req.headers['content-type'] as string) || '').split(';')[0].trim();
    try {
      const out = await this.uploads.saveDocument(req as any, filename, contentType);
      res.json(out);
    } catch (e: any) {
      const tooLarge = /too large/.test(e?.message || '');
      res.status(tooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST).json({ error: e?.message || 'pdf upload failed' });
    }
  }

  // Hang cho worker poll (secret guard, khong JWT).
  @Get('internal/transcode-queue')
  queue(@Headers('x-webhook-secret') secret: string) {
    if (!this.uploads.checkWebhookSecret(secret || '')) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    return this.uploads.pendingTranscode();
  }

  // Webhook tu storage/FFmpeg cu. Guard bang shared secret, khong dung JWT.
  @Post('internal/media-webhook')
  webhook(@Headers('x-webhook-secret') secret: string, @Body() body: any) {
    if (!this.uploads.checkWebhookSecret(secret || '')) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    const { uploadId, status } = body || {};
    if (!uploadId) throw new HttpException('uploadId required', HttpStatus.BAD_REQUEST);
    if (status === 'processing' && typeof body.progress === 'number') {
      try {
        return this.uploads.setProgress(uploadId, body.progress);
      } catch {
        throw new HttpException('upload not found', HttpStatus.NOT_FOUND);
      }
    }
    if (status === 'done') {
      this.uploads.markDone(uploadId);
      return this.uploads.setVideoReady(uploadId);
    }
    if (status === 'error') return this.uploads.markError(uploadId);
    try {
      return this.uploads.get(uploadId);
    } catch {
      throw new HttpException('upload not found', HttpStatus.NOT_FOUND);
    }
  }
}
