// Bai bao in: ban sao noi dung cua 1 bai bao dien tu, chuyen sang muc
// Bao in de duyet LAI theo quy trinh bao in (KTV -> MD -> T.PP ->
// P.TBT -> TBT). TBT duyet xong -> 'approved' ("Da duyet, cho dan
// trang"); KHONG co xuat ban cong khai, KHONG co API public — day la
// nguyen lieu noi bo cho to dan trang, khong phai noi dung web.
// Khuon theo NewsService (lich su duyet ASC, giai ten actor, tach nhiem
// vu ap dung ca toan quyen, tra lai bat buoc co ly do).
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { slugify, type Actor } from '../news/news.service';
import {
  PRINT_ARTICLE_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, checkSeparationOfDuties, stepLabel, transition,
} from './print-article-workflow';

@Injectable()
export class PrintArticleService {
  constructor(private readonly prisma: PrismaService) {}

  private newPublicId(): string {
    return randomBytes(12).toString('hex');
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = slugify(base) || 'bai-bao-in';
    let n = 2;
    while (true) {
      const row = await this.prisma.printArticle.findUnique({ where: { slug } });
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(base) || 'bai-bao-in'}-${n++}`;
    }
  }

  /** Kiem tra chuyen muc (nhan ca id noi bo lan publicId, khuon news):
   *  undefined/null -> null; khong ton tai -> 400. */
  private async checkCategory(categoryId: string | null | undefined) {
    if (categoryId === undefined || categoryId === null || categoryId === '') return null;
    const cat = await this.prisma.newsCategory.findFirst({
      where: { OR: [{ id: categoryId }, { publicId: categoryId }] },
    });
    if (!cat) throw new BadRequestException('chuyen muc khong ton tai');
    return cat.id;
  }

  /** Chuan hoa authors/tags: nhan mang (tu CMS) hoac chuoi phan tach
   *  bang dau phay; loai khoang trang/thua. */
  private toStringArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    if (typeof v === 'string') return v.split(',').map((x) => x.trim()).filter(Boolean);
    return [];
  }

  private validateManualInput(title: string | undefined, sapo: string | undefined) {
    if (title !== undefined && !title.trim()) throw new BadRequestException('tieu de bat buoc');
    if (sapo !== undefined && sapo.length > 500) throw new BadRequestException('sapo toi da 500 ky tu');
  }

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

  private async resolveCategories(categoryIds: (string | null | undefined)[]) {
    const ids = [...new Set(categoryIds.filter((x): x is string => !!x))];
    const map = new Map<string, any>();
    if (!ids.length) return map;
    const cats = await this.prisma.newsCategory.findMany({ where: { id: { in: ids } } });
    for (const c of cats) map.set(c.id, { publicId: c.publicId, name: c.name, slug: c.slug });
    return map;
  }

  private toItem(row: any, cats?: Map<string, any>) {
    return {
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      slug: row.slug,
      sapo: row.sapo,
      body: row.body,
      categoryId: row.categoryId,
      category: row.categoryId && cats?.get(row.categoryId) ? cats.get(row.categoryId) : null,
      coverPath: row.coverPath,
      authors: row.authors || [],
      tags: row.tags || [],
      sourceNewsPublicId: row.sourceNewsPublicId,
      sourceNewsSlug: row.sourceNewsSlug,
      status: row.status,
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: PRINT_ARTICLE_WORKFLOW_STEPS.length,
      lastApproval: (row as any).lastApproval || null,
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

  private async attachLastApprovals(rows: any[]) {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const all = await this.prisma.printArticleApproval.findMany({
      where: { articleId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstByArticle = new Map<string, any>();
    for (const a of all) if (!firstByArticle.has(a.articleId)) firstByArticle.set(a.articleId, a);
    const names = await this.resolveActorNames(all.map((a: any) => a.actorId));
    return rows.map((r) => ({ ...r, lastApproval: firstByArticle.has(r.id) ? this.toApproval(firstByArticle.get(r.id), names) : null }));
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(articleId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.printArticleApproval.create({
      data: { articleId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null },
    });
  }

  private async workflowRow(publicId: string) {
    const row = await this.prisma.printArticle.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay bai bao in');
    return row;
  }

  // ---------------- Chuyen doi tu bai bao dien tu ----------------

  /** Tao 1 bai bao in copy nguyen noi dung tu bai bao dien tu goc.
   *  Chan trung: 1 bai goc chi co toi da 1 bai bao in (409 kem
   *  slug/publicId/title bai cu, khuon 1C). Bai moi luon o 'draft'
   *  de to bao in tu chay quy trinh cua ho tu dau. */
  async fromNews(newsPublicId: string, actor: Actor) {
    if (!newsPublicId || typeof newsPublicId !== 'string') throw new BadRequestException('thieu publicId bai bao dien tu');
    const src = await this.prisma.newsArticle.findUnique({ where: { publicId: newsPublicId } });
    if (!src) throw new NotFoundException('khong tim thay bai bao dien tu');
    const dup = await this.prisma.printArticle.findUnique({ where: { sourceNewsPublicId: newsPublicId } });
    if (dup) {
      throw new ConflictException({
        message: 'da co bai bao in tu bai nay',
        slug: dup.slug,
        publicId: dup.publicId,
        title: dup.title,
      });
    }
    let categoryId: string | null = src.categoryId;
    if (categoryId) {
      const cat = await this.prisma.newsCategory.findUnique({ where: { id: categoryId } });
      if (!cat) categoryId = null;
    }
    const row = await this.prisma.printArticle.create({
      data: {
        publicId: this.newPublicId(),
        title: src.title,
        slug: await this.uniqueSlug(src.title),
        sapo: src.sapo || '',
        body: src.body || '',
        categoryId,
        coverPath: src.coverPath,
        authors: src.authors || [],
        tags: src.tags || [],
        sourceNewsPublicId: src.publicId,
        sourceNewsSlug: src.slug,
        status: 'draft',
        workflowStep: 0,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
    });
    const cats = await this.resolveCategories([row.categoryId]);
    return this.toItem(row, cats);
  }

  // ---------------- Tao tay + sua (khong qua chuyen doi) ----------------

  /** Tao bai bao in bang tay (khong co bai goc). Ban moi luon o 'draft'.
   *  Luu y schema: sourceNewsPublicId la String @unique KHONG nullable
   *  (khong duoc doi schema trong goi nay) nen bai tao tay dung gia tri
   *  danh dau duy nhat `manual:<publicId>` — khong bao gio trung voi
   *  publicId 24-hex cua bai that, chan trung chuyen doi van giu nguyen;
   *  sourceNewsSlug rong de CMS hien '—'. */
  async createManual(input: any, actor: Actor) {
    if (!input.title || !String(input.title).trim()) throw new BadRequestException('tieu de bat buoc');
    this.validateManualInput(input.title, input.sapo);
    const categoryId = await this.checkCategory(input.categoryId);
    const publicId = this.newPublicId();
    const row = await this.prisma.printArticle.create({
      data: {
        publicId,
        title: String(input.title).trim(),
        slug: await this.uniqueSlug(input.slug?.trim() ? input.slug : input.title),
        sapo: input.sapo || '',
        body: input.body || '',
        categoryId,
        coverPath: input.coverPath?.trim() ? input.coverPath : null,
        authors: this.toStringArray(input.authors),
        tags: this.toStringArray(input.tags),
        sourceNewsPublicId: `manual:${publicId}`,
        sourceNewsSlug: '',
        status: 'draft',
        workflowStep: 0,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
    });
    const cats = await this.resolveCategories([row.categoryId]);
    return this.toItem(row, cats);
  }

  /** Sua bai bao in. LUAT KHA DUNG (chat hon news): CHI bai nhap moi
   *  sua duoc. News patch khong chan trang thai nao (sua duoc ca khi
   *  dang cho duyet/da xuat ban), nhung voi bao in thi sua giua chung
   *  duyet se lam mat hieu luc cac buoc da duyet, sua sau khi duyet xong
   *  se lam sai nguyen lieu dan trang — nen pending_review va approved
   *  deu bi chan 409, muon sua phai tra lai ve nhap truoc. */
  async patchArticle(publicId: string, input: any, actor: Actor) {
    const row = await this.workflowRow(publicId);
    if (row.status === 'pending_review') {
      throw new ConflictException('bai dang cho duyet, hay tra lai ve nhap truoc khi sua');
    }
    if (row.status === 'approved') {
      throw new ConflictException('bai da duyet, cho dan trang, khong sua duoc');
    }
    this.validateManualInput(input.title, input.sapo);
    const data: any = { updatedBy: actor.username, updatedByRole: actor.roleName };
    if (input.title !== undefined) data.title = String(input.title).trim();
    if (input.slug !== undefined || input.title !== undefined) {
      const next = await this.uniqueSlug(
        input.slug?.trim() ? input.slug : input.title ?? row.title, row.id,
      );
      if (next !== row.slug) data.slug = next;
    }
    if (input.sapo !== undefined) data.sapo = input.sapo;
    if (input.body !== undefined) data.body = input.body;
    if (input.categoryId !== undefined) data.categoryId = await this.checkCategory(input.categoryId);
    if (input.coverPath !== undefined) data.coverPath = input.coverPath?.trim() ? input.coverPath : null;
    if (input.authors !== undefined) data.authors = this.toStringArray(input.authors);
    if (input.tags !== undefined) data.tags = this.toStringArray(input.tags);
    const updated = await this.prisma.printArticle.update({ where: { id: row.id }, data });
    const cats = await this.resolveCategories([updated.categoryId]);
    return this.toItem(updated, cats);
  }

  // ---------------- Admin: danh sach / chi tiet ----------------

  async listAdmin(params: { q?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, parseInt(String(params.page ?? 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(params.limit ?? 20), 10) || 20));
    const where: any = {};
    if (params.q?.trim()) where.title = { contains: params.q.trim(), mode: 'insensitive' };
    if (params.status) where.status = params.status;
    const [rows, total] = await Promise.all([
      this.prisma.printArticle.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.printArticle.count({ where }),
    ]);
    const cats = await this.resolveCategories(rows.map((r) => r.categoryId));
    const withApprovals = await this.attachLastApprovals(rows);
    return { data: withApprovals.map((r) => this.toItem(r, cats)), total, page, limit };
  }

  async getAdmin(publicId: string) {
    const row = await this.workflowRow(publicId);
    const cats = await this.resolveCategories([row.categoryId]);
    const withApprovals = await this.attachLastApprovals([row]);
    return this.toItem(withApprovals[0], cats);
  }

  // ---------------- Quy trinh duyet (xem print-article-workflow.ts) ----------------

  async submitForReview(publicId: string, actor: Actor) {
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.printArticle.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actor.id, actor.roleName, 'submit', null);
    const cats = await this.resolveCategories([updated.categoryId]);
    return this.toItem(updated, cats);
  }

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string }) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${PRINT_ARTICLE_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau
    // cua cung mot bai. Ap dung cho ca toan quyen — truong hop ngoai le
    // tin nong phai di qua co breakingNews va duoc ghi log ro rang.
    const prev = await this.prisma.printArticleApproval.findFirst({
      where: { articleId: row.id }, orderBy: { createdAt: 'desc' },
    });
    const sod = checkSeparationOfDuties(prev?.actorId || null, actor.id, !!opts?.breakingNews);
    if (!sod.allowed) {
      throw new ForbiddenException('tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua cung mot bai; dung ngoai le tin nong neu can');
    }
    const next = this.applyTransition(row, 'approve');
    const updated = await this.prisma.printArticle.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, step, actor.id, actor.roleName, 'approve', null,
      sod.isException ? { isException: true, exceptionReason: (opts?.breakingNewsReason || '').trim() || null } : undefined);
    const cats = await this.resolveCategories([updated.categoryId]);
    return this.toItem(updated, cats);
  }

  async returnArticle(publicId: string, actor: Actor, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'return');
    const updated = await this.prisma.printArticle.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, row.workflowStep ?? 0, actor.id, actor.roleName, 'return', String(reason).trim());
    const cats = await this.resolveCategories([updated.categoryId]);
    return this.toItem(updated, cats);
  }

  async listApprovals(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.printArticleApproval.findMany({
      where: { articleId: row.id }, orderBy: { createdAt: 'asc' },
    });
    const names = await this.resolveActorNames(rows.map((r) => r.actorId));
    return { data: rows.map((r) => this.toApproval(r, names)) };
  }

  /** Chi bai nhap moi xoa duoc. Bai dang cho duyet hay da duyet deu
   *  khong xoa (bai da duyet la nguyen lieu cho dan trang). */
  async remove(publicId: string) {
    const row = await this.workflowRow(publicId);
    if (row.status === 'pending_review') {
      throw new ConflictException('bai dang cho duyet, hay tra lai hoac duyet xong truoc khi xoa');
    }
    if (row.status === 'approved') {
      throw new ConflictException('bai da duyet, cho dan trang, khong xoa duoc');
    }
    await this.prisma.printArticle.delete({ where: { id: row.id } });
    return { ok: true };
  }
}
