// API dem gop sidebar dot 2: GET /admin/sidebar-counts (global prefix
// 'api/v1' => /api/v1/admin/sidebar-counts). Chi can JWT hop le (khong
// RequirePerms rieng): pham vi muc tra ve tu loc theo quyen module cua
// user trong service (chi cac muc user co quyen), giong cach E1 render
// tu visibleMenu o frontend.

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SidebarCountsService } from './sidebar-counts.service';

@UseGuards(PermissionsGuard)
@Controller('admin/sidebar-counts')
export class SidebarCountsController {
  constructor(private counts: SidebarCountsService) {}

  @Get()
  async get(@Req() req: any) {
    return this.counts.counts(req.user?.sub || null, req.user);
  }
}
