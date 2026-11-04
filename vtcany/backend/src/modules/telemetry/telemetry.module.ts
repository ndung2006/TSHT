import { Module } from '@nestjs/common';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';
import { ChannelTelemetryController } from './channel-telemetry.controller';
import { ChannelTelemetryService } from './channel-telemetry.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TvModule } from '../tv/tv.module';

@Module({
  imports: [AuthModule, PrismaModule, TvModule],
  controllers: [TelemetryController, ChannelTelemetryController],
  providers: [TelemetryService, ChannelTelemetryService],
  exports: [TelemetryService, ChannelTelemetryService],
})
export class TelemetryModule {}
