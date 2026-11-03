import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { RoyaltiesController } from './royalties.controller';
import { RoyaltiesService } from './royalties.service';

@Module({
  imports: [AuthModule, PrismaModule, WorkflowsModule],
  controllers: [RoyaltiesController],
  providers: [RoyaltiesService],
  exports: [RoyaltiesService],
})
export class RoyaltiesModule {}
