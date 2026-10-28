import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NEWS_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, stepLabel, transition,
} from './news-workflow';
import { normalizeContentType } from './news-content';

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
  isSpotlight?: boolean;
  isPhoto?: boolean;
  isInfographic?: boolean;
  allowComments?: boolean;
  localNews?: string | null;
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

  private toApproval(row: any) {
    return {
      id: row.id, step: row.step, stepLabel: row.stepLabel,
      actorId: row.actorId, actorRole: row.actorRole,
      action: row.action, actionLabel: WORKFLOW_ACTION_LABELS[row.action] || row.action,
      comment: row.comment,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
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
    return rows.map((r) => ({ ...r, lastApproval: firstByArticle.has(r.id) ? this.toApproval(firstByArticle.get(r.id)) : null }));
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(articleId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null) {
    await this.prisma.newsArticleApproval.create({
      data: { articleId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment },
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
  }

  private async checkCategory(categoryId: string | null | undefined) {
    if (categoryId === undefined || categoryId === null) return null;
    const cat = await this.prisma.newsCategory.findFirst({
      where: { OR: [{ id: categoryId }, { publicId: categoryId }] },
    });
    if (!cat) throw new BadRequestException('chuyen muc khong ton tai');
    return cat.id;
  }

  // ---------------- Admin: bai viet ----------------

  async listAdmin(params: { q?: string; status?: string; categoryId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
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

  async getAdmin(publicId: string) {
    const row = await this.prisma.newsArticle.findUnique({ where: { publicId }, include: { category: true } });
    if (!row) throw new NotFoundException('khong tim thay bai viet');
    return this.toItem(row);
  }

  async create(input: ArticleInput, actor: Actor) {
    this.validateInput(input);
    const categoryId = await this.checkCategory(input.categoryId);
    const slug = await this.uniqueSlug(input.slug?.trim() ? input.slug : input.title);
    const row = await this.prisma.newsArticle.create({
      data: {
        publicId: this.newPublicId(),
        title: input.title.trim(),
        slug,
        sapo: input.sapo || '',
        body: input.body || '',
        categoryId,
        coverPath: input.coverPath || null,
        authors: input.authors || [],
        tags: input.tags || [],
        status: 'draft',
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        isFeatured: !!input.isFeatured,
        contentType: normalizeContentType(input.contentType),
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
    this.validateInput({ title: input.title ?? row.title, sapo: input.sapo ?? row.sapo, contentType: input.contentType });
    const data: any = { updatedBy: actor.username, updatedByRole: actor.roleName };
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.slug !== undefined || input.title !== undefined) {
      data.slug = await this.uniqueSlug(
        input.slug?.trim() ? input.slug : input.title ?? row.title,
        row.id,
      );
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
    if (input.isSpotlight !== undefined) data.isSpotlight = !!input.isSpotlight;
    if (input.isPhoto !== undefined) data.isPhoto = !!input.isPhoto;
    if (input.isInfographic !== undefined) data.isInfographic = !!input.isInfographic;
    if (input.allowComments !== undefined) data.allowComments = !!input.allowComments;
    if (input.localNews !== undefined) data.localNews = input.localNews?.trim() ? input.localNews.trim() : null;
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

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${NEWS_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'published';
    const updated = await this.prisma.newsArticle.update({
      where: { id: row.id },
      data: { status: next.status, workflowStep: next.step, publishAt: wasFinal ? (row.publishAt || new Date()) : row.publishAt },
    });
    await this.writeApproval(row.id, step, actor.id, actor.roleName, 'approve', null);
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
    return { data: rows.map((r) => this.toApproval(r)) };
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
