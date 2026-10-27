import { Controller, Get, Header, HttpException, HttpStatus, Param, Query, Req } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TvService } from './tv.service';
import { hasPermission, Role } from '../auth/users.store';
import { hasModulePermission } from '../auth/permissions.catalog';
import { RolesService } from '../auth/roles.service';
import { Optional } from '@nestjs/common';

// Public cho web (public_id 24hex). Slug tên kênh (CMS) vẫn yêu cầu quyền epg:read.
// Handler duy nhất để tránh xung đột route với ContentController.
@Controller('channels')
export class TvController {
  constructor(private tv: TvService, private jwt: JwtService, @Optional() private roles?: RolesService) {}

  // GET /api/v1/channels (Mục 3C).
  @Get()
  async groups() {
    return this.tv.listGroups();
  }

  // GET /api/v1/channels/{publicId}/epg?date=YYYY-MM-DD (Mục 3C, public).
  // GET /api/v1/channels/{slug}/epg (CMS cũ, cần quyền).
  @Get(':id/epg')
  async epg(@Param('id') id: string, @Query('date') date: string | undefined, @Req() req: any) {
    if (/^[0-9a-f]{24}$/.test(id)) {
      try {
        return await this.tv.epg(id, date);
      } catch (e: any) {
        const status = e?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
        throw new HttpException({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: e?.message } }, status);
      }
    }
    const auth = this.optionalAuth(req);
    if (!auth) throw new HttpException('missing bearer token', HttpStatus.UNAUTHORIZED);
    if (!(await this.canReadEpg(auth))) throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    return this.tv.cmsEpgBySlug(id, date);
  }

  // GET /api/v1/channels/{publicId}/timeshift.m3u8?start=ISO&end=ISO (public).
  // Proxy playlist xem lai (VOD) tu AIO: segment URL da tuyet doi hoa.
  @Get(':id/timeshift.m3u8')
  @Header('Content-Type', 'application/vnd.apple.mpegurl')
  @Header('Cache-Control', 'no-store')
  async timeshift(@Param('id') id: string, @Query('start') start: string, @Query('end') end: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) throw new HttpException('invalid public_id', HttpStatus.BAD_REQUEST);
    if (!start || !end) throw new HttpException('thieu start/end (ISO 8601)', HttpStatus.BAD_REQUEST);
    try {
      return await this.tv.timeshiftM3u8(id, start, end);
    } catch (e: any) {
      const status = e?.status === 404 ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
      throw new HttpException({ error: { code: status === 404 ? 'not_found' : 'bad_request', message: e?.message } }, status);
    }
  }

  private optionalAuth(req: any): { role?: string; sub?: string } | undefined {
    const header: string = req.headers?.authorization || '';
    const [, token] = header.split(' ');
    if (!token) return undefined;
    try {
      const payload = this.jwt.verify(token) as any;
      return { role: payload?.role, sub: payload?.sub };
    } catch {
      return undefined;
    }
  }

  // DB-first (giong PermissionsGuard), fallback role cung.
  private async canReadEpg(auth: { role?: string; sub?: string }): Promise<boolean> {
    if (this.roles && auth.sub) {
      try {
        const map = await this.roles.permissionMapForAdmin(auth.sub);
        if (map) return hasModulePermission(map, 'epg:read');
      } catch {
        /* fallback */
      }
    }
    return hasPermission((auth.role as Role) || 'admin', 'epg:read');
  }
}
