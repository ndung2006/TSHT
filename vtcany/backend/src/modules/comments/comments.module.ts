import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { AdminCommentsController } from './admin-comments.controller';
import { CommentsInternalController } from './comments-internal.controller';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuthModule, CatalogModule, PrismaModule],
  controllers: [CommentsController, AdminCommentsController, CommentsInternalController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
