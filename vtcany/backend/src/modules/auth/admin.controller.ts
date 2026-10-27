import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RequirePerms } from './permissions.decorator';
import { RolesService } from './roles.service';
import { AdminsService } from './admins.service';
import { ACTION_LABELS, PERMISSION_MODULES } from './permissions.catalog';

// Quan tri vai tro + tai khoan admin (giong CMS VTC Play: /roles, /admins).
@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminController {
  constructor(private roles: RolesService, private admins: AdminsService) {}

  // ---- Danh muc quyen chuan (cho ma tran CMS) ----
  @Get('permissions/catalog')
  @RequirePerms('roles:view')
  permissionCatalog() {
    return { actions: ACTION_LABELS, modules: PERMISSION_MODULES };
  }

  // ---- Vai tro ----
  @Get('roles')
  @RequirePerms('roles:view')
  listRoles() {
    return this.roles.list();
  }

  @Post('roles')
  @RequirePerms('roles:create')
  createRole(@Body() body: any) {
    return this.roles.create(body || {});
  }

  @Patch('roles/:id')
  @RequirePerms('roles:update')
  updateRole(@Param('id') id: string, @Body() body: any) {
    return this.roles.update(id, body || {});
  }

  @Delete('roles/:id')
  @RequirePerms('roles:delete')
  deleteRole(@Param('id') id: string) {
    return this.roles.remove(id);
  }

  // ---- Quan tri vien ----
  @Get('admins')
  @RequirePerms('admins:view')
  listAdmins(@Query('q') q?: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.admins.list(q, Math.max(1, Number(page) || 1), Math.min(100, Math.max(1, Number(limit) || 20)));
  }

  @Post('admins')
  @RequirePerms('admins:create')
  createAdmin(@Body() body: any) {
    return this.admins.create(body || {});
  }

  @Patch('admins/:id')
  @RequirePerms('admins:update')
  updateAdmin(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.admins.update(id, body || {}, req.user?.sub);
  }

  @Delete('admins/:id')
  @RequirePerms('admins:delete')
  deleteAdmin(@Param('id') id: string, @Req() req: any) {
    return this.admins.remove(id, req.user?.sub);
  }
}
