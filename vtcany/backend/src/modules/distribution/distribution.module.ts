import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { DistributionAdminController } from './distribution.controller';
import { DistributionPublicController } from './distribution-public.controller';
import { DistributionService } from './distribution.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [DistributionAdminController, DistributionPublicController],
  providers: [DistributionService],
  exports: [DistributionService],
})
export class DistributionModule {}
