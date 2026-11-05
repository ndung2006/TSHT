import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { HomeSlotAdminController, HomeSlotPublicController } from './home-slots.controller';
import { HomeSlotService } from './home-slots.service';

@Module({
  imports: [AuthModule, AuditModule, PrismaModule],
  controllers: [HomeSlotAdminController, HomeSlotPublicController],
  providers: [HomeSlotService],
  exports: [HomeSlotService],
})
export class HomeSlotsModule {}
