import { Module } from '@nestjs/common';
import { PlaybackController } from './playback.controller';
import { AioSourceAdminController } from './aio-source-admin.controller';
import { PlaybackService } from './playback.service';
import { AioSourceService } from './aio-source.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuthModule, AuditModule, PrismaModule],
  controllers: [PlaybackController, AioSourceAdminController],
  providers: [PlaybackService, AioSourceService],
  exports: [PlaybackService, AioSourceService],
})
export class PlaybackModule {}
