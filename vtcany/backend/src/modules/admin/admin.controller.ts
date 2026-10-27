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
import { IsArray, IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../auth/users.service';
import { CategoryService, CreateCategoryDto } from './category.service';

class CategoryDto implements CreateCategoryDto {
  @IsString() name!: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsString() icon?: string;
  @IsOptional() @IsString() thumbnail?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isVisible?: boolean;
  @IsOptional() @IsArray() platforms?: string[];
  @IsOptional() @IsArray() appliesTo?: string[];
}

@UseGuards(PermissionsGuard)
@Controller('admin')
export class AdminController {
  constructor(private categories: CategoryService, private audit: AuditService, private users: UsersService) {}

  private actor(req: any) {
    return { actor: req.user?.username || 'unknown', role: req.user?.role };
  }

  private bad(e: any) {
    const msg = e?.message || 'bad request';
    const code = msg === 'not found' ? 'not_found' : 'bad_request';
    const status = msg === 'not found' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
    throw new HttpException({ error: { code, message: msg } }, status);
  }

  // ---- Danh mục ----
  @RequirePerms('category:read')
  @Get('categories')
  async listCategories() {
    return { data: await this.categories.list() };
  }

  @RequirePerms('category:create')
  @Post('categories')
  async createCategory(@Body() dto: CategoryDto, @Req() req: any) {
    try {
      const c = await this.categories.create(dto);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'category.create', resource: c.id });
      return c;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('category:update')
  @Patch('categories/:id')
  async updateCategory(@Param('id') id: string, @Body() dto: CategoryDto, @Req() req: any) {
    try {
      const c = await this.categories.update(id, dto);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'category.update', resource: id });
      return c;
    } catch (e) {
      this.bad(e);
    }
  }

  @RequirePerms('category:delete')
  @Delete('categories/:id')
  async deleteCategory(@Param('id') id: string, @Req() req: any) {
    try {
      const r = await this.categories.remove(id);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'category.delete', resource: id });
      return r;
    } catch (e) {
      this.bad(e);
    }
  }

  // ---- Người dùng cuối (CMS quan ly: them/sua/xoa/khoa/dat lai mat khau) ----
  @RequirePerms('user:read')
  @Get('users')
  async listUsers(@Req() req: any) {
    const { page, limit, q } = req.query || {};
    try {
      return await this.users.list({ page: Number(page), limit: Number(limit), q });
    } catch (e) {
      return this.bad(e);
    }
  }

  @RequirePerms('user:write')
  @Post('users')
  async createUser(@Body() dto: any, @Req() req: any) {
    try {
      const u = await this.users.create(dto || {});
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'user.create', resource: u.id });
      return { data: u };
    } catch (e) {
      return this.userErr(e);
    }
  }

  @RequirePerms('user:write')
  @Patch('users/:id')
  async updateUser(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    try {
      const u = await this.users.update(id, dto || {});
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'user.update', resource: id });
      return { data: u };
    } catch (e) {
      return this.userErr(e);
    }
  }

  @RequirePerms('user:write')
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: any) {
    try {
      const r = await this.users.remove(id);
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'user.delete', resource: id });
      return r;
    } catch (e) {
      return this.userErr(e);
    }
  }

  // Admin dat lai mat khau cho nguoi dung (de user dang nhap lai bang MK moi).
  @RequirePerms('user:write')
  @Post('users/:id/reset-password')
  async resetUserPassword(@Param('id') id: string, @Body() dto: any, @Req() req: any) {
    try {
      const r = await this.users.resetPassword(id, dto?.newPassword || '');
      this.audit.record({ at: Date.now(), ...this.actor(req), action: 'user.reset-password', resource: id });
      return r;
    } catch (e) {
      return this.userErr(e);
    }
  }

  private userErr(e: any): never {
    const code = e?.code || 'bad_request';
    const status =
      code === 'not_found' ? HttpStatus.NOT_FOUND
      : code === 'conflict' ? HttpStatus.CONFLICT
      : code === 'weak_password' ? HttpStatus.BAD_REQUEST
      : HttpStatus.BAD_REQUEST;
    throw new HttpException({ error: { code, message: e?.message || 'bad request' } }, status);
  }
}
