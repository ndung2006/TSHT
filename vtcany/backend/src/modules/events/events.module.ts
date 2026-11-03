import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { EventsController, EventsPublicController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule, PrismaModule, WorkflowsModule],
  controllers: [EventsController, EventsPublicController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
