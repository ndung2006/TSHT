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

  async resolvePlay(kind: VodKind, id: string, opts: { admin?: boolean } = {}): Promise<{ kind: VodKind; id: string; title?: string; hls_path: string }> {
    let item: any;
    if (kind === 'episode') item = await this.catalog.getEpisode(id);
    else if (kind === 'trailer') item = await this.catalog.getTrailer(id);
    else if (kind === 'video') item = await this.catalog.get('videos', id);
    else item = await this.catalog.get('shorts', id);
    // Chua xuat ban -> doi xu nhu khong ton tai (khong lo noi dung nhap).
    // admin=true: xem truoc trong CMS thi bo qua kiem tra xuat ban.
    if (!opts.admin && item.isVisible === false) throw new Error('not published');
    const uploadId = item.videoFileId || item.uploadId || '';
    if (!uploadId) throw new Error('vod not ready');
    const play = this.uploads.playByUploadId(uploadId); // throw 'vod not ready' neu chua co HLS
    return { kind, id, title: item.title || item.name, hls_path: play.hls_path };
  }
}
