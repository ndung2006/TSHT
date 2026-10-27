import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { clampTtlMinutes, findCoverageEntry, getChannels, getEpgSchedule, getTimeshiftCoverage, getTimeshiftPlaylist, isAudioOnly, stitchTimeshiftPlaylists, TIMESHIFT_MAX_MS, TIMESHIFT_RETENTION_MS, urlExpMs } from './aio-client';
import type { AioConfig } from './aio-client';
import { AioSourceService } from './aio-source.service';

@Injectable()
export class PlaybackService {
  private readonly logger = new Logger(PlaybackService.name);
  constructor(private config: ConfigService, private aioSources: AioSourceService) {}

  // Uu tien nguon VTCAIO active trong CMS; chua cau hinh thi dung env.
  private async cfg() {
    try {
      const active = await this.aioSources.getActiveConfig();
      if (active?.partnerKey) return active;
    } catch {
      /* fallback env */
    }
    return {
      baseUrl: this.config.get<string>('MEDIA_BASE_URL', 'https://luuchieu1.vtcplay.vn'),
      partnerKey: this.config.get<string>('VTC_PARTNER_KEY', ''),
    };
  }

  // Scan-only (phuong an A): lay link xoay tu catalog /api/public/channels,
  // KHONG POST /api/hls-tokens nua — endpoint do sinh token cho kenh goc
  // (1080i + audio MPEG1 Layer 2, danh cho nghiep vu keo goc/headend,
  // khong phai de phat web). Catalog da co san hlsMasterRotating
  // (master multibitrate, ABR) + hlsTranscodeRotating[] (tung rendition),
  // TTL 240 phut theo docs 25-VTC-ANY. FE xin lai cham nhat phut 210.
  async stream(channel: string, ttlMinutes?: number) {
    const cfg = await this.cfg();
    const ttl = clampTtlMinutes(ttlMinutes ?? Number(this.config.get('PLAYBACK_TTL_MINUTES', 240)));
    const url = await this.rotatingUrl(cfg, channel);
    if (!url) throw new Error(`aio: kenh ${channel} khong co link xoay trong catalog`);
    // eslint-disable-next-line no-console
    console.log(`[playback] scan-only channel=${channel} exp=${new Date(urlExpMs(url) ?? 0).toISOString()} ttl=${ttl}m`);
    return { hls_url: url, exp: urlExpMs(url) ?? Date.now() + ttl * 60_000, ttl_seconds: ttl * 60 };
  }

  // Tim link xoay ky san trong channel scan cho 1 kenh.
  // Uu tien master multibitrate (ABR) -> tung rendition co dinh -> link don.
  private async rotatingUrl(cfg: AioConfig, channel: string): Promise<string | null> {
    try {
      const { channels } = await getChannels(cfg);
      const found = (channels || []).find((c) => (c.name || '').toUpperCase() === channel.toUpperCase());
      if (!found) return null;
      if (found.hlsMasterRotating) return found.hlsMasterRotating;
      if (found.hlsMaster) return found.hlsMaster;
      const variants = found.hlsTranscodeRotating || found.hlsTranscode || [];
      const pick = variants.find((v) => v.preset === 'p720') || variants[0];
      if (pick?.hls) return pick.hls;
      return found.hlsRotating || found.hls || null;
    } catch {
      return null;
    }
  }

  async listChannels() {
    const { baseUrl, channels } = await getChannels(await this.cfg());
    return {
      baseUrl,
      channels: channels
        .filter((c) => c.live && c.status === 'RUNNING')
        .map((c) => ({
          name: c.name,
          epgId: c.epgId ?? null,
          epgNow: c.epgNow ?? null,
          audioOnly: isAudioOnly(c),
        })),
    };
  }

  // epgNow de app hien now/next khong can goi them. Null khi kenh chua map EPG.
  async channelNow(slug: string) {
    const { channels } = await getChannels(await this.cfg());
    const found = channels.find((c) => c.name.toUpperCase() === slug.toUpperCase());
    return found?.epgNow ?? null;
  }

  // Lich full theo ngay tu AIO (VD 82 chuong trinh/ngay). Tra null khi kenh chua cap EPG.
  async channelSchedule(slug: string, date: string) {
    const { channels } = await getChannels(await this.cfg());
    const found = channels.find((c) => c.name.toUpperCase() === slug.toUpperCase());
    const scheduleUrl = found?.epg?.schedule;
    if (!scheduleUrl) return null;
    return getEpgSchedule(await this.cfg(), scheduleUrl, date);
  }

  async channelAudioOnly(slug: string): Promise<boolean> {
    try {
      const { channels } = await getChannels(await this.cfg());
      const found = channels.find((c) => c.name.toUpperCase() === slug.toUpperCase());
      return found ? isAudioOnly(found) : false;
    } catch {
      return false;
    }
  }

  // Timeshift / xem lai: tra ve playlist m3u8 VOD cho khoang [startIso, endIso].
  // - Chia chunk <= 6h theo gioi han AIO, noi lai thanh 1 playlist.
  // - Gioi han retention 30 ngay; end vuot hien tai thi cat ve hien tai.
  // - src: 'after' cho kenh ghi sau-encode. Neu khong truyen src, tu nhan tu
  //   /api/timeshift/coverage (kinds co 'after' -> src='after'); DB override van uu tien.
  // - Kep khung gio theo oldestAvailable tu coverage de bao loi ro rang thay vi 404 oan.
  async timeshift(channel: string, startIso: string, endIso: string, src?: string | null): Promise<string> {
    const cfg = await this.cfg();
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new Error('khoang thoi gian khong hop le');
    }
    if (end - start > TIMESHIFT_RETENTION_MS) throw new Error('vuot qua thoi gian luu tru 30 ngay');
    const now = Date.now();
    const endClamped = Math.min(end, now);
    if (start >= endClamped) throw new Error('khong the xem lai thoi diem trong tuong lai');
    // Coverage: vung du lieu that tu AIO (cache 1h; loi -> null -> fallback logic cu).
    let effectiveSrc = src || undefined;
    const covEntry = findCoverageEntry(await getTimeshiftCoverage(cfg), channel);
    if (covEntry) {
      if (!effectiveSrc && covEntry.kinds.includes('after')) effectiveSrc = 'after';
      const oldest = new Date(covEntry.oldestAvailable).getTime();
      if (Number.isFinite(oldest) && start < oldest) {
        throw Object.assign(
          new Error(`khung gio nam ngoai vung du lieu xem lai (kenh ${channel} hien chi co du lieu tu ${covEntry.oldestAvailable})`),
          { status: 400 },
        );
      }
    }
    const chunks: Array<{ playlist: string; baseUrl: string }> = [];
    for (let s = start; s < endClamped; s += TIMESHIFT_MAX_MS) {
      const e = Math.min(s + TIMESHIFT_MAX_MS, endClamped);
      const pl = await getTimeshiftPlaylist(
        cfg, channel, new Date(s).toISOString(), new Date(e).toISOString(), effectiveSrc,
      );
      chunks.push({ playlist: pl, baseUrl: cfg.baseUrl });
    }
    if (!chunks.length) throw new Error('aio: empty timeshift response');
    return stitchTimeshiftPlaylists(chunks);
  }

  // Coverage timeshift (phuc vu EPG/quyet dinh hien nut Xem lai). Null khi AIO loi.
  async timeshiftCoverage() {
    return getTimeshiftCoverage(await this.cfg());
  }
}
