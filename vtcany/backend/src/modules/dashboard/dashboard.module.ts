import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { TvModule } from '../tv/tv.module';
import { UploadsModule } from '../uploads/uploads.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { NewsModule } from '../news/news.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DashboardController } from './dashboard.controller';
import { SidebarCountsController } from './sidebar-counts.controller';
import { DashboardService } from './dashboard.service';
import { SidebarCountsService } from './sidebar-counts.service';

@Module({
  imports: [AuthModule, AuditModule, PrismaModule, TvModule, UploadsModule, WorkflowsModule, NewsModule],
  controllers: [DashboardController, SidebarCountsController],
  providers: [DashboardService, SidebarCountsService],
  exports: [DashboardService],
})
export class DashboardModule {}
