import { Module } from '@nestjs/common';
import { EpaperController } from './epaper.controller';
import { EpaperPublicController } from './epaper-public.controller';
import { EpaperService } from './epaper.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuthModule, AuditModule, UploadsModule, PrismaModule],
  controllers: [EpaperController, EpaperPublicController],
  providers: [EpaperService],
  exports: [EpaperService],
})
export class EpaperModule {}
