import { Body, Controller, Get, HttpException, HttpStatus, Optional, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { ContentService } from './content.service';
import { EpgService } from './epg.service';
import { AuditService } from '../audit/audit.service';
import { PlaybackService } from '../playback/playback.service';
import { mapEpgSchedule } from '../playback/aio-client';
import { UploadsService } from '../uploads/uploads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { aioEpgAllowed, channelKeyOf } from '../tv/tv.catalog';

class CreateVideoDto {
  @IsString()
  title!: string;
  @IsOptional()
  @IsString()
  channel?: string;
}

class UpdateVideoDto {
  @IsOptional()
  @IsString()
  title?: string;
  @IsOptional()
  @IsString()
  channel?: string;
}

class EpgItemDto {
  @IsString()
  time!: string;
  @IsString()
  title!: string;
  @IsIn(['LIVE', 'UPCOMING', 'REPLAY'])
  status!: 'LIVE' | 'UPCOMING' | 'REPLAY';
}

class SetEpgDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EpgItemDto)
  timeline!: EpgItemDto[];
}

@UseGuards(PermissionsGuard)
@Controller()
export class ContentController {
  constructor(
    private content: ContentService,
    private epgService: EpgService,
    private audit: AuditService,
    private playback: PlaybackService,
    private uploads: UploadsService,
    @Optional() private prisma?: PrismaService,
  ) {}

  private actor(req: any) {
    return { actor: req.user?.username || 'unknown', role: req.user?.role };
  }

  @RequirePerms('video:read')
  @Get('videos')
  list(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.content.listPaged(page ? Number(page) : 1, limit ? Number(limit) : 20);
  }

  @RequirePerms('video:create')
  @Post('videos')
  create(@Body() dto: CreateVideoDto) {
    return this.content.create(dto.title, dto.channel);
  }

  @RequirePerms('video:read')
  @Get('videos/:id/play')
  play(@Param('id') id: string) {
    this.content.get(id); // 404 neu video khong ton tai
    try {
      return { video_id: id, ...this.uploads.videoPlay(id) };
    } catch {
      throw new HttpException(
        { error: { code: 'vod_not_ready', message: 'video chua co ban HLS (upload/transcode chua xong)' } },
        HttpStatus.NOT_FOUND,
      );
    }
  }

  @RequirePerms('video:read')
  @Get('videos/:id')
  get(@Param('id') id: string) {
    try {
      return this.content.get(id);
    } catch {
      throw new HttpException({ error: { code: 'not_found', message: 'video not found' } }, HttpStatus.NOT_FOUND);
    }
  }

  @RequirePerms('video:update')
  @Patch('videos/:id')
  update(@Param('id') id: string, @Body() dto: UpdateVideoDto, @Req() req: any) {
    try {
      const v = this.content.update(id, dto);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'video.update', resource: id });
      return v;
    } catch (e: any) {
      const msg = e?.message || 'bad request';
      if (msg === 'not found')
        throw new HttpException({ error: { code: 'not_found', message: 'video not found' } }, HttpStatus.NOT_FOUND);
      throw new HttpException({ error: { code: 'bad_request', message: msg } }, HttpStatus.BAD_REQUEST);
    }
  }

  private transition(fn: () => unknown) {
    try {
      return fn();
    } catch (e: any) {
      const msg = e?.message || 'invalid transition';
      if (msg === 'not found') {
        throw new HttpException({ error: { code: 'not_found', message: 'video not found' } }, HttpStatus.NOT_FOUND);
      }
      throw new HttpException({ error: { code: 'bad_request', message: msg } }, HttpStatus.BAD_REQUEST);
    }
  }

  @RequirePerms('video:submit')
  @Post('videos/:id/submit')
  submit(@Param('id') id: string, @Req() req: any) {
    const v: any = this.transition(() => this.content.submit(id));
    this.audit.record({ at: Date.now(), ...this.actor(req), action: 'video.submit', resource: id });
    return v;
  }

  @RequirePerms('video:publish')
  @Post('videos/:id/publish')
  publish(@Param('id') id: string, @Req() req: any) {
    const v: any = this.transition(() => this.content.publish(id));
    this.audit.record({ at: Date.now(), ...this.actor(req), action: 'video.publish', resource: id });
    return v;
  }

  @RequirePerms('video:publish')
  @Post('videos/:id/reject')
  reject(@Param('id') id: string, @Req() req: any) {
    const v: any = this.transition(() => this.content.reject(id));
    this.audit.record({ at: Date.now(), ...this.actor(req), action: 'video.reject', resource: id });
    return v;
  }

  // GET channels/:slug/epg đã chuyển sang TvController (public cho 24hex,
  // CMS slug vẫn yêu cầu quyền) để tránh xung đột route.

  // Lich full tu AIO theo ngay (VD ?date=2026-09-29). Kenh chua cap EPG
  // hoac AIO loi -> fallback timeline local.
  @RequirePerms('epg:read')
  @Get('channels/:slug/schedule')
  async schedule(@Param('slug') slug: string, @Query('date') date?: string) {
    const day = date || new Date().toISOString().slice(0, 10);
    // Admin tat "lay EPG tu AIO" cho kenh nay -> chi dung lich CMS nhap tay.
    let useAio = true;
    try {
      const o = await this.prisma?.channelOverride.findUnique({ where: { channelKey: channelKeyOf(slug) } });
      useAio = aioEpgAllowed(o as any);
    } catch { /* khong co DB -> giu mac dinh lay AIO */ }
    if (!useAio) {
      return {
        channel: { name: slug.toUpperCase(), slug },
        date: day,
        source: 'local',
        timeline: this.epgService.get(slug, day),
      };
    }
    try {
      const raw = await this.playback.channelSchedule(slug, day);
      if (!raw) throw new Error('no aio schedule');
      const timeline = mapEpgSchedule(raw);
      if (timeline.length === 0) throw new Error('unmappable schedule');
      return { channel: { name: slug.toUpperCase(), slug }, date: day, source: 'aio', timeline };
    } catch {
      return {
        channel: { name: slug.toUpperCase(), slug },
        date: day,
        source: 'local',
        timeline: this.epgService.get(slug, day),
      };
    }
  }

  @RequirePerms('epg:write')
  @Post('channels/:slug/epg')
  setEpg(@Param('slug') slug: string, @Body() dto: SetEpgDto, @Req() req: any, @Query('date') date?: string) {
    const timeline = this.epgService.set(slug, dto.timeline, date);
    this.audit.record({ at: Date.now(), ...this.actor(req), action: 'epg.write', resource: slug });
    return { channel: { name: slug.toUpperCase(), slug }, date: date || 'default', timeline };
  }
}
