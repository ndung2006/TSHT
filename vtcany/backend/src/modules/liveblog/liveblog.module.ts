import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LiveblogController, LiveblogPublicController } from './liveblog.controller';
import { LiveblogService } from './liveblog.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [LiveblogController, LiveblogPublicController],
  providers: [LiveblogService],
  exports: [LiveblogService],
})
export class LiveblogModule {}
