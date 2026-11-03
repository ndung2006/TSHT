import { Injectable } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { UploadsService } from '../uploads/uploads.service';

export type VodKind = 'episode' | 'video' | 'short' | 'trailer';

// Giai quyet phat VOD tu host cho noi dung catalog (tap phim / video / short).
// Dieu kien phat cong khai: noi dung ton tai, da xuat ban (isVisible !== false),
// da gan videoFileId (uploadId) va ban HLS da transcode xong tren storage.
@Injectable()
export class VodService {
  constructor(
    private catalog: CatalogService,
    private uploads: UploadsService,
  ) {}

  // Play cong khai truyen public_id 24-hex (portal dung publicId), con
  // catalog.get chi tim theo id noi bo -> 'not found' roi bi map thanh
  // not_published (hieu lam la 'chua xuat ban'). Fallback qua getPublic
  // (giai public_id + loc isVisible) de play cong khai tim thay ban ghi.
  // Admin play truyen id noi bo nen get() trung ngay, khong doi hanh vi.
  private async resolveVideo(entity: 'videos' | 'shorts', id: string): Promise<any> {
    try {
      return await this.catalog.get(entity, id);
    } catch (e: any) {
      if (e?.message !== 'not found') throw e;
      return await this.catalog.getPublic(entity, id);
    }
  }

  async resolvePlay(kind: VodKind, id: string, opts: { admin?: boolean } = {}): Promise<{ kind: VodKind; id: string; title?: string; hls_path: string }> {
    let item: any;
    if (kind === 'episode') item = await this.catalog.getEpisode(id);
    else if (kind === 'trailer') item = await this.catalog.getTrailer(id);
    else if (kind === 'video') item = await this.resolveVideo('videos', id);
    else item = await this.resolveVideo('shorts', id);
    // Chua xuat ban -> doi xu nhu khong ton tai (khong lo noi dung nhap).
    // admin=true: xem truoc trong CMS thi bo qua kiem tra xuat ban.
    if (!opts.admin && item.isVisible === false) throw new Error('not published');
    const uploadId = item.videoFileId || item.uploadId || '';
    if (!uploadId) throw new Error('vod not ready');
    const play = this.uploads.playByUploadId(uploadId); // throw 'vod not ready' neu chua co HLS
    return { kind, id, title: item.title || item.name, hls_path: play.hls_path };
  }
}
