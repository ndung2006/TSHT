import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { WorkflowsModule } from '../workflows/workflows.module';
import { LiveblogController, LiveblogPublicController } from './liveblog.controller';
import { LiveblogService } from './liveblog.service';

@Module({
  imports: [AuthModule, PrismaModule, WorkflowsModule],
  controllers: [LiveblogController, LiveblogPublicController],
  providers: [LiveblogService],
  exports: [LiveblogService],
})
export class LiveblogModule {}
