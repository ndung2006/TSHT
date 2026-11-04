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
import { HomeBlocksService } from './home-blocks.service';

// DTO tạo mới: type bắt buộc (service kiểm tra lại). DTO sửa riêng
// mọi trường optional để công tắc Bật/Tắt chỉ gửi { isActive } không
// rớt validation (bài học từ lỗi gạt công tắc danh mục 2026-11-04).
class CreateHomeBlockDto {
  @IsString() type!: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() column?: string;
  @IsOptional() @IsString() categorySlug?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class UpdateHomeBlockDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsInt() order?: number;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() column?: string;
  @IsOptional() @IsString() categorySlug?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// Public (không JWT): trang chủ là nội dung mở, giống layout/home.
@Controller()
export class HomeBlocksPublicController {
  constructor(private homeBlocks: HomeBlocksService) {}

  @Get('home-blocks')
  async listPublic() {
    return this.homeBlocks.listPublic();
  }
}

@UseGuards(PermissionsGuard)
@Controller('admin')
export class HomeBlocksAdminController {
  constructor(private homeBlocks: HomeBlocksService, private audit: AuditService) {}

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
  @Get('home-blocks')
  async list() {
    return { data: await this.homeBlocks.listAdmin() };
  }

  @RequirePerms('layout:write')
  @Post('home-blocks')
  async create(@Body() dto: CreateHomeBlockDto, @Req() req: any) {
    try {
      const b = await this.homeBlocks.create(dto as any);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'layout.create', resource: b.id });
      return b;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('layout:write')
  @Patch('home-blocks/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateHomeBlockDto, @Req() req: any) {
    try {
      const b = await this.homeBlocks.update(id, dto as any);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'layout.update', resource: id });
      return b;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('layout:write')
  @Delete('home-blocks/:id')
  async remove(@Param('id') id: string, @Req() req: any) {
    try {
      const r = await this.homeBlocks.remove(id);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'layout.delete', resource: id });
      return r;
    } catch (e) {
      this.bad(e);
    }
  }
}
