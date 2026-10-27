import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { LayoutAdminController } from './layout-admin.controller';
import { CategoryService } from './category.service';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { LayoutModule } from '../layout/layout.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuditModule, AuthModule, LayoutModule, PrismaModule],
  controllers: [AdminController, LayoutAdminController],
  providers: [CategoryService],
  exports: [CategoryService],
})
export class AdminModule {}
