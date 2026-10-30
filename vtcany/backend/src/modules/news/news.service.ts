import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { resolveCoverAndDedupe } from './cover-dedupe';
import {
  NEWS_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, checkSeparationOfDuties, stepLabel, transition,
} from './news-workflow';
import { normalizeContentType } from './news-content';
import { normalizeFormatData } from './news-format-data';

/** Slug tieng Viet: bo dau, 'd' -> 'd', ky tu la -> '-'. */
export function slugify(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export interface Actor {
  id: string | null;
  username: string | null;
  roleName: string | null;
}

/** Ngay dang YYYY-MM-DD (o input date cua CMS); sai dinh dang -> null. */
export function parseDateOnly(v?: string | null): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export interface ArticleInput {
  title: string;
  slug?: string;
  sapo?: string;
  body?: string;
  categoryId?: string | null;
  coverPath?: string | null;
  authors?: string[];
  tags?: string[];
  publishAt?: string | null;
  isFeatured?: boolean;
  // Dot 1a: dinh dang + co hien thi + nhan tin dia phuong (xem news-content.ts).
  contentType?: string;
  // Goi 1B: media dinh dang { videoUrl?, audioUrl?, imageUrl?, images? }
  // (xem news-format-data.ts). Khong co -> null, hien thi roi ve body.
  formatData?: unknown;
  isSpotlight?: boolean;
  isPhoto?: boolean;
  isInfographic?: boolean;
  allowComments?: boolean;
  localNews?: string | null;
  // Goi 1C: nguon goc ban nhap chuyen doi cheo { type, id, title, ... }
  // (xem crossmedia-map.ts). Chi admin thay, khong hien cong khai.
  sourceRef?: unknown;
}

@Injectable()
export class NewsService {
  constructor(private readonly prisma: PrismaService) {}

  private newPublicId(): string {
    return randomBytes(12).toString('hex');
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = slugify(base) || 'tin-bai';
    let n = 2;
    while (true) {
      const row = await this.prisma.newsArticle.findUnique({ where: { slug } });
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(base) || 'tin-bai'}-${n++}`;
    }
  }

  private async uniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
    let slug = slugify(base) || 'chuyen-muc';
    let n = 2;
    while (true) {
      const row = await this.prisma.newsCategory.findUnique({ where: { slug } });
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(base) || 'chuyen-muc'}-${n++}`;
    }
  }

  private toItem(row: any) {
    return {
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      slug: row.slug,
      sapo: row.sapo,
      body: row.body,
      categoryId: row.categoryId,
      category: row.category ? { publicId: row.category.publicId, name: row.category.name, slug: row.category.slug } : null,
      coverPath: row.coverPath,
      authors: row.authors || [],
      tags: row.tags || [],
      status: row.status,
      // Quy trinh duyet (xem news-workflow.ts). lastApproval do listAdmin gan them.
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: NEWS_WORKFLOW_STEPS.length,
      lastApproval: (row as any).lastApproval || null,
      publishAt: row.publishAt ? row.publishAt.toISOString() : null,
      isFeatured: row.isFeatured,
      contentType: row.contentType ?? 'text',
      formatData: row.formatData ?? null,
      // Goi 1C: nguon goc chuyen doi cheo (chi admin thay, khong hien cong khai).
      sourceRef: row.sourceRef ?? null,
      isSpotlight: row.isSpotlight ?? false,
      isPhoto: row.isPhoto ?? false,
      isInfographic: row.isInfographic ?? false,
      allowComments: row.allowComments ?? true,
      localNews: row.localNews ?? null,
      updatedBy: row.updatedBy,
      updatedByRole: row.updatedByRole,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private toApproval(row: any, names?: Map<string, string>) {
    return {
      id: row.id, step: row.step, stepLabel: row.stepLabel,
      actorId: row.actorId, actorRole: row.actorRole,
      actorName: (row.actorId && names?.get(row.actorId)) || null,
      action: row.action, actionLabel: WORKFLOW_ACTION_LABELS[row.action] || row.action,
      comment: row.comment,
      isException: row.isException ?? false, exceptionReason: row.exceptionReason ?? null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
  }

  /** Giai quyet ten nguoi xu ly tu actorId (AdminUser) de hien thi lich su
   *  luan chuyen day du "ai — buoc nao — hanh dong gi — luc nao". */
  private async resolveActorNames(actorIds: (string | null)[]) {
    const ids = [...new Set(actorIds.filter((x): x is string => !!x))];
    const map = new Map<string, string>();
    if (!ids.length) return map;
    const users = await this.prisma.adminUser.findMany({
      where: { id: { in: ids } }, select: { id: true, fullName: true, username: true, email: true },
    });
    for (const u of users) map.set(u.id, u.fullName || u.username || u.email || u.id);
    return map;
  }

  /** Gan lastApproval (dong duyet moi nhat) vao cac row cua 1 trang list. */
  private async attachLastApprovals(rows: any[]) {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const all = await this.prisma.newsArticleApproval.findMany({
      where: { articleId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstByArticle = new Map<string, any>();
    for (const a of all) if (!firstByArticle.has(a.articleId)) firstByArticle.set(a.articleId, a);
    // Giai ten nguoi duyet (dung chung helper voi lich su duyet day du) de
    // cot "Sua doi gan nhat" gop hien duoc "nguoi — vai tro — thoi gian".
    const names = await this.resolveActorNames(all.map((a: any) => a.actorId));
    return rows.map((r) => ({ ...r, lastApproval: firstByArticle.has(r.id) ? this.toApproval(firstByArticle.get(r.id), names) : null }));
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(articleId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.newsArticleApproval.create({
      data: { articleId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null },
    });
  }

  private async workflowRow(publicId: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay bai viet');
    return row;
  }

  /** Ban cong khai: khong lo createdBy/updatedBy, khong lo bai chua xuat ban. */
  private toPublicItem(row: any) {
    return {
      publicId: row.publicId,
      title: row.title,
      slug: row.slug,
      sapo: row.sapo,
      body: row.body,
      category: row.category ? { publicId: row.category.publicId, name: row.category.name, slug: row.category.slug } : null,
      coverPath: row.coverPath,
      authors: row.authors || [],
      tags: row.tags || [],
      publishAt: row.publishAt ? row.publishAt.toISOString() : null,
      isFeatured: row.isFeatured,
      contentType: row.contentType ?? 'text',
      // Goi 1B: formatData chi chua URL media (da loc key la luc ghi),
      // khong lo truong noi bo; bai cu -> null.
      formatData: row.formatData ?? null,
      isSpotlight: row.isSpotlight ?? false,
      isPhoto: row.isPhoto ?? false,
      isInfographic: row.isInfographic ?? false,
      allowComments: row.allowComments ?? true,
      localNews: row.localNews ?? null,
    };
  }

  private validateInput(input: ArticleInput) {
    if (!input.title || !input.title.trim()) throw new BadRequestException('tieu de bat buoc');
    if (input.sapo !== undefined && input.sapo.length > 500) {
      throw new BadRequestException('sapo toi da 500 ky tu');
    }
    // content_type la -> 400 (khong am tham ep ve 'text' khi client gui sai).
    try {
      normalizeContentType(input.contentType);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'content_type khong hop le');
    }
    // Goi 1B: format_data sai dang -> 400 (chi kiem tra dang, khong bat
    // buoc bai phai co media — nhap chua co media van luu duoc).
    if (input.formatData !== undefined) {
      try {
        normalizeFormatData(input.formatData);
      } catch (e: any) {
        throw new BadRequestException(e?.message || 'format_data khong hop le');
      }
    }
  }

  private async checkCategory(categoryId: string | null | undefined) {
    if (categoryId === undefined || categoryId === null) return null;
    const cat = await this.prisma.newsCategory.findFirst({
      where: { OR: [{ id: categoryId }, { publicId: categoryId }] },
    });
    if (!cat) throw new BadRequestException('chuyen muc khong ton tai');
    return cat.id;
  }

  // ---------------- Anh bia luc luu: bia mac dinh + chuan hoa URL (xem cover-dedupe.ts) ----------------

  /**
   * Tai bytes cua 1 anh de so byte voi bia. Nguon ho tro: data: (giai
   * base64), file local /images/... (doc truc tiep tu storage, khong qua
   * HTTP), URL http(s) (timeout 8s, toi da 25MB). Moi loi -> null de
   * dedupe fail-open (luu bai khong bao gio hong vi buoc nay).
   */
  private async fetchMediaBytes(url: string): Promise<Buffer | null> {
    const MAX_BYTES = 25 * 1024 * 1024;
    try {
      if (url.startsWith('data:')) {
        const m = /^data:[^;]+;base64,(.+)$/.exec(url);
        if (!m) return null;
        const buf = Buffer.from(m[1], 'base64');
        return buf.length <= MAX_BYTES ? buf : null;
      }
      const local = this.resolveLocalImage(url);
      if (local) {
        const buf = await readFile(local);
        return buf.length <= MAX_BYTES ? buf : null;
      }
      if (!/^https?:\/\//.test(url)) return null;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        // UA trinh duyet: mot so bao chan UA la (anh goc tra 403) thi
        // dedupe fail-open va body giu nguyen anh cu.
        headers: {
          'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          accept: 'image/*,*/*',
        },
      });
      if (!res.ok) return null;
      const len = Number(res.headers.get('content-length') || 0);
      if (len > MAX_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.length <= MAX_BYTES ? buf : null;
    } catch {
      return null;
    }
  }

  /** Duong dan file local cua anh /images/<file> (tuong doi hoac URL tuyet
   *  doi tro ve backend), hoac null. Chan duong dan thoat kho images. */
  private resolveLocalImage(url: string): string | null {
    let pathname: string | null = null;
    if (url.startsWith('/images/')) pathname = url;
    else {
      try {
        const u = new URL(url);
        if (u.pathname.startsWith('/images/')) pathname = u.pathname;
      } catch {
        return null;
      }
    }
    const name = decodeURIComponent(pathname.slice('/images/'.length));
    if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) return null;
    // Cung quy tac storageRoot nhu main.ts: STORAGE_DIR, neu khong thi
    // <backend>/storage (dung ca khi chay tu src lan dist).
    const roots = [
      process.env.STORAGE_DIR || '',
      join(process.cwd(), 'storage'),
      join(__dirname, '..', '..', '..', 'storage'),
    ].filter((r) => !!r);
    for (const root of roots) {
      const p = join(root, 'images', name);
      if (existsSync(p)) return p;
    }
    return null;
  }

  /** Chay dedupe + bia mac dinh; loi -> tra nguyen body/bia (fail-open). */
  private async applyCoverDedupe(body: string, coverPath: string | null) {
    try {
      const out = await resolveCoverAndDedupe(body || '', coverPath, (u) => this.fetchMediaBytes(u));
      return { body: out.body, coverPath: out.coverPath };
    } catch {
      return { body, coverPath };
    }
  }

  // ---------------- Admin: bai viet ----------------

  async listAdmin(params: { q?: string; status?: string; categoryId?: string; author?: string; contentType?: string; dateFrom?: string; dateTo?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where = await this.buildListWhere(params);
    const [total, rows] = await Promise.all([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findMany({
        where,
        include: { category: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const withApprovals = await this.attachLastApprovals(rows);
    return { data: withApprovals.map((r) => this.toItem(r)), total, page, limit };
  }

  /**
   * Dieu kien loc dung chung cho list + counts de hai cho khong bao gio
   * lech nhau. listAdmin hien khong loc theo role/phong ban — counts cung
   * khong, co tinh (neu sau nay them scoping thi them o day, ca hai cung
   * huong). Ngay loc tren createdAt (luon co, ke ca bai nhap chua co
   * publishAt); ngay sai dinh dang thi bo qua (giong cach loc lenh lac
   * hien co: status la cung tra 0 dong chu khong 400).
   */
  private async buildListWhere(params: { q?: string; status?: string; categoryId?: string; author?: string; contentType?: string; dateFrom?: string; dateTo?: string }) {
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.categoryId) {
      const cat = await this.prisma.newsCategory.findFirst({
        where: { OR: [{ id: params.categoryId }, { publicId: params.categoryId }] },
      });
      if (cat) where.categoryId = cat.id;
      else where.categoryId = '__none__';
    }
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { sapo: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    // Tac gia: gia tri lay tu dropdown cac tac gia da co nen khop chinh xac
    // 1 phan tu cua mang authors (Prisma `has`).
    if (params.author) where.authors = { has: params.author };
    if (params.contentType) where.contentType = params.contentType;
    const from = parseDateOnly(params.dateFrom);
    const to = parseDateOnly(params.dateTo);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59.999`);
    }
    return where;
  }

  /** So dem theo trang thai duoi cung bo loc (tru status) voi listAdmin. */
  async countsAdmin(params: { q?: string; categoryId?: string; author?: string; contentType?: string; dateFrom?: string; dateTo?: string }) {
    const where = await this.buildListWhere(params);
    const [total, groups] = await Promise.all([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.groupBy({ by: ['status'], where, _count: { _all: true } }),
    ]);
    const out: any = { total, draft: 0, pending_review: 0, published: 0, unpublished: 0 };
    for (const g of groups) if (g.status in out) out[g.status] = g._count._all;
    return out;
  }

  /**
   * Danh sach tac gia distinct cho dropdown loc. Query raw duy nhat trong
   * codebase (chi doc, khong co tham so nguoi dung): Prisma khong unnest
   * duoc mang authors, nen dung SQL truc tiep tren bang "news_articles".
   */
  async authorsAdmin() {
    const rows: { name: string }[] = await this.prisma.$queryRaw<{ name: string }[]>`
      SELECT DISTINCT a AS name FROM "news_articles", unnest(authors) AS a
      WHERE a IS NOT NULL AND btrim(a) <> '' ORDER BY name`;
    return rows.map((r) => r.name);
  }

  async getAdmin(publicId: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { publicId }, include: { category: true } });
    if (!row) throw new NotFoundException('khong tim thay bai viet');
    return this.toItem(row);
  }

  // Goi 1C dot 2: tim bai da chuyen doi tu cung nguon — khop chinh xac
  // type + id trong sourceRef (JSONB), khong khop tieu de. Bai da xoa thi
  // khong con row nen moi row tim thay deu tinh la trung.
  async findBySourceRef(type: string, id: string) {
    return this.prisma.newsArticle.findFirst({
      where: {
        AND: [
          { sourceRef: { path: ['type'], equals: type } },
          { sourceRef: { path: ['id'], equals: id } },
        ],
      },
      select: { publicId: true, slug: true, title: true },
    });
  }

  async create(input: ArticleInput, actor: Actor) {
    this.validateInput(input);
    const categoryId = await this.checkCategory(input.categoryId);
    const slug = await this.uniqueSlug(input.slug?.trim() ? input.slug : input.title);
    // Bia mac dinh + chuan hoa URL anh trung byte ve URL bia ngay luc tao.
    const deduped = await this.applyCoverDedupe(input.body || '', input.coverPath || null);
    const row = await this.prisma.newsArticle.create({
      data: {
        publicId: this.newPublicId(),
        title: input.title.trim(),
        slug,
        sapo: input.sapo || '',
        body: deduped.body,
        categoryId,
        coverPath: deduped.coverPath,
        authors: input.authors || [],
        tags: input.tags || [],
        status: 'draft',
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        isFeatured: !!input.isFeatured,
        contentType: normalizeContentType(input.contentType),
        formatData: normalizeFormatData(input.formatData) ?? undefined,
        // Goi 1C: luu nguon goc chuyen doi cheo (neu co).
        sourceRef: (input.sourceRef as any) ?? undefined,
        isSpotlight: !!input.isSpotlight,
        isPhoto: !!input.isPhoto,
        isInfographic: !!input.isInfographic,
        allowComments: input.allowComments !== false,
        localNews: input.localNews?.trim() ? input.localNews.trim() : null,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
      include: { category: true },
    });
    return this.toItem(row);
  }

  async patch(publicId: string, input: Partial<ArticleInput>, actor: Actor) {
    const row = await this.prisma.newsArticle.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay bai viet');
    this.validateInput({ title: input.title ?? row.title, sapo: input.sapo ?? row.sapo, contentType: input.contentType, formatData: input.formatData });
    const data: any = { updatedBy: actor.username, updatedByRole: actor.roleName };
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.slug !== undefined || input.title !== undefined) {
      data.slug = await this.uniqueSlug(
        input.slug?.trim() ? input.slug : input.title ?? row.title,
        row.id,
      );
      // Goi 1D: doi slug cua bai tung xuat ban -> ghi lich su de chuyen 301.
      // Chi ghi khi bai tung cong khai (published/unpublished); bai nhap/
      // cho duyet doi slug khong ghi vi slug cu chua tung xuat hien cong khai.
      // Upsert: slug cu duoc tai su dung boi bai khac roi doi tiep thi ban ghi
      // moi nhat thang (slug song luon duoc getPublic uu tien truoc redirect).
      if (data.slug !== row.slug && (row.status === 'published' || row.status === 'unpublished')) {
        await this.prisma.newsSlugRedirect.upsert({
          where: { oldSlug: row.slug },
          update: { articleId: row.id },
          create: { oldSlug: row.slug, articleId: row.id },
        });
      }
    }
    if (input.sapo !== undefined) data.sapo = input.sapo;
    if (input.body !== undefined) data.body = input.body;
    if (input.categoryId !== undefined) data.categoryId = await this.checkCategory(input.categoryId);
    if (input.coverPath !== undefined) data.coverPath = input.coverPath || null;
    if (input.authors !== undefined) data.authors = input.authors;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.publishAt !== undefined) data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
    if (input.isFeatured !== undefined) data.isFeatured = !!input.isFeatured;
    if (input.contentType !== undefined) data.contentType = normalizeContentType(input.contentType);
    if (input.formatData !== undefined) data.formatData = normalizeFormatData(input.formatData);
    if (input.isSpotlight !== undefined) data.isSpotlight = !!input.isSpotlight;
    if (input.isPhoto !== undefined) data.isPhoto = !!input.isPhoto;
    if (input.isInfographic !== undefined) data.isInfographic = !!input.isInfographic;
    if (input.allowComments !== undefined) data.allowComments = !!input.allowComments;
    if (input.localNews !== undefined) data.localNews = input.localNews?.trim() ? input.localNews.trim() : null;
    // Bia mac dinh + chuan hoa URL anh trung byte ve URL bia ngay luc luu.
    // Chay ca khi chi doi bia (bia moi co the trung anh cu trong body) va
    // ca khi bai cu chua co bia (luu lai se tu co bia mac dinh tu anh dau
    // body). Chi ghi de khi dedupe that su doi body/bia, khong cham cac
    // truong khac. Khong xoa anh khoi body — vi tri anh trong body duoc
    // uu tien, client se tu an hero khi bia da co trong body.
    const effCover = input.coverPath !== undefined ? (input.coverPath || null) : row.coverPath;
    const effBody = input.body !== undefined ? input.body : (row.body || '');
    if (effBody && (effCover || effBody)) {
      const deduped = await this.applyCoverDedupe(effBody, effCover);
      if (deduped.body !== effBody) data.body = deduped.body;
      if ((deduped.coverPath || null) !== (effCover || null)) data.coverPath = deduped.coverPath;
    }
    const out = await this.prisma.newsArticle.update({
      where: { id: row.id },
      data,
      include: { category: true },
    });
    return this.toItem(out);
  }

  /** Xoa chi bai nhap hoac da ha xuat ban (bai dang xuat ban phai go xuong truoc, bai dang cho duyet phai tra lai hoac duyet xong). */
  async remove(publicId: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay bai viet');
    if (row.status === 'published') {
      throw new ConflictException('bai dang xuat ban, hay go xuong truoc khi xoa');
    }
    if (row.status === 'pending_review') {
      throw new ConflictException('bai dang cho duyet, hay tra lai hoac duyet xong truoc khi xoa');
    }
    await this.prisma.newsArticle.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- Quy trinh duyet (xem news-workflow.ts) ----------------

  async submitForReview(publicId: string, actor: Actor) {
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.newsArticle.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actor.id, actor.roleName, 'submit', null);
    return this.toItem(updated);
  }

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string }) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${NEWS_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu (Dot 1b): nguoi xu ly buoc truoc khong duoc duyet buoc
    // sau cua cung mot bai. Ap dung cho ca toan quyen — truong hop ngoai le
    // tin nong phai di qua co breakingNews va duoc ghi log ro rang.
    const prev = await this.prisma.newsArticleApproval.findFirst({
      where: { articleId: row.id }, orderBy: { createdAt: 'desc' },
    });
    const sod = checkSeparationOfDuties(prev?.actorId || null, actor.id, !!opts?.breakingNews);
    if (!sod.allowed) {
      throw new ForbiddenException('tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua cung mot bai; dung ngoai le tin nong neu can');
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'published';
    const updated = await this.prisma.newsArticle.update({
      where: { id: row.id },
      data: { status: next.status, workflowStep: next.step, publishAt: wasFinal ? (row.publishAt || new Date()) : row.publishAt },
    });
    await this.writeApproval(row.id, step, actor.id, actor.roleName, 'approve', null,
      sod.isException ? { isException: true, exceptionReason: (opts?.breakingNewsReason || '').trim() || null } : undefined);
    if (wasFinal) {
      await this.writeApproval(row.id, 0, actor.id, actor.roleName, 'publish', null);
    }
    return this.toItem(updated);
  }

  async returnArticle(publicId: string, actor: Actor, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'return');
    const updated = await this.prisma.newsArticle.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, row.workflowStep ?? 0, actor.id, actor.roleName, 'return', String(reason).trim());
    return this.toItem(updated);
  }

  async listApprovals(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.newsArticleApproval.findMany({
      where: { articleId: row.id }, orderBy: { createdAt: 'asc' },
    });
    const names = await this.resolveActorNames(rows.map((r) => r.actorId));
    return { data: rows.map((r) => this.toApproval(r, names)) };
  }

  /**
   * Xuat ban / go xuong, co gate quy trinh (giong epaper):
   * - Bai dang cho duyet: chi nguoi duyet buoc cuoi hoac toan quyen moi
   *   xuat ban tat; tai khoan thuong phai duyet het cac buoc.
   * - Bai nhap: phai gui duyet truoc; xuat ban truc tiep chi toan quyen.
   * - Bai da ha xuat ban: xuat ban lai truc tiep duoc (da tung qua xuat ban).
   * publishAt tuong lai = cho xuat ban (public API tu an den gio hen).
   */
  async setPublished(publicId: string, publish: boolean, publishAt: string | null | undefined, actor: Actor, isFullAdmin = false) {
    const row = await this.prisma.newsArticle.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay bai viet');
    if (publish && row.status === 'published') return this.toItem(row);
    if (!publish && row.status !== 'published') return this.toItem(row);
    if (publish && row.status === 'pending_review') {
      if (!isFullAdmin && (row.workflowStep ?? 0) !== NEWS_WORKFLOW_STEPS.length) {
        throw new ConflictException(`bai dang cho duyet buoc ${row.workflowStep}/${NEWS_WORKFLOW_STEPS.length}, phai duyet xong moi xuat ban duoc`);
      }
      if (!isFullAdmin && !canApproveStep(actor.roleName, false, row.workflowStep ?? 0)) {
        throw new ForbiddenException('chi vai duyet buoc cuoi hoac toan quyen moi xuat ban bai dang cho duyet');
      }
    }
    if (publish && row.status === 'draft' && !isFullAdmin) {
      throw new ConflictException('bai nhap phai gui duyet truoc, chi toan quyen moi xuat ban truc tiep duoc');
    }
    const out = await this.prisma.newsArticle.update({
      where: { id: row.id },
      data: publish
        ? { status: 'published', workflowStep: 0, publishAt: publishAt ? new Date(publishAt) : row.publishAt || new Date(), updatedBy: actor.username, updatedByRole: actor.roleName }
        : { status: 'unpublished', workflowStep: 0, updatedBy: actor.username, updatedByRole: actor.roleName },
      include: { category: true },
    });
    await this.writeApproval(row.id, 0, actor.id, actor.roleName, publish ? 'publish' : 'unpublish', null);
    return this.toItem(out);
  }

  // ---------------- Admin: chuyen muc ----------------

  async listCategoriesAdmin() {
    const rows = await this.prisma.newsCategory.findMany({ orderBy: [{ parentId: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => ({
      id: r.id, publicId: r.publicId, name: r.name, slug: r.slug,
      parentId: r.parentId, sortOrder: r.sortOrder, isVisible: r.isVisible,
    }));
  }

  async createCategory(input: { name: string; slug?: string; parentId?: string | null; sortOrder?: number; isVisible?: boolean }) {
    if (!input.name || !input.name.trim()) throw new BadRequestException('ten chuyen muc bat buoc');
    let parentDbId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.newsCategory.findFirst({
        where: { OR: [{ id: input.parentId }, { publicId: input.parentId }] },
      });
      if (!parent) throw new BadRequestException('chuyen muc cha khong ton tai');
      parentDbId = parent.id;
    }
    const slug = await this.uniqueCategorySlug(input.slug?.trim() ? input.slug : input.name);
    const row = await this.prisma.newsCategory.create({
      data: {
        publicId: this.newPublicId(),
        name: input.name.trim(),
        slug,
        parentId: parentDbId,
        sortOrder: input.sortOrder ?? 0,
        isVisible: input.isVisible !== false,
      },
    });
    return { publicId: row.publicId, name: row.name, slug: row.slug, parentId: row.parentId, sortOrder: row.sortOrder, isVisible: row.isVisible };
  }

  async patchCategory(publicId: string, input: { name?: string; slug?: string; parentId?: string | null; sortOrder?: number; isVisible?: boolean }) {
    const row = await this.prisma.newsCategory.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay chuyen muc');
    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined || input.name !== undefined) {
      data.slug = await this.uniqueCategorySlug(input.slug?.trim() ? input.slug : input.name ?? row.name, row.id);
    }
    if (input.parentId !== undefined) {
      if (input.parentId === null) data.parentId = null;
      else {
        const parent = await this.prisma.newsCategory.findFirst({
          where: { OR: [{ id: input.parentId }, { publicId: input.parentId }] },
        });
        if (!parent) throw new BadRequestException('chuyen muc cha khong ton tai');
        if (parent.id === row.id) throw new BadRequestException('chuyen muc khong the la cha cua chinh no');
        data.parentId = parent.id;
      }
    }
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.isVisible !== undefined) data.isVisible = !!input.isVisible;
    const out = await this.prisma.newsCategory.update({ where: { id: row.id }, data });
    // Goi 1D-2: doi slug that cua chuyen muc -> ghi lich su de chuyen 301.
    // Ghi SAU khi update thanh cong (khat 1D ghi trong luc xay data):
    // neu update loi (vd cha khong ton tai) thi khong ghi lich su ao.
    // Khac bai viet: chuyen muc khong co trang thai xuat ban/nhap nen
    // ghi moi lan doi slug; muc an doi slug cung ghi vi route TSHT tra
    // HTML cho moi slug (muc an van render nhu truoc). Upsert: slug cu
    // duoc muc khac tai su dung roi doi tiep thi ban ghi moi nhat thang
    // (slug song luon duoc cay hien uu tien truoc redirect).
    if (out.slug !== row.slug) {
      await this.prisma.categorySlugRedirect.upsert({
        where: { oldSlug: row.slug },
        update: { categoryId: row.id },
        create: { oldSlug: row.slug, categoryId: row.id },
      });
    }
    return { publicId: out.publicId, name: out.name, slug: out.slug, parentId: out.parentId, sortOrder: out.sortOrder, isVisible: out.isVisible };
  }

  async removeCategory(publicId: string) {
    const row = await this.prisma.newsCategory.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay chuyen muc');
    const [childCount, articleCount] = await Promise.all([
      this.prisma.newsCategory.count({ where: { parentId: row.id } }),
      this.prisma.newsArticle.count({ where: { categoryId: row.id } }),
    ]);
    if (childCount > 0) throw new ConflictException('chuyen muc con chuyen muc con, hay xoa chuyen muc con truoc');
    if (articleCount > 0) throw new ConflictException('chuyen muc con bai viet, hay chuyen bai sang chuyen muc khac truoc');
    await this.prisma.newsCategory.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- Cong khai ----------------

  private visibleWhere(now: Date) {
    return { status: 'published', publishAt: { lte: now } };
  }

  async listPublic(params: { category?: string; q?: string; featured?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const now = new Date();
    const where: any = this.visibleWhere(now);
    if (params.featured === '1') where.isFeatured = true;
    if (params.category) {
      const cat = await this.prisma.newsCategory.findUnique({ where: { slug: params.category } });
      if (!cat) return { data: [], total: 0, page, limit };
      const children = await this.prisma.newsCategory.findMany({ where: { parentId: cat.id }, select: { id: true } });
      where.categoryId = { in: [cat.id, ...children.map((c) => c.id)] };
    }
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { sapo: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findMany({
        where,
        include: { category: true },
        orderBy: { publishAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((r) => this.toPublicItem(r)), total, page, limit };
  }

  async getPublic(slug: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { slug }, include: { category: true } });
    if (!row || row.status !== 'published' || !row.publishAt || row.publishAt > new Date()) {
      throw new NotFoundException('khong tim thay bai viet');
    }
    const related = row.categoryId
      ? await this.prisma.newsArticle.findMany({
          where: { ...this.visibleWhere(new Date()), categoryId: row.categoryId, id: { not: row.id } },
          include: { category: true },
          orderBy: { publishAt: 'desc' },
          take: 4,
        })
      : [];
    return { ...this.toPublicItem(row), related: related.map((r) => this.toPublicItem(r)) };
  }

  /** Goi 1D: giai slug cu -> slug hien tai cua bai DANG xuat ban (cho 301).
   * Chi tra ve khi bai con cong khai (published + publishAt <= now); bai
   * da go xuong/xoa thi redirect het hieu luc (404) chu khong lo bai an.
   * Goi tu route cong khai /news/slug-redirects/:slug; slug song luon
   * duoc getPublic xu ly truoc nen ham nay khong bao gio chen ngang slug that. */
  async resolveSlugRedirect(oldSlug: string) {
    const redir = await this.prisma.newsSlugRedirect.findUnique({ where: { oldSlug } });
    if (!redir) throw new NotFoundException('khong tim thay chuyen huong');
    const row = await this.prisma.newsArticle.findUnique({ where: { id: redir.articleId } });
    if (!row || row.status !== 'published' || !row.publishAt || row.publishAt > new Date()) {
      throw new NotFoundException('khong tim thay chuyen huong');
    }
    return { slug: row.slug };
  }

  /** Goi 1D-2: giai slug cu -> slug hien tai cua chuyen muc (cho 301).
   * Khac bai viet: khong kiem tra an/hien vi route /chuyen-muc/:slug
   * cua TSHT tra HTML cho moi slug (muc an van render nhu khi truy cap
   * truc tiep). Slug song luon duoc cay hien uu tien truoc nen ham nay
   * khong bao gio chen ngang slug that. Xoa muc thi redirect cung mat
   * theo (onDelete: Cascade) nen tra 404 chu khong treo slug ma. */
  async resolveCategorySlugRedirect(oldSlug: string) {
    const redir = await this.prisma.categorySlugRedirect.findUnique({ where: { oldSlug } });
    if (!redir) throw new NotFoundException('khong tim thay chuyen huong');
    const row = await this.prisma.newsCategory.findUnique({ where: { id: redir.categoryId } });
    if (!row) throw new NotFoundException('khong tim thay chuyen huong');
    return { slug: row.slug };
  }

  /** Cay chuyen muc hien (cha + con), sap xep theo sortOrder. */
  async listCategoriesPublic() {
    const rows = await this.prisma.newsCategory.findMany({
      where: { isVisible: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const byParent = new Map<string | null, any[]>();
    for (const r of rows) {
      const item = { publicId: r.publicId, name: r.name, slug: r.slug, children: [] as any[] };
      const key = r.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(item);
      (item as any)._id = r.id;
    }
    const attach = (item: any) => {
      item.children = (byParent.get(item._id) || []).map((c) => attach(c));
      delete item._id;
      return item;
    };
    return (byParent.get(null) || []).map((c) => attach(c));
  }
}
