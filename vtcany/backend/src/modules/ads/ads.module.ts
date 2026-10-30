import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdsController, AdsPublicController } from './ads.controller';
import { AdsService } from './ads.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [AdsController, AdsPublicController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
