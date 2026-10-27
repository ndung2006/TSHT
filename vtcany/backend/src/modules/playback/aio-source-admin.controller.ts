import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { AioSourceService } from './aio-source.service';

// Quan tri nguon phat VTCAIO (trang CMS truyen-hinh):
// nhap ten mien + token key, quet thu kenh, kich hoat nguon dung cho runtime.
// Token key khong bao gio tra ve qua API.
@UseGuards(PermissionsGuard)
@Controller('admin/tv/aio-sources')
export class AioSourceAdminController {
  constructor(private sources: AioSourceService, private audit: AuditService) {}

  private actor(req: any) {
    return { actor: req.user?.username || 'unknown', role: req.user?.role };
  }

  private bad(e: any): never {
    const msg = e?.message || 'bad request';
    const code = msg === 'not found' ? 'not_found' : 'bad_request';
    const status = msg === 'not found' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    throw new HttpException({ error: { code, message: msg } }, status);
  }

  @RequirePerms('catalog:read')
  @Get()
  async list() {
    return { data: await this.sources.list() };
  }

  @RequirePerms('catalog:write')
  @Post()
  async create(@Body() dto: any, @Req() req: any) {
    try {
      const s = await this.sources.create(dto || {});
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'aio_source.create', resource: s.id });
      return s;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('catalog:write')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    try {
      const s = await this.sources.update(id, dto || {});
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'aio_source.update', resource: id });
      return s;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('catalog:write')
  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: any) {
    try {
      const r = await this.sources.remove(id);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'aio_source.delete', resource: id });
      return r;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('catalog:write')
  @Post(':id/activate')
  async activate(@Param('id') id: string, @Req() req: any) {
    try {
      const s = await this.sources.setActive(id);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'aio_source.activate', resource: id });
      return s;
    } catch (e) {
      this.bad(e);
    }
  }

  // Quet thu kenh tu domain + token key (khong luu) — body: { domain, tokenKey } hoac { sourceId }.
  @RequirePerms('catalog:read')
  @Post('scan')
  async scan(@Body() dto: any) {
    try {
      if (dto?.sourceId) {
        // Scan theo nguon da luu: dung key that trong DB (khong tra key ve client).
        return await this.sources.scanSaved(dto.sourceId);
      }
      return await this.sources.scan(dto?.domain, dto?.tokenKey);
    } catch (e) {
      this.bad(e);
    }
  }
}
