import { Controller, Get, Param, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { FacebookService } from './facebook.service';

// Ket noi + dang Facebook that (Goi 2D-3). Tach khoi
// DistributionAdminController de khong dung vao cac route phan phoi san
// co; dung chung quyen distribution:publish (ket noi/dang la hanh dong
// xuat ban ra ngoai).
@Controller('admin/distribution/facebook')
export class FacebookController {
  constructor(private readonly fb: FacebookService) {}

  private actor(req: any): string | undefined {
    return req.user?.sub || req.user?.id || undefined;
  }

  @UseGuards(PermissionsGuard)
  @RequirePerms('distribution:publish')
  @Get('status')
  async status() {
    return this.fb.status();
  }

  @UseGuards(PermissionsGuard)
  @RequirePerms('distribution:publish')
  @Post('connect-url')
  async connectUrl(@Req() req: any) {
    return this.fb.connectUrl(this.actor(req));
  }

  @UseGuards(PermissionsGuard)
  @RequirePerms('distribution:publish')
  @Post('disconnect')
  async disconnect() {
    return this.fb.disconnect();
  }

  @UseGuards(PermissionsGuard)
  @RequirePerms('distribution:publish')
  @Post('post/:publicId')
  async post(@Param('publicId') publicId: string) {
    return this.fb.postToFacebook(publicId);
  }

  // Callback OAuth cua Meta: trinh duyet tu dieu huong ve day (khong kem
  // JWT cua CMS) nen khong dat PermissionsGuard — bao ve bang state 1 lan
  // han 10 phut trong FacebookService. Tra HTML de nguoi dung thay ket qua.
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() res: any) {
    try {
      const r = await this.fb.handleCallback(code || '', state || '');
      res.type('html').send(
        `<!doctype html><meta charset="utf-8"><title>Da ket noi Facebook</title>` +
        `<body style="font-family:sans-serif;padding:2rem"><h2>Đã kết nối Page: ${escapeHtml(r.pageName || r.pageId)}</h2>` +
        `<p>Quay lại trang Phân phối trong CMS và bấm "Đăng Facebook" ở bài đã xuất bản.</p></body>`,
      );
    } catch (e: any) {
      res.status(400).type('html').send(
        `<!doctype html><meta charset="utf-8"><title>Ket noi Facebook that bai</title>` +
        `<body style="font-family:sans-serif;padding:2rem"><h2>Kết nối Facebook thất bại</h2>` +
        `<p>${escapeHtml(e?.message || 'loi khong ro')}</p><p>Quay lại CMS và thử kết nối lại.</p></body>`,
      );
    }
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] as string));
}
