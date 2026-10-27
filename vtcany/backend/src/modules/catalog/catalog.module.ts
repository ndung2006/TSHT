import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { PublicCatalogController } from './public-catalog.controller';
import { CatalogService } from './catalog.service';
import { VodController } from './vod.controller';
import { VodService } from './vod.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { ContentModule } from '../content/content.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [AuthModule, AuditModule, ContentModule, UploadsModule, PrismaModule, AdminModule],
  controllers: [CatalogController, VodController, PublicCatalogController],
  providers: [CatalogService, VodService],
  exports: [CatalogService, VodService],
})
export class CatalogModule {}
