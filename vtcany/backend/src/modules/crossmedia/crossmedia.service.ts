// Goi 1C: Chuyen doi cheo — dieu phoi tao ban nhap Bao dien tu tu nguon
// da duyet (video/short catalog da xuat ban, so bao in da xuat ban).
// Chi doc nguon (khong doi trang thai, khong doi quy trinh goc) roi tao
// nhap qua NewsService.create — nhap luon o 'draft', di quy trinh tin bai
// binh thuong tu dau. Fail-closed: nguon khong ton tai -> 404, nguon chua
// duyet/xuat ban -> 400, khong tao nhap trong ca hai truong hop.
// Quyen: controller gate 'articles:create' (tao nhap la tao bai viet) —
// khong them quyen moi, khong doi ma tran quyen hien co.
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NewsService, type Actor } from '../news/news.service';
import { CatalogService } from '../catalog/catalog.service';
import { EpaperService } from '../epaper/epaper.service';
import { mapEpaperToDraft, mapTvToDraft, normalizeAuthors } from './crossmedia-map';

// Goi 1C dot 2: tuy chon luc chuyen doi, do CMS gui kem (dialog xac nhan).
// authors: mang chuoi (sai dang -> 400, khong truyen/rong -> [] nhu cu);
// categoryId: id hoac publicId chuyen muc (sai -> 400 qua checkCategory
// cua NewsService.create, khong truyen/null -> null nhu cu).
export interface ConvertOptions {
  authors?: unknown;
  categoryId?: string | null;
}

@Injectable()
export class CrossmediaService {
  constructor(
    private readonly news: NewsService,
    private readonly catalog: CatalogService,
    private readonly epaper: EpaperService,
  ) {}

  // Chan chuyen doi trung: cung type + id trong sourceRef ma da co bai
  // thi tra 409 kem slug/publicId bai cu de CMS dan toi (khong tao nhap
  // moi). Thu tu: map fail-closed truoc (nguon chua xuat ban -> 400),
  // roi moi kiem tra trung, roi moi tao.
  private async assertNotConverted(type: string, id: string) {
    const dup = await this.news.findBySourceRef(type, id);
    if (dup) {
      throw new ConflictException({
        message: 'da co ban nhap tu nguon nay',
        slug: dup.slug,
        publicId: dup.publicId,
      });
    }
  }

  async fromTv(entity: string, id: string, actor: Actor, opts: ConvertOptions = {}) {
    if (entity !== 'videos' && entity !== 'shorts') throw new BadRequestException('loai nguon truyen hinh khong hop le');
    if (!id || typeof id !== 'string') throw new BadRequestException('thieu id nguon');
    let item: any;
    try {
      item = await this.catalog.get(entity, id);
    } catch (e: any) {
      // Chi 'not found' cua catalog -> 404; loi khac (vd DB) de nguyen
      // de khong che dau thanh 404.
      if (e?.message === 'not found') throw new NotFoundException('khong tim thay nguon truyen hinh');
      throw e;
    }
    let draft;
    let authors: string[];
    try {
      draft = mapTvToDraft(
        { id: item.id ?? id, title: item.title, description: item.description, thumbnail: item.thumbnail, poster: item.poster, isVisible: item.isVisible, videoFileId: item.videoFileId },
        entity === 'shorts' ? 'tv-short' : 'tv-video',
      );
      authors = normalizeAuthors(opts.authors);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'nguon khong hop le');
    }
    await this.assertNotConverted(draft.sourceRef.type, draft.sourceRef.id);
    return this.news.create({ ...draft, authors, categoryId: opts.categoryId ?? null, sourceRef: draft.sourceRef }, actor);
  }

  async fromEpaper(publicId: string, actor: Actor, opts: ConvertOptions = {}) {
    if (!publicId || typeof publicId !== 'string') throw new BadRequestException('thieu publicId so bao');
    // EpaperService.get da throw NotFoundException khi khong thay so;
    // loi khac de nguyen (khong che thanh 404).
    const issue: any = await this.epaper.get(publicId);
    let draft;
    let authors: string[];
    try {
      draft = mapEpaperToDraft(issue);
      authors = normalizeAuthors(opts.authors);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'so bao khong hop le');
    }
    await this.assertNotConverted(draft.sourceRef.type, draft.sourceRef.id);
    return this.news.create({ ...draft, authors, categoryId: opts.categoryId ?? null, sourceRef: draft.sourceRef }, actor);
  }
}
