import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ROYALTY_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, canUnlock, checkSeparationOfDuties, stepLabel, transition,
} from './royalties-workflow';
import {
  articleTotal, authorPoints, equalShares, normalizeScores, validateScores, validateShares,
  AuthorShare, ComponentScores,
} from './royalties-score';

export interface Actor {
  id: string | null;
  username: string | null;
  roleName: string | null;
}

export interface RoyaltyInput {
  scores?: Partial<ComponentScores>;
  shares?: AuthorShare[];
}

@Injectable()
export class RoyaltiesService {
  constructor(private readonly prisma: PrismaService) {}

  private scoresOf(row: any): ComponentScores {
    return {
      content: row.contentScore ?? 0,
      image: row.imageScore ?? 0,
      video: row.videoScore ?? 0,
      audio: row.audioScore ?? 0,
      other: row.otherScore ?? 0,
    };
  }

  private sharesOf(row: any): AuthorShare[] {
    return Array.isArray(row?.shares) ? row.shares : [];
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

  /** Giai quyet ten nguoi xu ly tu actorId (AdminUser) de hien thi lich su. */
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

  /** Gan lastApproval (dong xu ly moi nhat) cho cac ban cham cua 1 trang list. */
  private async attachLastApprovals(rows: any[]) {
    const withRoyalty = rows.filter((r) => r.royalty);
    if (!withRoyalty.length) return;
    const ids = withRoyalty.map((r) => r.royalty.id);
    const all = await this.prisma.articleRoyaltyApproval.findMany({
      where: { royaltyId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstBy = new Map<string, any>();
    for (const a of all) if (!firstBy.has(a.royaltyId)) firstBy.set(a.royaltyId, a);
    for (const r of withRoyalty) {
      r.royalty.lastApproval = firstBy.has(r.royalty.id) ? this.toApproval(firstBy.get(r.royalty.id)) : null;
    }
  }

  private toRoyalty(row: any) {
    if (!row) return null;
    const scores = this.scoresOf(row);
    const shares = this.sharesOf(row);
    return {
      id: row.id,
      scores,
      shares,
      perAuthor: authorPoints(scores, shares),
      articleTotal: articleTotal(scores),
      status: row.status,
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: ROYALTY_WORKFLOW_STEPS.length,
      lastApproval: (row as any).lastApproval || null,
      updatedBy: row.updatedBy,
      updatedByRole: row.updatedByRole,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private toArticleItem(article: any) {
    return {
      articlePublicId: article.publicId,
      title: article.title,
      slug: article.slug,
      authors: article.authors || [],
      categoryName: article.category?.name || null,
      publishAt: article.publishAt ? article.publishAt.toISOString() : null,
      royalty: this.toRoyalty(article.royalty),
    };
  }

  private async articleOrThrow(publicId: string) {
    const article = await this.prisma.newsArticle.findUnique({
      where: { publicId },
      include: { royalty: true, category: { select: { name: true } } },
    });
    if (!article) throw new NotFoundException('khong tim thay bai viet');
    return article;
  }

  private validateInput(article: any, input: RoyaltyInput) {
    const scores = normalizeScores(input.scores || {});
    const scoreErrors = validateScores(scores);
    if (scoreErrors.length) throw new BadRequestException(scoreErrors.join('; '));
    const shares = input.shares && input.shares.length ? input.shares : equalShares(article.authors || []);
    const shareErrors = validateShares(article.authors || [], shares);
    if (shareErrors.length) throw new BadRequestException(shareErrors.join('; '));
    return { scores, shares };
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'unlock') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(royaltyId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.articleRoyaltyApproval.create({
      data: {
        royaltyId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null,
      },
    });
  }

  // ---------------- Panel: bai da xuat ban + ban cham ----------------

  async listArticles(params: { q?: string; royaltyStatus?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where: any = { status: 'published' };
    if (params.q) where.title = { contains: params.q, mode: 'insensitive' };
    if (params.royaltyStatus === 'none') where.royalty = { is: null };
    else if (params.royaltyStatus) where.royalty = { is: { status: params.royaltyStatus } };
    const [total, rows] = await Promise.all([
      this.prisma.newsArticle.count({ where }),
      this.prisma.newsArticle.findMany({
        where,
        include: { royalty: true, category: { select: { name: true } } },
        orderBy: [{ publishAt: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    await this.attachLastApprovals(rows);
    return { data: rows.map((r) => this.toArticleItem(r)), total, page, limit };
  }

  async getArticle(publicId: string) {
    const article = await this.articleOrThrow(publicId);
    if (article.royalty) {
      (article as any).royalty.lastApproval = null;
      const last = await this.prisma.articleRoyaltyApproval.findFirst({
        where: { royaltyId: article.royalty.id }, orderBy: { createdAt: 'desc' },
      });
      (article as any).royalty.lastApproval = last ? this.toApproval(last) : null;
    }
    return this.toArticleItem(article);
  }

  async create(publicId: string, input: RoyaltyInput, actor: Actor) {
    const article = await this.articleOrThrow(publicId);
    if (article.status !== 'published') {
      throw new ConflictException('chi cham diem cho bai da xuat ban');
    }
    if (article.royalty) throw new ConflictException('bai viet da co ban cham diem');
    const { scores, shares } = this.validateInput(article, input);
    const row = await this.prisma.articleRoyalty.create({
      data: {
        articleId: article.id,
        contentScore: scores.content, imageScore: scores.image, videoScore: scores.video,
        audioScore: scores.audio, otherScore: scores.other,
        shares: shares as any,
        status: 'draft', workflowStep: 0,
        createdBy: actor.id, updatedBy: actor.username, updatedByRole: actor.roleName,
      },
    });
    (article as any).royalty = row;
    return this.toArticleItem(article);
  }

  async patch(publicId: string, input: RoyaltyInput, actor: Actor) {
    const article = await this.articleOrThrow(publicId);
    const row = article.royalty;
    if (!row) throw new NotFoundException('bai viet chua co ban cham diem');
    if (row.status === 'approved') {
      throw new ConflictException('diem da khoa, BBT phai mo khoa ngoai le truoc khi sua');
    }
    if (row.status === 'pending_review') {
      throw new ConflictException('ban cham dang cho duyet, hay tra lai truoc khi sua');
    }
    const { scores, shares } = this.validateInput(article, {
      scores: input.scores ?? this.scoresOf(row),
      shares: input.shares ?? this.sharesOf(row),
    });
    const updated = await this.prisma.articleRoyalty.update({
      where: { id: row.id },
      data: {
        contentScore: scores.content, imageScore: scores.image, videoScore: scores.video,
        audioScore: scores.audio, otherScore: scores.other,
        shares: shares as any,
        updatedBy: actor.username, updatedByRole: actor.roleName,
      },
    });
    (article as any).royalty = updated;
    return this.toArticleItem(article);
  }

  // ---------------- Quy trinh duyet (xem royalties-workflow.ts) ----------------

  private async royaltyOrThrow(publicId: string) {
    const article = await this.articleOrThrow(publicId);
    if (!article.royalty) throw new NotFoundException('bai viet chua co ban cham diem');
    return article.royalty;
  }

  async submitForReview(publicId: string, actor: Actor) {
    const row = await this.royaltyOrThrow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.articleRoyalty.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actor.id, actor.roleName, 'submit', null);
    const article = await this.articleOrThrow(publicId);
    (article as any).royalty = updated;
    return this.toArticleItem(article);
  }

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string }) {
    const row = await this.royaltyOrThrow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${ROYALTY_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu (SoD): nguoi de xuat khong tu duyet — ap dung ca
    // toan quyen; ngoai le tin nong phai co co + ly do va duoc ghi log.
    const prev = await this.prisma.articleRoyaltyApproval.findFirst({
      where: { royaltyId: row.id }, orderBy: { createdAt: 'desc' },
    });
    const sod = checkSeparationOfDuties(prev?.actorId || null, actor.id, !!opts?.breakingNews);
    if (!sod.allowed) {
      throw new ForbiddenException('tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua cung mot ban cham; dung ngoai le tin nong neu can');
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'approved';
    const updated = await this.prisma.articleRoyalty.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, step, actor.id, actor.roleName, 'approve', null,
      sod.isException ? { isException: true, exceptionReason: (opts?.breakingNewsReason || '').trim() || null } : undefined);
    if (wasFinal) {
      // Duyet xong = khoa diem (ghi rieng dong 'publish' cho lich su).
      await this.writeApproval(row.id, 0, actor.id, actor.roleName, 'publish', null);
    }
    const article = await this.articleOrThrow(publicId);
    (article as any).royalty = updated;
    return this.toArticleItem(article);
  }

  async returnRoyalty(publicId: string, actor: Actor, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.royaltyOrThrow(publicId);
    const next = this.applyTransition(row, 'return');
    const updated = await this.prisma.articleRoyalty.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, row.workflowStep ?? 0, actor.id, actor.roleName, 'return', String(reason).trim());
    const article = await this.articleOrThrow(publicId);
    (article as any).royalty = updated;
    return this.toArticleItem(article);
  }

  /** Mo khoa ngoai le: chi BBT (hoac toan quyen), bat buoc ly do, ghi log ngoai le. */
  async unlock(publicId: string, actor: Actor, isFullAdmin: boolean, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('mo khoa bat buoc co ly do');
    const row = await this.royaltyOrThrow(publicId);
    if (!canUnlock(actor.roleName, isFullAdmin)) {
      throw new ForbiddenException(`chi vai ${ROYALTY_WORKFLOW_STEPS[0].roleName} hoac toan quyen moi mo khoa duoc`);
    }
    const next = this.applyTransition(row, 'unlock');
    const updated = await this.prisma.articleRoyalty.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, 0, actor.id, actor.roleName, 'unlock', null,
      { isException: true, exceptionReason: String(reason).trim() });
    const article = await this.articleOrThrow(publicId);
    (article as any).royalty = updated;
    return this.toArticleItem(article);
  }

  async listApprovals(publicId: string) {
    const row = await this.royaltyOrThrow(publicId);
    const rows = await this.prisma.articleRoyaltyApproval.findMany({
      where: { royaltyId: row.id }, orderBy: { createdAt: 'asc' },
    });
    const names = await this.resolveActorNames(rows.map((r) => r.actorId));
    return { data: rows.map((r) => this.toApproval(r, names)) };
  }

  // ---------------- Dashboard + xuat Excel ----------------

  private rangeWhere(from?: string, to?: string) {
    const range: any = {};
    if (from) {
      const d = new Date(`${from}T00:00:00.000`);
      if (!Number.isNaN(d.getTime())) range.gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59.999`);
      if (!Number.isNaN(d.getTime())) range.lte = d;
    }
    return Object.keys(range).length ? range : null;
  }

  /** Ban cham DA KHOA (approved) trong ky, kem bai viet. Loc theo publishAt cua bai. */
  private async lockedRoyalties(from?: string, to?: string) {
    const range = this.rangeWhere(from, to);
    const rows = await this.prisma.articleRoyalty.findMany({
      where: { status: 'approved' },
      include: { article: { select: { publicId: true, title: true, authors: true, publishAt: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.filter((r) => {
      if (!range) return true;
      const p = r.article?.publishAt;
      if (!p) return false;
      if (range.gte && p < range.gte) return false;
      if (range.lte && p > range.lte) return false;
      return true;
    });
  }

  async dashboard(from?: string, to?: string) {
    const range = this.rangeWhere(from, to);
    const locked = await this.lockedRoyalties(from, to);

    // Tong hop theo tac gia (chi diem da khoa moi la so chinh thuc).
    const byAuthorMap = new Map<string, any>();
    for (const r of locked) {
      const scores = this.scoresOf(r);
      for (const p of authorPoints(scores, this.sharesOf(r))) {
        const cur = byAuthorMap.get(p.author) || {
          author: p.author, articles: 0, content: 0, image: 0, video: 0, audio: 0, other: 0, total: 0,
        };
        cur.articles += 1;
        cur.content += p.content; cur.image += p.image; cur.video += p.video;
        cur.audio += p.audio; cur.other += p.other; cur.total += p.total;
        byAuthorMap.set(p.author, cur);
      }
    }
    const byAuthor = [...byAuthorMap.values()]
      .map((a) => ({
        ...a,
        content: Math.round(a.content * 100) / 100, image: Math.round(a.image * 100) / 100,
        video: Math.round(a.video * 100) / 100, audio: Math.round(a.audio * 100) / 100,
        other: Math.round(a.other * 100) / 100, total: Math.round(a.total * 100) / 100,
      }))
      .sort((x, y) => y.total - x.total);

    // So bai xuat ban theo ngay trong ky (du lieu that tu NewsArticle).
    const articleWhere: any = { status: 'published' };
    if (range) articleWhere.publishAt = range;
    const published = await this.prisma.newsArticle.findMany({
      where: articleWhere, select: { publishAt: true },
    });
    const dayMap = new Map<string, number>();
    for (const a of published) {
      if (!a.publishAt) continue;
      const day = a.publishAt.toISOString().slice(0, 10);
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
    const articlesByDay = [...dayMap.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((x, y) => (x.day < y.day ? -1 : 1));

    // Top bai theo luot xem trong ky (PageView chi co articlePublicId/path/createdAt).
    const viewWhere: any = { articlePublicId: { not: null } };
    if (range) viewWhere.createdAt = range;
    const grouped = await this.prisma.pageView.groupBy({
      by: ['articlePublicId'], where: viewWhere, _count: { _all: true },
      orderBy: { _count: { articlePublicId: 'desc' } }, take: 10,
    });
    const ids = grouped.map((g) => g.articlePublicId).filter((x): x is string => !!x);
    const articles = ids.length
      ? await this.prisma.newsArticle.findMany({ where: { publicId: { in: ids } }, select: { publicId: true, title: true } })
      : [];
    const titleById = new Map(articles.map((a) => [a.publicId, a.title]));
    const topViewed = grouped.map((g) => ({
      articlePublicId: g.articlePublicId,
      title: titleById.get(g.articlePublicId as string) || '(bai da xoa)',
      views: (g as any)._count?._all ?? 0,
    }));

    return {
      from: from || null, to: to || null,
      totals: {
        lockedArticles: locked.length,
        publishedArticles: published.length,
        authors: byAuthor.length,
        totalPoints: Math.round(byAuthor.reduce((s, a) => s + a.total, 0) * 100) / 100,
      },
      byAuthor, articlesByDay, topViewed,
    };
  }

  /** Dong xuat Excel: 1 dong / bai x tac gia (chi ban da khoa), publishAt giam dan. */
  async exportRows(from?: string, to?: string) {
    const locked = await this.lockedRoyalties(from, to);
    const sorted = [...locked].sort((a, b) => {
      const pa = a.article?.publishAt?.getTime() ?? 0;
      const pb = b.article?.publishAt?.getTime() ?? 0;
      return pb - pa;
    });
    const rows: { title: string; author: string; content: number; image: number; video: number; audio: number; other: number }[] = [];
    for (const r of sorted) {
      const scores = this.scoresOf(r);
      for (const p of authorPoints(scores, this.sharesOf(r))) {
        rows.push({
          title: r.article?.title || '', author: p.author,
          content: p.content, image: p.image, video: p.video, audio: p.audio, other: p.other,
        });
      }
    }
    return rows;
  }
}
