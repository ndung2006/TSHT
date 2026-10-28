import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from './uploads.service';
import {
  MediaItem, mapDbRow, mapMemoryImage, mapMemoryVideo, mergeAndPage, normalizeMediaQuery,
} from './media-library-map';

// Thu vien media thong nhat (Dot 1a): liet ke anh/video/audio tu bang
// media_assets + danh sach in-memory cua UploadsService (anh/video vua
// upload). Tai su dung model MediaAsset san co, khong tao bang moi.
// KHONG tang gioi han JSON 256kb: endpoint chi la GET list, khong nhan body.
@Injectable()
export class MediaLibraryService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly uploads: UploadsService,
  ) {}

  private publicBase(): string {
    return (this.config.get<string>('VOD_PUBLIC_BASE_URL', '') || '').replace(/\/$/, '');
  }

  async list(query: { kind?: string; q?: string; page?: unknown; limit?: unknown }) {
    let q;
    try {
      q = normalizeMediaQuery(query);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'truy van thu vien khong hop le');
    }
    const base = this.publicBase();
    const where: any = { fileType: q.kind ? q.kind : { in: ['image', 'video', 'audio'] } };
    if (q.q) where.filename = { contains: q.q, mode: 'insensitive' };
    const dbRows = await this.prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' } });
    const dbItems: MediaItem[] = [];
    for (const row of dbRows) {
      const poster = row.fileType === 'video' ? this.uploads.posterUrlFor(row.id) : '';
      const item = mapDbRow(row, base, poster);
      if (item) dbItems.push(item);
    }
    // In-memory: anh vua tai (listImages) + video dang transcode (listUploads).
    // Loc theo q o tang merge (DB da loc san, merge loc lai cho dong nhat).
    const memoryItems: MediaItem[] = [
      ...this.uploads.listImages().map(mapMemoryImage),
      ...this.uploads.listUploads().map(mapMemoryVideo),
    ];
    return mergeAndPage(dbItems, memoryItems, q);
  }
}
