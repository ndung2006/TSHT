import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkflowConfigController } from './workflow-config.controller';
import { WorkflowConfigService } from './workflow-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkflowConfigController],
  providers: [WorkflowConfigService],
  exports: [WorkflowConfigService],
})
export class WorkflowsModule {}
