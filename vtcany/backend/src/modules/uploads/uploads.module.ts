import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { MediaController } from './media.controller';
import { MediaFoldersController, MediaLibraryController } from './media-library.controller';
import { MediaLibraryService } from './media-library.service';
import { UploadsService } from './uploads.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [UploadsController, MediaController, MediaLibraryController, MediaFoldersController],
  providers: [UploadsService, MediaLibraryService],
  exports: [UploadsService],
})
export class UploadsModule {}
