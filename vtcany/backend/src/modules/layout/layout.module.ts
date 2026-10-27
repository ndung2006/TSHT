import { Module } from '@nestjs/common';
import { LayoutController } from './layout.controller';
import { LayoutService } from './layout.service';
import { PlaybackModule } from '../playback/playback.module';
import { ContentModule } from '../content/content.module';

@Module({
  imports: [PlaybackModule, ContentModule],
  controllers: [LayoutController],
  providers: [LayoutService],
  exports: [LayoutService],
})
export class LayoutModule {}
