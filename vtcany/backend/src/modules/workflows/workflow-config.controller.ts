// API quan tri quy trinh duyet dong (trang CMS "Quy trinh duyet").
// Guard 'workflows' (xem PERMISSION_MODULES): superadmin '*' tu qua;
// role thuong can workflows:view de xem, workflows:update de luu.
// Rieng GET /admin/workflows/:key (xem cau hinh de hien thi dong o cac
// trang duyet) chi can JWT, khong doi workflows:view, vi ten buoc/Role
// von da hien trong giao dien duyet tu truoc.

import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { WorkflowConfigService } from './workflow-config.service';

@UseGuards(PermissionsGuard)
@Controller('admin/workflows')
export class WorkflowConfigController {
  constructor(private wf: WorkflowConfigService) {}

  @Get()
  @RequirePerms('workflows:view')
  list() {
    return this.wf.list();
  }

  @Get('meta/roles')
  @RequirePerms('workflows:view')
  roles() {
    return this.wf.roles();
  }

  @Get(':key/in-flight')
  @RequirePerms('workflows:view')
  inFlight(@Param('key') key: string) {
    return this.wf.inFlight(key);
  }

  @Get(':key')
  get(@Param('key') key: string) {
    return this.wf.get(key);
  }

  @Put(':key')
  @RequirePerms('workflows:update')
  save(@Param('key') key: string, @Body() body: any) {
    return this.wf.save(key, body || {});
  }
}
