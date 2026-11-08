import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CatalogService } from '../catalog/catalog.service';
import { UsersService } from '../auth/users.service';
import { rateLimiter } from '../auth/rate-limit';
import { turnstileEnabled, verifyTurnstile } from '../auth/turnstile';
import { vnTodayStr } from '../dashboard/dashboard-helpers';
import {
  countCodePoints,
  findBannedWord,
  normalizeForDuplicate,
  sliceCodePoints,
  stripLinks,
} from './comments-helpers';

// Goi "Binh luan dot 1" (2026-11-08, thiet ke thiet-ke-binh-luan-dot-1.md
// §3/§6). Service dung chung cho controller public/ban doc + controller
// CMS. Loi tra theo chuan backend: HttpException {error:{code,message}}
// (ApiExceptionFilter giu nguyen code). Prisma client tren may dev chua
// generate model moi nen truy cap bang (prisma as any) — giong mau
// home-slots.service.ts; Docker build chay `prisma generate` truoc.

export const COMMENT_SETTING_KEYS = [
  'comments.enabled',
  'comments.moderationMode',
  'comments.turnstileEnabled',
  'comments.requirePhoneVerified',
  'comments.maxLength',
  'comments.dailyLimit',
  'comments.ipDailyLimit',
  'comments.ipBurstLimit',
] as const;

export interface CommentSettings {
  enabled: boolean;
  moderationMode: 'pre' | 'post';
  turnstileEnabled: boolean;
  requirePhoneVerified: boolean;
  maxLength: number;
  dailyLimit: number;
  ipDailyLimit: number;
  ipBurstLimit: number;
}

const DEFAULTS: CommentSettings = {
  enabled: false,
  moderationMode: 'pre',
  turnstileEnabled: false,
  requirePhoneVerified: false,
  maxLength: 1000,
  dailyLimit: 20,
  ipDailyLimit: 200,
  ipBurstLimit: 20,
};

