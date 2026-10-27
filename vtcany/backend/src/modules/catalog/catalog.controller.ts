import {
  Body,
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { EpgService } from '../content/epg.service';
import { parseEpgFile, buildEpgTemplateXlsx } from '../content/epg-file';
import { UploadsService } from '../uploads/uploads.service';
import { END_USERS } from '../auth/users.store';
import { CatalogService } from './catalog.service';
import { VodService, VodKind } from './vod.service';

const ENTITIES = [
  'movies', 'videos', 'shorts', 'genres', 'actors', 'playlists',
  'articles', 'events', 'plans', 'notifications', 'keywords',
  'banned', 'livestreams', 'banners', 'rails',
] as const;

@UseGuards(PermissionsGuard)
@Controller('admin/catalog')
export class CatalogController {
  constructor(
    private catalog: CatalogService,
    private audit: AuditService,
    private epg: EpgService,
    private uploads: UploadsService,
    private vod: VodService,
  ) {}

  private actor(req: any) {
    return { actor: req.user?.username || 'unknown', role: req.user?.role };
  }

  private bad(e: any) {
    const msg = e?.message || 'bad request';
    const code = msg === 'not found' ? 'not_found' : msg === 'unknown entity' ? 'unknown_entity' : 'bad_request';
    const status = msg === 'not found' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    throw new HttpException({ error: { code, message: msg } }, status);
  }

  private vodBad(e: any): never {
    const msg = e?.message || 'bad request';
    if (msg === 'not found') {
      throw new HttpException({ error: { code: 'not_found', message: msg } }, HttpStatus.NOT_FOUND);
    }
    if (msg === 'vod not ready') {
      throw new HttpException(
        { error: { code: 'vod_not_ready', message: 'video chua san sang (chua gan file hoac transcode chua xong)' } },
        HttpStatus.NOT_FOUND,
      );
    }
    throw new HttpException({ error: { code: 'bad_request', message: msg } }, HttpStatus.BAD_REQUEST);
  }

  private log(req: any, action: string, resource: string, resourceId?: string) {
    try {
      this.audit.record({ at: Date.now(), ...this.actor(req), action: `${resource}.${action}`, resource: resourceId || resource });
    } catch { /* audit khong duoc lam hong request chinh */ }
  }

  // ---- Episodes (nam trong movie, hoac trong season doi voi phim bo) ----
  @RequirePerms('catalog:read')
  @Get('movies/:id/episodes')
  async listEpisodes(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string, @Query('seasonId') seasonId?: string) {
    try {
      return await this.catalog.listEpisodes(id, Number(page) || 1, Number(limit) || 20, seasonId);
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('movies/:id/episodes')
  async createEpisode(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const ep = await this.catalog.createEpisode(id, body || {});
      this.log(req, 'create', 'episodes', ep.id);
      return ep;
    } catch (e) { this.bad(e); }
  }

  // ---- Seasons (mua / phan cua phim bo) ----
  @RequirePerms('catalog:read')
  @Get('movies/:id/seasons')
  async listSeasons(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    try {
      return await this.catalog.listSeasons(id, Number(page) || 1, Number(limit) || 50);
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('movies/:id/seasons')
  async createSeason(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const s = await this.catalog.createSeason(id, body || {});
      this.log(req, 'create', 'seasons', s.id);
      return s;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Patch('seasons/:id')
  async updateSeason(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const s = await this.catalog.updateSeason(id, body || {});
      this.log(req, 'update', 'seasons', id);
      return s;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Delete('seasons/:id')
  async deleteSeason(@Param('id') id: string, @Req() req: any) {
    try {
      await this.catalog.deleteSeason(id);
      this.log(req, 'delete', 'seasons', id);
      return { ok: true };
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('seasons/:id/publish')
  async publishSeason(@Param('id') id: string, @Req() req: any) {
    try {
      const s = await this.catalog.setSeasonPublished(id, true);
      this.log(req, 'publish', 'seasons', id);
      return s;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('seasons/:id/unpublish')
  async unpublishSeason(@Param('id') id: string, @Req() req: any) {
    try {
      const s = await this.catalog.setSeasonPublished(id, false);
      this.log(req, 'unpublish', 'seasons', id);
      return s;
    } catch (e) { this.bad(e); }
  }

  // ---- Trailers (cap phim voi phim le, cap mua voi phim bo) ----
  @RequirePerms('catalog:read')
  @Get('movies/:id/trailers')
  async listMovieTrailers(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    try {
      return await this.catalog.listTrailers({ movieId: id }, Number(page) || 1, Number(limit) || 50);
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('movies/:id/trailers')
  async createMovieTrailer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const t = await this.catalog.createTrailer({ movieId: id }, body || {});
      this.log(req, 'create', 'trailers', t.id);
      return t;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:read')
  @Get('seasons/:id/trailers')
  async listSeasonTrailers(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    try {
      return await this.catalog.listTrailers({ seasonId: id }, Number(page) || 1, Number(limit) || 50);
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('seasons/:id/trailers')
  async createSeasonTrailer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const t = await this.catalog.createTrailer({ seasonId: id }, body || {});
      this.log(req, 'create', 'trailers', t.id);
      return t;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Patch('trailers/:id')
  async updateTrailer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const t = await this.catalog.updateTrailer(id, body || {});
      this.log(req, 'update', 'trailers', id);
      return t;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Delete('trailers/:id')
  async deleteTrailer(@Param('id') id: string, @Req() req: any) {
    try {
      await this.catalog.deleteTrailer(id);
      this.log(req, 'delete', 'trailers', id);
      return { ok: true };
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('trailers/:id/publish')
  async publishTrailer(@Param('id') id: string, @Req() req: any) {
    try {
      const t = await this.catalog.setTrailerPublished(id, true);
      this.log(req, 'publish', 'trailers', id);
      return t;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('trailers/:id/unpublish')
  async unpublishTrailer(@Param('id') id: string, @Req() req: any) {
    try {
      const t = await this.catalog.setTrailerPublished(id, false);
      this.log(req, 'unpublish', 'trailers', id);
      return t;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:read')
  @Get('trailers/:id/play')
  async trailerPlay(@Param('id') id: string) {
    try {
      return await this.vod.resolvePlay('trailer', id, { admin: true });
    } catch (e: any) {
      this.vodBad(e);
    }
  }

  @RequirePerms('catalog:write')
  @Patch('episodes/:id')
  async updateEpisode(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const ep = await this.catalog.updateEpisode(id, body || {});
      this.log(req, 'update', 'episodes', id);
      return ep;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Delete('episodes/:id')
  async deleteEpisode(@Param('id') id: string, @Req() req: any) {
    try {
      await this.catalog.deleteEpisode(id);
      this.log(req, 'delete', 'episodes', id);
      return { ok: true };
    } catch (e) { this.bad(e); }
  }

  // ---- Xuat ban / an noi dung (VOD) ----
  @RequirePerms('catalog:write')
  @Post('episodes/:id/publish')
  async publishEpisode(@Param('id') id: string, @Req() req: any) {
    try {
      const ep = await this.catalog.setEpisodePublished(id, true);
      this.log(req, 'publish', 'episodes', id);
      return ep;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post('episodes/:id/unpublish')
  async unpublishEpisode(@Param('id') id: string, @Req() req: any) {
    try {
      const ep = await this.catalog.setEpisodePublished(id, false);
      this.log(req, 'unpublish', 'episodes', id);
      return ep;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  // Xem truoc VOD ngay trong CMS (ke ca khi chua xuat ban): tra URL playlist ky HMAC.
  @RequirePerms('catalog:read')
  @Get('episodes/:id/play')
  async episodePlay(@Param('id') id: string) {
    try {
      return await this.vod.resolvePlay('episode', id, { admin: true });
    } catch (e: any) {
      this.vodBad(e);
    }
  }

  @RequirePerms('catalog:read')
  @Get(':entity/:id/play')
  async itemPlay(@Param('entity') entity: string, @Param('id') id: string) {
    const kind: VodKind | null = entity === 'shorts' ? 'short' : entity === 'videos' ? 'video' : null;
    if (!kind) this.bad(new Error('unknown entity'));
    try {
      return await this.vod.resolvePlay(kind as VodKind, id, { admin: true });
    } catch (e: any) {
      this.vodBad(e);
    }
  }

  @Post(':entity/:id/publish')
  async publish(@Param('entity') entity: string, @Param('id') id: string, @Req() req: any) {
    try {
      const item = await this.catalog.setPublished(entity, id, true);
      this.log(req, 'publish', entity, id);
      return item;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post(':entity/:id/unpublish')
  async unpublish(@Param('entity') entity: string, @Param('id') id: string, @Req() req: any) {
    try {
      const item = await this.catalog.setPublished(entity, id, false);
      this.log(req, 'unpublish', entity, id);
      return item;
    } catch (e) { this.bad(e); }
  }

  // ---- Settings ----
  @RequirePerms('catalog:read')
  @Get('settings/all')
  async getSettings() {
    return this.catalog.getSettings();
  }

  @RequirePerms('catalog:write')
  @Put('settings/all')
  async putSettings(@Body() body: any, @Req() req: any) {
    const s = await this.catalog.putSettings(body || {});
    this.log(req, 'update', 'settings');
    return s;
  }

  // ---- Media library (Tap tin) ----
  @RequirePerms('catalog:read')
  @Get('files/all')
  listFiles(@Query('page') page?: string, @Query('limit') limit?: string) {
    const p = Math.max(1, Number(page) || 1);
    const l = Math.min(100, Math.max(1, Number(limit) || 20));
    const all = this.uploads.listUploads();
    return { data: all.slice((p - 1) * l, p * l), meta: { page: p, limit: l, total: all.length } };
  }

  // ---- Analytics ----
  @RequirePerms('catalog:read')
  @Get('analytics/summary')
  async summary() {
    // Dem user/channel that su lieu hien co; bieu do dang ky dung mock on dinh.
    return {
      ...(await this.catalog.summary({ users: END_USERS.length, channels: 0 })),
      registrations7d: [3, 5, 2, 6, 4, 7, 5],
    };
  }

  // ---- EPG: template + import Excel/CSV ----
  @RequirePerms('epg:read')
  @Get('epg/template')
  template(@Res() res: Response, @Query('format') format?: string) {
    if (format === 'xlsx') {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="epg-template.xlsx"');
      res.send(buildEpgTemplateXlsx());
      return;
    }
    const csv = 'ten_chuong_trinh,noi_dung,bat_dau,ket_thuc,xem_lai\n"Thoi su 19h","Ban tin thoi su",19:00,19:45,1\n"Phim truyen","Tap 12",20:00,21:00,0\n';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="epg-template.csv"');
    res.send('﻿' + csv);
  }

  @RequirePerms('epg:write')
  @Post('channels/:id/epg/import')
  @UseInterceptors(FileInterceptor('file'))
  importEpg(@Param('id') id: string, @UploadedFile() file: any, @Query('date') date: string, @Req() req: any) {
    try {
      if (!file?.buffer) throw new Error('file is required (multipart field "file")');
      // Tu nhan dien .xlsx that (ZIP) hoac CSV theo magic bytes.
      const { format, items } = parseEpgFile(file.buffer, file.originalname || '');
      const saved = this.epg.set(id, items, date);
      this.log(req, 'import', 'epg', id);
      return { ok: true, channelId: id, date: date || 'default', imported: saved.length, format };
    } catch (e) { this.bad(e); }
  }

  // ---- Generic CRUD ----
  @RequirePerms('catalog:read')
  @Get(':entity')
  async list(@Param('entity') entity: string, @Query('page') page?: string, @Query('limit') limit?: string, @Query('q') q?: string) {
    try {
      return await this.catalog.list(entity, { page: Number(page) || 1, limit: Number(limit) || 20, q });
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Post(':entity')
  async create(@Param('entity') entity: string, @Body() body: any, @Req() req: any) {
    try {
      const item = await this.catalog.create(entity, body || {});
      this.log(req, 'create', entity, item.id);
      return item;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:read')
  @Get(':entity/:id')
  async getOne(@Param('entity') entity: string, @Param('id') id: string) {
    try {
      return await this.catalog.get(entity, id);
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Patch(':entity/:id')
  async update(@Param('entity') entity: string, @Param('id') id: string, @Body() body: any, @Req() req: any) {
    try {
      const item = await this.catalog.update(entity, id, body || {});
      this.log(req, 'update', entity, id);
      return item;
    } catch (e) { this.bad(e); }
  }

  @RequirePerms('catalog:write')
  @Delete(':entity/:id')
  async remove(@Param('entity') entity: string, @Param('id') id: string, @Req() req: any) {
    try {
      await this.catalog.remove(entity, id);
      this.log(req, 'delete', entity, id);
      return { ok: true };
    } catch (e) { this.bad(e); }
  }

}
