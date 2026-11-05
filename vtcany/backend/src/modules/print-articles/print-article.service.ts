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
import { applyDrillWhere } from '../dashboard/dashboard-queries';
import { applyNarrowScope, myStepNumbers } from '../dashboard/sidebar-scope';
import { clearSidebarCounts } from '../dashboard/sidebar-counts-cache';
import { slugify, type Actor } from '../news/news.service';
import {
  WORKFLOW_ACTION_LABELS,
} from './print-article-workflow';
import { WorkflowConfigService } from '../workflows/workflow-config.service';
import { ENFORCE_SEPARATION_OF_DUTIES, evaluateSoD } from '../workflows/sod';
import { pvEditCheck } from '../auth/author-edit-guard';

@Injectable()
export class PrintArticleService {
  constructor(private readonly prisma: PrismaService, private readonly wf: WorkflowConfigService) {}

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
      workflowStepLabel: this.wf.stepLabel('print-article', row.workflowStep ?? 0),
      workflowTotalSteps: this.wf.totalSteps('print-article'),
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

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'emergency-approve') {
    try {
      return this.wf.transition('print-article', { status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(articleId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.printArticleApproval.create({
      data: { articleId, step, stepLabel: this.wf.stepLabel('print-article', step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null },
    });
    clearSidebarCounts(actorId);
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
    clearSidebarCounts(actor.id);
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
    clearSidebarCounts(actor.id);
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
    // Gioi han sua cua PV: chi bai do minh tao, o trang thai nhap.
    // (Chan trang thai pending_review/approved da co san cho moi role.)
    const pvBlock = pvEditCheck(row, actor);
    if (pvBlock) throw new ForbiddenException(pvBlock);
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

  async listAdmin(params: { q?: string; status?: string; page?: number; limit?: number; workflowStep?: string; myQueue?: string; mine?: string; returned?: string; neverSubmitted?: string; actorId?: string | null; actorRoleName?: string | null; actorIsFullAdmin?: boolean }) {
    const page = Math.max(1, parseInt(String(params.page ?? 1), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(params.limit ?? 20), 10) || 20));
    let where: any = {};
    if (params.q?.trim()) where.title = { contains: params.q.trim(), mode: 'insensitive' };
    if (params.status) where.status = params.status;
    // Drill myQueue: truyen roleNames cua buoc hien tai de vong lap cung
    // role van thay duoc muc trong list (khop widget A1). Khong co buoc
    // hop le thi giu dinh nghia chat cu.
    const drillParams: any = { ...params };
    if (params.myQueue && params.workflowStep) {
      const step = parseInt(String(params.workflowStep), 10);
      const st = Number.isInteger(step) && step > 0 ? this.wf.steps('print-article')[step - 1] : undefined;
      if (st) drillParams.stepRoleNames = st.roleNames?.length ? st.roleNames : [st.roleName];
    }
    await applyDrillWhere(this.prisma, 'printArticle', 'printArticleApproval', 'articleId', where, drillParams, params.actorId);
    // Gioi han pham vi dot 2 cho role hep (chi draft / pending_review),
    // ap SAU drill de AND voi where drill (returned -> nhap bi tra cua
    // minh). Drill myQueue / theo buoc duoc loai tru trong helper.
    where = applyNarrowScope(where, {
      status: params.status, myQueue: params.myQueue, workflowStep: params.workflowStep,
      mine: params.mine, returned: params.returned, neverSubmitted: params.neverSubmitted,
      actor: { id: params.actorId ?? null, roleName: params.actorRoleName ?? null, isFullAdmin: !!params.actorIsFullAdmin },
      mySteps: myStepNumbers(this.wf.steps('print-article'), params.actorRoleName ?? null),
    });
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

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string; emergency?: boolean; emergencyReason?: string }) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    const curStep = this.wf.steps('print-article')[step - 1];
    const curRoles = curStep ? (curStep.roleNames?.length ? curStep.roleNames : [curStep.roleName]) : [];
    if (!this.wf.canApprove('print-article', actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${this.wf.stepLabel('print-article', step) || '?'}) chi vai ${curRoles.join(' / ') || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu (luat 11.2) — CHI ap khi cong tac BAT (trien khai
    // that). Cong tac TAT (ban demo): chi con cong Role o tren, full-admin
    // duyet moi buoc ke ca bai tu tao hoac da duyet truoc do.
    // Luat 11.2 xet TAT CA approval truoc do (khong chi buoc lien truoc):
    // chan tac gia tu duyet, chan nguoi da xu ly buoc truoc co role khac
    // buoc hien tai; cho vong lap cung role (T.PP lan 1 -> lan 2,
    // P.TBT lan 1 -> lan 2, P.TBT -> buoc cuoi {TBT, P.TBT}).
    let sodIsException = false;
    if (ENFORCE_SEPARATION_OF_DUTIES) {
      const priors = await this.prisma.printArticleApproval.findMany({
        where: { articleId: row.id },
        select: { actorId: true, actorRole: true, action: true },
      });
      const sod = evaluateSoD({
        creatorId: (row as any).createdBy ?? null,
        actorId: actor.id,
        prior: priors,
        currentRoleNames: curRoles,
        breakingNews: !!opts?.breakingNews,
      });
      if (!sod.allowed) {
        throw new ForbiddenException(`tach nhiem vu: ${sod.reason || 'nguoi duyet da xu ly buoc truoc khong cung role'}; dung ngoai le tin nong neu can`);
      }
      sodIsException = sod.isException;
    }
    // Duyet khan: chi buoc co allowEmergency=true moi duoc chon; duyet
    // khan ket thuc luong ngay (xuat ban / approved), ghi lich su ngoai le
    // kem ly do khan bat buoc. Tach nhiem vu van ap dung nhu duyet thuong.
    let next;
    let emergencyReason: string | null = null;
    if (opts?.emergency) {
      emergencyReason = (opts.emergencyReason || '').trim();
      if (!emergencyReason) throw new BadRequestException('duyet khan bat buoc co ly do');
      if (!this.wf.stepAllowsEmergency('print-article', step)) throw new ForbiddenException('buoc nay khong cho phep duyet khan');
      next = this.applyTransition(row, 'emergency-approve');
    } else {
      next = this.applyTransition(row, 'approve');
    }
    const updated = await this.prisma.printArticle.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, step, actor.id, actor.roleName, 'approve', null,
      (sodIsException || !!opts?.emergency) ? { isException: true, exceptionReason: emergencyReason || (opts?.breakingNewsReason || '').trim() || null } : undefined);
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
