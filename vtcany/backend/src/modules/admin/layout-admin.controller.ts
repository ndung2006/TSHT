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
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { LayoutService } from '../layout/layout.service';
import { HomeBlockSeed } from '../layout/seed-data';

class BlockDto {
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() type?: 'HERO_CAROUSEL' | 'HORIZONTAL_LIST';
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() target_url?: string;
  @IsOptional() @IsString() card_aspect?: '3:2' | '3:4';
  @IsOptional() @IsBoolean() is_active?: boolean;
  @IsOptional() items?: HomeBlockSeed['items'];
}

@UseGuards(PermissionsGuard)
@Controller('admin/layout-blocks')
export class LayoutAdminController {
  constructor(private layout: LayoutService, private audit: AuditService) {}

  private actor(req: any) {
    return { actor: req.user?.username || 'unknown', role: req.user?.role };
  }

  private bad(e: any) {
    const msg = e?.message || 'bad request';
    const code = msg === 'not found' ? 'not_found' : 'bad_request';
    const status = msg === 'not found' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    throw new HttpException({ error: { code, message: msg } }, status);
  }

  @RequirePerms('layout:read')
  @Get()
  list() {
    return { data: this.layout.listAll() };
  }

  @RequirePerms('layout:write')
  @Post()
  create(@Body() dto: BlockDto, @Req() req: any) {
    try {
      const b = this.layout.createBlock(dto as any);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'layout.create', resource: b.id });
      return b;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('layout:write')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: BlockDto, @Req() req: any) {
    try {
      const b = this.layout.updateBlock(id, dto);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'layout.update', resource: id });
      return b;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('layout:write')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    try {
      const r = this.layout.removeBlock(id);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'layout.delete', resource: id });
      return r;
    } catch (e) {
      this.bad(e);
    }
  }
}
