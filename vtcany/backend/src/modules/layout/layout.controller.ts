import { Controller, Get, Param, Query } from '@nestjs/common';
import { LayoutService } from './layout.service';
import { PlaybackService } from '../playback/playback.service';
import { ContentService } from '../content/content.service';
import { EpgService } from '../content/epg.service';

// Public (khong JWT): trang chu + chi tiet kenh la noi dung mo.
@Controller()
export class LayoutController {
  constructor(
    private layout: LayoutService,
    private playback: PlaybackService,
    private content: ContentService,
    private epg: EpgService,
  ) {}

  @Get('layout/home')
  async home(@Query('platform') platform?: string) {
    // Server-Driven UI theo contract Mục 3A (seed 6 blocks giống trang chủ VTC Play).
    return this.layout.getHome(platform);
  }

  // Hero banner theo section cho cac tab (FE TabHomePage goi theo section).
  @Get('layout/section/:section')
  async sectionHero(@Param('section') section: string) {
    return { platform: 'WEB', section, hero: this.layout.getSectionHero(section) };
  }

  @Get('channels/:slug/detail')
  async detail(@Param('slug') slug: string, @Query('date') date?: string) {
    const name = slug.toUpperCase();
    let epgNow: unknown = null;
    try {
      epgNow = await this.playback.channelNow(name);
    } catch {
      epgNow = null;
    }
    const audioOnly = await this.playback.channelAudioOnly(name);
    return {
      channel: { name, slug },
      audioOnly,
      epgNow,
      date: date || 'default',
      timeline: this.epg.get(name, date),
      // Link play lay rieng qua POST /playback/token (het han theo TTL).
      play: { via: 'POST /api/v1/playback/token {type:live, slug}' },
    };
  }
}
