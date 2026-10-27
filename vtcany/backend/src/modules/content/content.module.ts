import { Module } from '@nestjs/common';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { EpgService } from './epg.service';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PlaybackModule } from '../playback/playback.module';
import { UploadsModule } from '../uploads/uploads.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuthModule, AuditModule, PlaybackModule, UploadsModule, PrismaModule],
  controllers: [ContentController],
  providers: [ContentService, EpgService],
  exports: [ContentService, EpgService],
})
export class ContentModule {}
