import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { ZoneAdminController, ZonePublicController } from './zone.controller';
import { ZoneService } from './zone.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ZoneAdminController, ZonePublicController],
  providers: [ZoneService],
  exports: [ZoneService],
})
export class ZoneModule {}
