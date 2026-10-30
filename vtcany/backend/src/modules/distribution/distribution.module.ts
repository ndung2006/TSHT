import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DistributionAdminController } from './distribution.controller';
import { DistributionPublicController } from './distribution-public.controller';
import { DistributionService } from './distribution.service';
import { FacebookController } from './facebook.controller';
import { FacebookService } from './facebook.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DistributionAdminController, DistributionPublicController, FacebookController],
  providers: [DistributionService, FacebookService],
  exports: [DistributionService],
})
export class DistributionModule {}