function fail(code: string, message: string, status: HttpStatus): never {
  throw new HttpException({ error: { code, message } }, status);
}

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);

  constructor(
    private prisma: PrismaService,
    private catalog: CatalogService,
    private users: UsersService,
  ) {}

  // (prisma as any): model Comment/CommentReport/AuditLog moi (xem ghi
  // chu dau file). SiteSetting da co trong schema cu nen dung truc tiep.
  private get commentsDb() {
    return (this.prisma as any).comment;
  }

  private get reportsDb() {
    return (this.prisma as any).commentReport;
  }

  private get auditDb() {
    return (this.prisma as any).auditLog;
  }

  clientIp(req: any): string {
    const fwd = req?.headers?.['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
    if (Array.isArray(fwd) && fwd.length) return String(fwd[0]).trim();
    return req?.ip || req?.socket?.remoteAddress || 'unknown';
  }

  // --- Cai dat (§2.3): doc truc tiep tu site_settings moi lan, thieu
  // key -> mac dinh. Khong cache (luu luong binh luan thap). ---
  async getSettings(): Promise<CommentSettings> {
    const rows = await this.prisma.siteSetting.findMany({
      where: { key: { in: [...COMMENT_SETTING_KEYS] } },
    });
    const byKey = new Map(rows.map((r: any) => [r.key, r.value]));
    const boolOf = (key: string, def: boolean): boolean => {
      const v = byKey.get(key);
      if (v === undefined) return def;
      return String(v).toLowerCase() === 'true';
    };
    const intOf = (key: string, def: number): number => {
      const v = byKey.get(key);
      const n = v === undefined ? NaN : Number.parseInt(String(v), 10);
      return Number.isFinite(n) && n >= 0 ? n : def;
    };
    const mode = byKey.get('comments.moderationMode');
    return {
      enabled: boolOf('comments.enabled', DEFAULTS.enabled),
      moderationMode: mode === 'post' ? 'post' : 'pre',
      turnstileEnabled: boolOf('comments.turnstileEnabled', DEFAULTS.turnstileEnabled),
      requirePhoneVerified: boolOf('comments.requirePhoneVerified', DEFAULTS.requirePhoneVerified),
      maxLength: intOf('comments.maxLength', DEFAULTS.maxLength),
      dailyLimit: intOf('comments.dailyLimit', DEFAULTS.dailyLimit),
      ipDailyLimit: intOf('comments.ipDailyLimit', DEFAULTS.ipDailyLimit),
      ipBurstLimit: intOf('comments.ipBurstLimit', DEFAULTS.ipBurstLimit),
    };
  }

  /** Cau hinh cong khai cho portal (§3.3). */
  async getPublicConfig() {
    const s = await this.getSettings();
    return {
      enabled: s.enabled,
      moderationMode: s.moderationMode,
      maxLength: s.maxLength,
      turnstileEnabled: s.turnstileEnabled && turnstileEnabled(),
      requirePhoneVerified: s.requirePhoneVerified,
    };
  }

  /** Danh sach tu cam tu entity 'banned' dung chung cua catalog (§2.3,
   *  Q8b). Loi doc catalog -> coi nhu khong co tu cam (ghi log) de
   *  khong chan het binh luan vi loi phu. */
  async getBannedWords(): Promise<string[]> {
    try {
      const res = await this.catalog.list('banned', { page: 1, limit: 100 });
      const items = (res?.data || []) as Array<{ word?: string }>;
      return items.map((it) => String(it?.word || '').trim()).filter(Boolean);
    } catch (e) {
      this.logger.warn(`Khong doc duoc danh sach tu cam (banned): ${(e as Error).message}`);
      return [];
    }
  }

  private async findPublishedArticleBySlug(slug: string) {
    const article = await (this.prisma as any).newsArticle.findUnique({ where: { slug } });
    if (!article || article.status !== 'published') {
      fail('article_not_found', 'Bài viết không tồn tại hoặc chưa xuất bản', HttpStatus.NOT_FOUND);
    }
    return article;
  }

  private assertCommentsEnabled(settings: CommentSettings) {
    if (!settings.enabled) {
      fail('comments_disabled', 'Tính năng bình luận chưa được bật', HttpStatus.FORBIDDEN);
    }
  }

  private iso(v: any): string | null {
    if (!v) return null;
    return v instanceof Date ? v.toISOString() : String(v);
  }

  // --- API cong khai (§3.3) ---
  async listPublic(articleSlug: string, page: number, limit: number, viewerUserId?: string | null) {
    const settings = await this.getSettings();
    this.assertCommentsEnabled(settings);
    const article = await this.findPublishedArticleBySlug(articleSlug);
    if (article.allowComments === false) {
      fail('comments_not_allowed', 'Bài viết đã tắt bình luận', HttpStatus.FORBIDDEN);
    }
    const p = Math.max(1, page || 1);
    const l = Math.min(50, Math.max(1, limit || 20));
    const where: any = { articleId: article.id, status: 'approved', parentId: null, deletedAt: null };
    const [total, rows] = await Promise.all([
      this.commentsDb.count({ where }),
      this.commentsDb.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
      }),
    ]);
    const ids = rows.map((r: any) => r.id);
    const replies = ids.length
      ? await this.commentsDb.findMany({
          where: { parentId: { in: ids }, status: 'approved', deletedAt: null },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const byParent = new Map<string, any[]>();
    for (const r of replies) {
      const arr = byParent.get(r.parentId) || [];
      arr.push(r);
      byParent.set(r.parentId, arr);
    }
    const pub = (r: any) => ({
      id: r.id,
      authorName: r.authorName,
      isNewsroom: !!r.isNewsroom,
      body: r.body,
      createdAt: this.iso(r.createdAt),
    });
    const data = rows.map((r: any) => ({
      ...pub(r),
      mine: !!viewerUserId && !!r.userId && r.userId === viewerUserId,
      replies: (byParent.get(r.id) || []).map(pub),
    }));
    return { data, total, page: p, limit: l };
  }

  // --- API ban doc (§3.4) ---
  async createComment(
    userId: string,
    input: { articleSlug: string; body?: string; parentId?: string; turnstileToken?: string },
    req: any,
  ) {
    const settings = await this.getSettings();
    this.assertCommentsEnabled(settings);
    if (input.parentId) {
      fail('invalid_parent', 'Bạn đọc không được trả lời bình luận', HttpStatus.BAD_REQUEST);
    }
    const article = await this.findPublishedArticleBySlug(input.articleSlug);
    if (article.allowComments === false) {
      fail('comments_not_allowed', 'Bài viết đã tắt bình luận', HttpStatus.FORBIDDEN);
    }
    const user = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpException('account not found', HttpStatus.UNAUTHORIZED);
    if (user.status !== 'active') {
      throw new HttpException('tai khoan bi khoa', HttpStatus.FORBIDDEN);
    }
    if (!user.emailVerifiedAt) {
      fail('email_not_verified', 'Cần xác nhận email trước khi bình luận', HttpStatus.FORBIDDEN);
    }

    const raw = String(input.body ?? '');
    const trimmed = raw.trim();
    if (!trimmed) fail('comment_empty', 'Bình luận không được để trống', HttpStatus.BAD_REQUEST);
    // §6.1 dung thu tu: 1. do dai (code point) -> 2/3/4. gioi han tan
    // suat -> 5. loai link -> 6. trung lap -> 7. tu cam -> 8. Turnstile.
    // (Thu tu nay theo §6.1 + task giao; §3.4 liet ke Turnstile o
    // buoc 6 truoc rate limit — lech nay duoc ghi trong bao cao.)
    if (countCodePoints(trimmed) > settings.maxLength) {
      fail('comment_too_long', `Bình luận tối đa ${settings.maxLength} ký tự`, HttpStatus.BAD_REQUEST);
    }
    const ip = this.clientIp(req);
    const today = vnTodayStr();
    if (!rateLimiter.tick(`comment:u:${userId}`, 1, 30_000)) {
      fail('too_many_requests', 'Bạn bình luận quá nhanh, thử lại sau 30 giây', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!rateLimiter.tick(`comment:u:${userId}:day:${today}`, settings.dailyLimit, 24 * 60 * 60_000)) {
      fail(
        'too_many_requests',
        `Bạn đã đạt giới hạn ${settings.dailyLimit} bình luận hôm nay`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (!rateLimiter.tick(`comment:ip:${ip}`, settings.ipBurstLimit, 10 * 60_000)) {
      fail('too_many_requests', 'Quá nhiều bình luận từ địa chỉ mạng này, thử lại sau', HttpStatus.TOO_MANY_REQUESTS);
    }
    if (!rateLimiter.tick(`comment:ip:${ip}:day:${today}`, settings.ipDailyLimit, 24 * 60 * 60_000)) {
      fail('too_many_requests', 'Quá nhiều bình luận từ địa chỉ mạng này hôm nay', HttpStatus.TOO_MANY_REQUESTS);
    }
    const { text, linksRemoved } = stripLinks(trimmed);
    if (!text) {
      fail('comment_empty', 'Bình luận không được chỉ chứa liên kết', HttpStatus.BAD_REQUEST);
    }
    const normalized = normalizeForDuplicate(text);
    const now = Date.now();
    const recent = await this.commentsDb.findMany({
      where: { userId, deletedAt: null, createdAt: { gte: new Date(now - 24 * 60 * 60_000) } },
      select: { articleId: true, body: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    for (const r of recent) {
      if (normalizeForDuplicate(r.body) !== normalized) continue;
      const ageMs = now - new Date(r.createdAt).getTime();
      if (r.articleId === article.id && ageMs < 24 * 60 * 60_000) {
        fail('comment_duplicate', 'Bạn đã gửi bình luận giống hệt trước đó', HttpStatus.CONFLICT);
      }
      if (ageMs < 10 * 60_000) {
        fail('comment_duplicate', 'Bạn đã gửi bình luận giống hệt trước đó', HttpStatus.CONFLICT);
      }
    }
    const bannedWords = await this.getBannedWords();
    const flaggedBannedWord = !!findBannedWord(normalized, bannedWords);
    // Turnstile chi khi ca co bat VA da co TURNSTILE_SECRET_KEY.
    if (settings.turnstileEnabled && turnstileEnabled()) {
      const ok = await verifyTurnstile(
        process.env.TURNSTILE_SECRET_KEY || '',
        input.turnstileToken || '',
        fetch,
        ip === 'unknown' ? undefined : ip,
      );
      if (!ok) fail('captcha_failed', 'Xác minh captcha thất bại', HttpStatus.BAD_REQUEST);
    }
    const authorName = String(user.displayName || '').trim() || 'Bạn đọc';
    // Dot 1 luon duyet truoc (status='pending'), ke ca khi
    // moderationMode='post' — xem thiet ke §3.4.
    const created = await this.commentsDb.create({
      data: {
        articleId: article.id,
        userId,
        adminId: null,
        parentId: null,
        authorName,
        isNewsroom: false,
        body: text,
        status: 'pending',
        flaggedBannedWord,
        ip,
        userAgent: String(req?.headers?.['user-agent'] || '') || null,
      },
    });
    return {
      id: created.id,
      status: 'pending',
      authorName,
      body: text,
      createdAt: this.iso(created.createdAt),
      linksRemoved,
      message: 'Bình luận của bạn đang chờ tòa soạn duyệt',
    };
  }

  async deleteMine(userId: string, id: string) {
    const c = await this.commentsDb.findUnique({ where: { id } });
    if (!c) fail('not_found', 'Bình luận không tồn tại', HttpStatus.NOT_FOUND);
    if (c.userId !== userId) fail('forbidden', 'Không phải bình luận của bạn', HttpStatus.FORBIDDEN);
    // Da xoa mem roi -> 200 idempotent (bam 2 lan khong loi).
    if (c.deletedAt) return { ok: true };
    await this.commentsDb.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  async report(userId: string, id: string, reason?: string) {
    const c = await this.commentsDb.findUnique({ where: { id } });
    if (!c || c.status !== 'approved' || c.deletedAt) {
      fail('not_found', 'Bình luận không tồn tại', HttpStatus.NOT_FOUND);
    }
    if (c.userId && c.userId === userId) {
      fail('cannot_report_own', 'Không thể báo cáo bình luận của chính mình', HttpStatus.CONFLICT);
    }
    const existing = await this.reportsDb.findFirst({ where: { commentId: id, userId } });
    if (existing) fail('already_reported', 'Bạn đã báo cáo bình luận này', HttpStatus.CONFLICT);
    const cleanReason = reason ? sliceCodePoints(String(reason).trim(), 200) : null;
    try {
      const updated = await (this.prisma as any).$transaction(async (tx: any) => {
        await tx.commentReport.create({ data: { commentId: id, userId, reason: cleanReason } });
        const after = await tx.comment.update({
          where: { id },
          data: { reportCount: { increment: 1 } },
        });
        if (after.reportCount >= 3 && after.status === 'approved') {
          return await tx.comment.update({
            where: { id },
            data: { status: 'hidden', autoHiddenByReports: true },
          });
        }
        return after;
      });
      return { ok: true, reportCount: updated.reportCount, hidden: updated.status === 'hidden' };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        fail('already_reported', 'Bạn đã báo cáo bình luận này', HttpStatus.CONFLICT);
      }
      throw e;
    }
  }

  async listMine(userId: string, page: number, limit: number) {
    const p = Math.max(1, page || 1);
    const l = Math.min(50, Math.max(1, limit || 20));
    const where: any = { userId, deletedAt: null };
    const [total, rows] = await Promise.all([
      this.commentsDb.count({ where }),
      this.commentsDb.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (p - 1) * l,
        take: l,
        include: { article: { select: { slug: true, title: true } } },
      }),
    ]);
    return {
      data: rows.map((r: any) => ({
        id: r.id,
        articleSlug: r.article?.slug || null,
        articleTitle: r.article?.title || null,
        body: r.body,
        status: r.status,
        moderationReason: r.moderationReason ?? null,
        createdAt: this.iso(r.createdAt),
        moderatedAt: this.iso(r.moderatedAt),
      })),
      total,
      page: p,
      limit: l,
    };
  }

  // --- API CMS (§3.5) ---
  async adminList(query: {
    status?: string;
    articleId?: string;
    q?: string;
    flagged?: string;
    page?: number;
    limit?: number;
  }, canSeeIp: boolean) {
    const status = (query.status || 'pending').trim();
    const p = Math.max(1, Number(query.page) || 1);
    const l = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = {};
    if (status === 'deleted') {
      where.deletedAt = { not: null };
    } else if (status === 'all') {
      // Tat ca, ke ca da xoa mem.
    } else if (['pending', 'approved', 'rejected', 'hidden'].includes(status)) {
      where.status = status;
      where.deletedAt = null;
    } else {
      fail('bad_request', 'Trạng thái lọc không hợp lệ', HttpStatus.BAD_REQUEST);
    }
    if (query.articleId) where.articleId = query.articleId;
    if (query.flagged === 'true') where.flaggedBannedWord = true;
    const q = (query.q || '').trim();
    if (q) {
      where.OR = [
        { authorName: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ];
    }
    const orderBy = status === 'pending' ? { createdAt: 'asc' } : { createdAt: 'desc' };
    const [total, rows] = await Promise.all([
      this.commentsDb.count({ where }),
      this.commentsDb.findMany({
        where,
        orderBy,
        skip: (p - 1) * l,
        take: l,
        include: { article: { select: { slug: true, title: true } } },
      }),
    ]);
    const modIds = [...new Set(rows.map((r: any) => r.moderatedBy).filter(Boolean))] as string[];
    const modNames = new Map<string, string>();
    if (modIds.length) {
      const admins = await (this.prisma as any).adminUser.findMany({
        where: { id: { in: modIds } },
        select: { id: true, fullName: true, username: true },
      });
      for (const a of admins) modNames.set(a.id, a.fullName || a.username || a.id);
    }
    return {
      data: rows.map((r: any) => ({
        id: r.id,
        articleId: r.articleId,
        articleSlug: r.article?.slug || null,
        articleTitle: r.article?.title || null,
        userId: r.userId ?? null,
        authorName: r.authorName,
        isNewsroom: !!r.isNewsroom,
        body: r.body,
        status: r.status,
        flaggedBannedWord: !!r.flaggedBannedWord,
        reportCount: r.reportCount ?? 0,
        autoHiddenByReports: !!r.autoHiddenByReports,
        moderationReason: r.moderationReason ?? null,
        moderatedBy: r.moderatedBy ?? null,
        moderatedByName: r.moderatedBy ? modNames.get(r.moderatedBy) || null : null,
        moderatedAt: this.iso(r.moderatedAt),
        ip: canSeeIp ? r.ip ?? null : null,
        userAgent: canSeeIp ? r.userAgent ?? null : null,
        createdAt: this.iso(r.createdAt),
        deletedAt: this.iso(r.deletedAt),
      })),
      total,
      page: p,
      limit: l,
    };
  }

  // --- Bo sung ngoai §3.5 (de du §4.1: dialog chi tiet CMS hien danh
  // sach bao cao — chi comments:publish moi xem). GET
  // /api/v1/admin/comments/:id/reports.
  async listReports(id: string) {
    await this.findForModeration(id);
    const rows = await this.reportsDb.findMany({
      where: { commentId: id },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { displayName: true } } },
    });
    return {
      data: rows.map((r: any) => ({
        id: r.id,
        reporterName: String(r.user?.displayName || '').trim() || 'Bạn đọc',
        reason: r.reason ?? null,
        createdAt: this.iso(r.createdAt),
      })),
    };
  }

  private async audit(
    tx: any,
    adminId: string | null,
    action: string,
    module: string,
    targetId: string | null,
    oldValue: any,
    newValue: any,
  ) {
    await tx.auditLog.create({
      data: { adminId, action, module, targetId, oldValue, newValue },
    });
  }

  private async findForModeration(id: string) {
    const c = await this.commentsDb.findUnique({ where: { id } });
    if (!c || c.deletedAt) fail('not_found', 'Bình luận không tồn tại', HttpStatus.NOT_FOUND);
    return c;
  }

  async approve(adminId: string, id: string) {
    const c = await this.findForModeration(id);
    if (!['pending', 'hidden', 'rejected'].includes(c.status)) {
      fail('invalid_status', 'Chỉ duyệt bình luận đang chờ, đang ẩn hoặc đã bị từ chối', HttpStatus.CONFLICT);
    }
    const oldStatus = c.status;
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.comment.update({
        where: { id },
        data: { status: 'approved', moderatedBy: adminId, moderatedAt: new Date(), autoHiddenByReports: false },
      });
      await this.audit(tx, adminId, 'approve', 'comments', id, oldStatus, 'approved');
    });
    return { ok: true, id, status: 'approved' };
  }

  async reject(adminId: string, id: string, reason?: string) {
    const clean = String(reason ?? '').trim();
    if (!clean) fail('reason_required', 'Cần nhập lý do từ chối', HttpStatus.BAD_REQUEST);
    if (countCodePoints(clean) > 500) {
      fail('reason_too_long', 'Lý do từ chối tối đa 500 ký tự', HttpStatus.BAD_REQUEST);
    }
    const c = await this.findForModeration(id);
    if (!['pending', 'hidden'].includes(c.status)) {
      fail('invalid_status', 'Chỉ từ chối bình luận đang chờ hoặc đang ẩn', HttpStatus.CONFLICT);
    }
    const oldStatus = c.status;
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.comment.update({
        where: { id },
        data: { status: 'rejected', moderationReason: clean, moderatedBy: adminId, moderatedAt: new Date() },
      });
      await this.audit(tx, adminId, 'reject', 'comments', id, oldStatus, 'rejected');
    });
    return { ok: true, id, status: 'rejected' };
  }

  async hide(adminId: string, id: string, reason?: string) {
    const clean = String(reason ?? '').trim() || null;
    if (clean && countCodePoints(clean) > 500) {
      fail('reason_too_long', 'Lý do ẩn tối đa 500 ký tự', HttpStatus.BAD_REQUEST);
    }
    const c = await this.findForModeration(id);
    if (c.status !== 'approved') {
      fail('invalid_status', 'Chỉ ẩn bình luận đang hiển thị', HttpStatus.CONFLICT);
    }
    await (this.prisma as any).$transaction(async (tx: any) => {
      await tx.comment.update({
        where: { id },
        data: {
          status: 'hidden',
          moderationReason: clean ?? c.moderationReason ?? null,
          moderatedBy: adminId,
          moderatedAt: new Date(),
        },
      });
      await this.audit(tx, adminId, 'hide', 'comments', id, 'approved', 'hidden');
    });
    return { ok: true, id, status: 'hidden' };
  }

  async reply(adminId: string, id: string, body: string | undefined, req: any) {
    const settings = await this.getSettings();
    const trimmed = String(body ?? '').trim();
    if (!trimmed) fail('comment_empty', 'Nội dung trả lời không được để trống', HttpStatus.BAD_REQUEST);
    if (countCodePoints(trimmed) > settings.maxLength) {
      fail('comment_too_long', `Nội dung trả lời tối đa ${settings.maxLength} ký tự`, HttpStatus.BAD_REQUEST);
    }
    const parent = await this.findForModeration(id);
    if (parent.parentId) {
      fail('invalid_parent', 'Chỉ trả lời bình luận gốc (1 cấp)', HttpStatus.BAD_REQUEST);
    }
    if (parent.status !== 'approved') {
      fail('invalid_status', 'Chỉ trả lời bình luận đang hiển thị', HttpStatus.CONFLICT);
    }
    const created = await (this.prisma as any).$transaction(async (tx: any) => {
      const row = await tx.comment.create({
        data: {
          articleId: parent.articleId,
          parentId: parent.id,
          userId: null,
          adminId,
          authorName: 'Tòa soạn',
          isNewsroom: true,
          body: trimmed,
          status: 'approved',
          moderatedBy: adminId,
          moderatedAt: new Date(),
          ip: this.clientIp(req),
          userAgent: String(req?.headers?.['user-agent'] || '') || null,
        },
      });
      await this.audit(tx, adminId, 'reply', 'comments', row.id, null, 'approved');
      return row;
    });
    return {
      id: created.id,
      parentId: parent.id,
      articleId: parent.articleId,
      authorName: 'Tòa soạn',
      isNewsroom: true,
      body: trimmed,
      status: 'approved',
      createdAt: this.iso(created.createdAt),
    };
  }

  async banAuthor(adminId: string, id: string) {
    const c = await this.findForModeration(id);
    if (!c.userId) {
      fail('cannot_ban', 'Bình luận này không gắn tài khoản bạn đọc để khóa', HttpStatus.CONFLICT);
    }
    const userId = c.userId as string;
    // Khoa tai khoan qua UsersService (co che khoa reader hien co).
    // KHONG tu an cac binh luan da duyet cua nguoi do (Q5).
    await this.users.update(userId, { status: 'banned' });
    try {
      await (this.prisma as any).$transaction(async (tx: any) => {
        await this.audit(tx, adminId, 'ban', 'users', userId, 'active', 'banned');
        await this.audit(tx, adminId, 'ban_author', 'comments', id, null, 'banned');
      });
    } catch (e) {
      this.logger.warn(`Ban ${userId} xong nhung ghi audit that bai: ${(e as Error).message}`);
    }
    return { ok: true, userId, status: 'banned' };
  }

  async hideAllByAuthor(adminId: string, id: string, reason?: string) {
    const c = await this.findForModeration(id);
    if (!c.userId) {
      fail('cannot_hide_all', 'Bình luận này không gắn tài khoản bạn đọc', HttpStatus.CONFLICT);
    }
    const userId = c.userId as string;
    const clean = String(reason ?? '').trim() || 'Ẩn tất cả bình luận của người này';
    const res = await (this.prisma as any).$transaction(async (tx: any) => {
      const updated = await tx.comment.updateMany({
        where: { userId, status: 'approved', deletedAt: null },
        data: { status: 'hidden', moderationReason: clean, moderatedBy: adminId, moderatedAt: new Date() },
      });
      await this.audit(tx, adminId, 'hide_all_by_author', 'comments', userId, null, updated.count);
      return updated;
    });
    return { ok: true, userId, hiddenCount: res.count };
  }

  // --- Cai dat CMS (§3.5) ---
  async getSettingsAdmin() {
    const s = await this.getSettings();
    return { ...s, turnstileKeyConfigured: turnstileEnabled() };
  }

  async updateSettingsAdmin(adminId: string, input: Record<string, unknown>) {
    const patch: Record<string, string> = {};
    const boolKeys = ['enabled', 'turnstileEnabled', 'requirePhoneVerified'] as const;
    for (const k of boolKeys) {
      if (input[k] !== undefined) {
        if (typeof input[k] !== 'boolean') {
          fail('invalid_settings', `Trường ${k} phải là boolean`, HttpStatus.BAD_REQUEST);
        }
        patch[`comments.${k}`] = input[k] ? 'true' : 'false';
      }
    }
    if (input.moderationMode !== undefined) {
      if (input.moderationMode !== 'pre' && input.moderationMode !== 'post') {
        fail('invalid_settings', 'moderationMode phải là pre hoặc post', HttpStatus.BAD_REQUEST);
      }
      patch['comments.moderationMode'] = input.moderationMode as string;
    }
    const intKeys = ['maxLength', 'dailyLimit', 'ipDailyLimit', 'ipBurstLimit'] as const;
    for (const k of intKeys) {
      if (input[k] !== undefined) {
        const n = Number(input[k]);
        if (!Number.isInteger(n) || n < 0) {
          fail('invalid_settings', `Trường ${k} phải là số nguyên >= 0`, HttpStatus.BAD_REQUEST);
        }
        patch[`comments.${k}`] = String(n);
      }
    }
    if (Object.keys(patch).length) {
      await (this.prisma as any).$transaction(async (tx: any) => {
        for (const [key, value] of Object.entries(patch)) {
          await tx.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
        }
        await this.audit(tx, adminId, 'update_settings', 'comments', null, null, patch);
      });
    }
    return this.getSettingsAdmin();
  }

  // --- Don IP/User-Agent binh luan cu (§6.2, endpoint noi bo cho worker) ---
  // Worker khong co Prisma/pg nen goi backend qua HTTP (xem
  // comments-internal.controller.ts). Cutoff do worker tinh (12 thang
  // = 365 ngay) va gui kem — backend chi ap dung, khong tu tinh lai.
  async listStaleCommentMeta(cutoff: Date) {
    return this.commentsDb.findMany({
      where: { createdAt: { lt: cutoff }, ip: { not: null } },
      select: { id: true, createdAt: true, ip: true, userAgent: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
  }

  async clearCommentMeta(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    const res = await this.commentsDb.updateMany({
      where: { id: { in: ids }, ip: { not: null } },
      data: { ip: null, userAgent: null },
    });
    return res?.count ?? 0;
  }
}
