// API dashboard GĐ1 (tai lieu duyet 04/11/2026, muc 6.2 — route thuc te
// theo quy uoc CMS hien tai: controller 'admin/dashboard' + global prefix
// 'api/v1' => GET /api/v1/admin/dashboard/...; CMS goi qua useApi() nhu
// cac trang quan tri khac).
// - GET /admin/dashboard/layout: widget + thu tu cua nguoi dang nhap.
// - GET /admin/dashboard/widgets/:code?from=&to=&line=&period=&actor=&action=
//   -> {code, generatedAt, data, empty, drill}.
// - Chi can JWT; quyen xem widget kiem tra O SERVER theo layout cua role:
//   widget khong co trong layout -> 403 (khong tra du lieu rong).
// - E1 khong co API rieng: frontend render tu visibleMenu() san co.

import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { DashboardService } from './dashboard.service';
import { WIDGET_META } from './dashboard-layout.config';

@UseGuards(PermissionsGuard)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private dashboard: DashboardService) {}

  @Get('layout')
  async layout(@Req() req: any) {
    const actor = await this.dashboard.actor(req.user?.sub || null);
    const out = this.dashboard.layout(actor);
    // Tra kem meta (tieu de + tang) de CMS khong viet cung tieu de o
    // giao dien; cau hinh bo cuc van chi nam o backend.
    const meta: Record<string, { title: string; tier: string }> = {};
    for (const code of out.layout) {
      const m = (WIDGET_META as Record<string, { title: string; tier: string }>)[code];
      if (m) meta[code] = { title: m.title, tier: m.tier };
    }
    return { ...out, meta };
  }

  @Get('widgets/:code')
  async widget(@Param('code') code: string, @Query() q: any, @Req() req: any) {
    const actor = await this.dashboard.actor(req.user?.sub || null);
    const allowed = this.dashboard.assertWidgetAllowed(actor, code);
    return this.dashboard.widget(actor, allowed, q || {});
  }
}
