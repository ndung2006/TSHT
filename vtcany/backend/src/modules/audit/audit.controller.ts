import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePerms } from '../auth/permissions.decorator';
import { AuditService } from './audit.service';

@UseGuards(PermissionsGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private audit: AuditService) {}

  @RequirePerms('audit:read')
  @Get()
  list(@Query('limit') limit?: string) {
    return this.audit.list(limit ? Number(limit) : 100);
  }
}
