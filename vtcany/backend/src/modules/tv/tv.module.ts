import { Module } from '@nestjs/common';
import { TvController } from './tv.controller';
import { AdminChannelsController } from './admin-channels.controller';
import { TvService } from './tv.service';
import { PlaybackModule } from '../playback/playback.module';
import { ContentModule } from '../content/content.module';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PlaybackModule, ContentModule, AuthModule, AuditModule, PrismaModule],
  controllers: [TvController, AdminChannelsController],
  providers: [TvService],
  exports: [TvService],
})
export class TvModule {}
