// Goi "Quan ly giao dien": chi can Auth (guard quyen) + Prisma.
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { SiteInterfaceAdminController, SiteInterfacePublicController } from './site-interface.controller';
import { SiteInterfaceService } from './site-interface.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [SiteInterfaceAdminController, SiteInterfacePublicController],
  providers: [SiteInterfaceService],
  exports: [SiteInterfaceService],
})
export class SiteInterfaceModule {}
