import {
  Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Put, Req, UseGuards,
} from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { TvService } from './tv.service';

// Quan tri hien thi kenh truyen hinh: nguon kenh tu VTC AIO, BE quyet dinh
// kenh nao duoc hien thi (an/hien, nhom, thu tu, ten/logo, nguon phat ghi de).
@UseGuards(PermissionsGuard)
@Controller('admin/channels')
export class AdminChannelsController {
  constructor(private tv: TvService, private audit: AuditService) {}

  private actor(req: any) {
    return { actor: req.user?.username || 'unknown', role: req.user?.role };
  }

  private bad(e: any) {
    throw new HttpException(
      { error: { code: 'bad_request', message: e?.message || 'bad request' } },
      HttpStatus.BAD_REQUEST,
    );
  }

  @RequirePerms('catalog:read')
  @Get()
  async list() {
    try {
      return await this.tv.adminListChannels();
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('catalog:write')
  @Put(':key')
  async upsert(@Param('key') key: string, @Body() dto: any, @Req() req: any) {
    try {
      const row = await this.tv.upsertOverride(decodeURIComponent(key), dto || {});
      try {
        this.audit.record({ at: Date.now(), ...this.actor(req), action: 'channel_override.upsert', resource: row.channelKey });
      } catch { /* audit khong duoc lam hong request chinh */ }
      return row;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('catalog:write')
  @Delete(':key')
  async remove(@Param('key') key: string, @Req() req: any) {
    try {
      const out = await this.tv.deleteOverride(decodeURIComponent(key));
      try {
        this.audit.record({ at: Date.now(), ...this.actor(req), action: 'channel_override.delete', resource: out.key });
      } catch { /* audit khong duoc lam hong request chinh */ }
      return out;
    } catch (e) {
      this.bad(e);
    }
  }
}
