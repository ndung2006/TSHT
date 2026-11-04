import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { TvModule } from '../tv/tv.module';
import { UploadsModule } from '../uploads/uploads.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, AuditModule, PrismaModule, TvModule, UploadsModule, WorkflowsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
