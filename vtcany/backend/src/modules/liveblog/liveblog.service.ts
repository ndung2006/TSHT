import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LIVEBLOG_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, checkSeparationOfDuties, stepLabel, transition,
} from './liveblog-workflow';

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

export interface LiveblogInput {
  title: string;
  slug?: string;
  description?: string;
  coverPath?: string | null;
  // Su kien toa soan gan kem (publicId hoac id noi bo); null = liveblog
  // doc lap (eventId NULLABLE — chot thiet ke 29/10/2026).
  eventId?: string | null;
  publishAt?: string | null;
}

export interface EntryInput {
  body?: string;
  mediaPath?: string | null;
  isPinned?: boolean;
}

@Injectable()
export class LiveblogService {
  constructor(private readonly prisma: PrismaService) {}

  private newPublicId(): string {
    return randomBytes(12).toString('hex');
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = slugify(base) || 'tuong-thuat';
    let n = 2;
    while (true) {
      const row = await this.prisma.liveblog.findUnique({ where: { slug } });
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(base) || 'tuong-thuat'}-${n++}`;
    }
  }

  private toItem(row: any) {
    return {
      id: row.id,
      publicId: row.publicId,
      title: row.title,
      slug: row.slug,
      description: row.description,
      coverPath: row.coverPath,
      eventId: row.eventId,
      event: row.event ? { publicId: row.event.publicId, title: row.event.title, slug: row.event.slug } : null,
      status: row.status,
      // Quy trinh duyet (xem liveblog-workflow.ts). lastApproval do listAdmin gan them.
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: LIVEBLOG_WORKFLOW_STEPS.length,
      lastApproval: (row as any).lastApproval || null,
      publishAt: row.publishAt ? row.publishAt.toISOString() : null,
      updatedBy: row.updatedBy,
      updatedByRole: row.updatedByRole,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private toEntry(row: any) {
    return {
      id: row.id,
      liveblogId: row.liveblogId,
      body: row.body,
      mediaPath: row.mediaPath,
      isPinned: row.isPinned ?? false,
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

  /** Gan lastApproval (dong duyet moi nhat) vao cac row cua 1 trang list. */
  private async attachLastApprovals(rows: any[]) {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const all = await this.prisma.liveblogApproval.findMany({
      where: { liveblogId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstByLiveblog = new Map<string, any>();
    for (const a of all) if (!firstByLiveblog.has(a.liveblogId)) firstByLiveblog.set(a.liveblogId, a);
    return rows.map((r) => ({ ...r, lastApproval: firstByLiveblog.has(r.id) ? this.toApproval(firstByLiveblog.get(r.id)) : null }));
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(liveblogId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.liveblogApproval.create({
      data: { liveblogId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null },
    });
  }

  private async workflowRow(publicId: string) {
    const row = await this.prisma.liveblog.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay liveblog');
    return row;
  }

  /** Ban cong khai: khong lo createdBy/updatedBy, khong lo ban chua xuat ban. */
  private toPublicItem(row: any) {
    return {
      publicId: row.publicId,
      title: row.title,
      slug: row.slug,
      description: row.description,
      coverPath: row.coverPath,
      event: row.event ? { publicId: row.event.publicId, title: row.event.title, slug: row.event.slug } : null,
      publishAt: row.publishAt ? row.publishAt.toISOString() : null,
    };
  }

  private toPublicEntry(row: any) {
    return {
      id: row.id,
      body: row.body,
      mediaPath: row.mediaPath,
      isPinned: row.isPinned ?? false,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private validateInput(input: LiveblogInput) {
    if (!input.title || !input.title.trim()) throw new BadRequestException('tieu de bat buoc');
  }

  /** Giai quyet su kien gan kem: chap nhan id noi bo hoac publicId; null/undefined = doc lap. */
  private async checkEvent(eventId: string | null | undefined) {
    if (eventId === undefined || eventId === null) return null;
    const ev = await this.prisma.newsroomEvent.findFirst({
      where: { OR: [{ id: eventId }, { publicId: eventId }] },
    });
    if (!ev) throw new BadRequestException('su kien khong ton tai');
    return ev.id;
  }

  // ---------------- Admin: liveblog ----------------

  async listAdmin(params: { q?: string; status?: string; eventId?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.eventId) {
      const ev = await this.prisma.newsroomEvent.findFirst({
        where: { OR: [{ id: params.eventId }, { publicId: params.eventId }] },
      });
      if (ev) where.eventId = ev.id;
      else where.eventId = '__none__';
    }
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.liveblog.count({ where }),
      this.prisma.liveblog.findMany({
        where,
        include: { event: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const withApprovals = await this.attachLastApprovals(rows);
    return { data: withApprovals.map((r) => this.toItem(r)), total, page, limit };
  }

  async getAdmin(publicId: string) {
    const row = await this.prisma.liveblog.findUnique({ where: { publicId }, include: { event: true } });
    if (!row) throw new NotFoundException('khong tim thay liveblog');
    return this.toItem(row);
  }

  async create(input: LiveblogInput, actor: Actor) {
    this.validateInput(input);
    const eventId = await this.checkEvent(input.eventId);
    const slug = await this.uniqueSlug(input.slug?.trim() ? input.slug : input.title);
    const row = await this.prisma.liveblog.create({
      data: {
        publicId: this.newPublicId(),
        title: input.title.trim(),
        slug,
        description: input.description || '',
        coverPath: input.coverPath || null,
        eventId,
        status: 'draft',
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
      include: { event: true },
    });
    return this.toItem(row);
  }

  async patch(publicId: string, input: Partial<LiveblogInput>, actor: Actor) {
    const row = await this.prisma.liveblog.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay liveblog');
    this.validateInput({ title: input.title ?? row.title });
    const data: any = { updatedBy: actor.username, updatedByRole: actor.roleName };
    if (input.title !== undefined) data.title = input.title.trim();
    if (input.slug !== undefined || input.title !== undefined) {
      data.slug = await this.uniqueSlug(
        input.slug?.trim() ? input.slug : input.title ?? row.title,
        row.id,
      );
    }
    if (input.description !== undefined) data.description = input.description;
    if (input.coverPath !== undefined) data.coverPath = input.coverPath || null;
    if (input.eventId !== undefined) data.eventId = await this.checkEvent(input.eventId);
    if (input.publishAt !== undefined) data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
    const out = await this.prisma.liveblog.update({
      where: { id: row.id },
      data,
      include: { event: true },
    });
    return this.toItem(out);
  }

  /** Xoa chi liveblog nhap hoac da ha xuat ban (entries di theo Cascade). */
  async remove(publicId: string) {
    const row = await this.prisma.liveblog.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay liveblog');
    if (row.status === 'published') {
      throw new ConflictException('liveblog dang xuat ban, hay go xuong truoc khi xoa');
    }
    if (row.status === 'pending_review') {
      throw new ConflictException('liveblog dang cho duyet, hay tra lai hoac duyet xong truoc khi xoa');
    }
    await this.prisma.liveblog.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- Dong tuong thuat (entries) ----------------
  // Entry khong duyet rieng; them/sua/xoa nam trong vong doi cua liveblog
  // (ca khi nhap, cho duyet va da xuat ban — dang truc tiep thi cap nhat
  // lien tuc). Thu tu timeline = createdAt ASC.

  async listEntries(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.liveblogEntry.findMany({
      where: { liveblogId: row.id }, orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map((r) => this.toEntry(r)) };
  }

  async createEntry(publicId: string, input: EntryInput, actor: Actor) {
    const row = await this.workflowRow(publicId);
    if (!input.body || !input.body.trim()) throw new BadRequestException('noi dung dong tuong thuat bat buoc');
    const entry = await this.prisma.liveblogEntry.create({
      data: {
        liveblogId: row.id,
        body: input.body,
        mediaPath: input.mediaPath || null,
        isPinned: !!input.isPinned,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
    });
    return this.toEntry(entry);
  }

  async patchEntry(publicId: string, entryId: string, input: EntryInput, actor: Actor) {
    const row = await this.workflowRow(publicId);
    const entry = await this.prisma.liveblogEntry.findFirst({ where: { id: entryId, liveblogId: row.id } });
    if (!entry) throw new NotFoundException('khong tim thay dong tuong thuat');
    if (input.body !== undefined && !input.body.trim()) throw new BadRequestException('noi dung dong tuong thuat bat buoc');
    const data: any = { updatedBy: actor.username, updatedByRole: actor.roleName };
    if (input.body !== undefined) data.body = input.body;
    if (input.mediaPath !== undefined) data.mediaPath = input.mediaPath || null;
    if (input.isPinned !== undefined) data.isPinned = !!input.isPinned;
    const out = await this.prisma.liveblogEntry.update({ where: { id: entry.id }, data });
    return this.toEntry(out);
  }

  async removeEntry(publicId: string, entryId: string) {
    const row = await this.workflowRow(publicId);
    const entry = await this.prisma.liveblogEntry.findFirst({ where: { id: entryId, liveblogId: row.id } });
    if (!entry) throw new NotFoundException('khong tim thay dong tuong thuat');
    await this.prisma.liveblogEntry.delete({ where: { id: entry.id } });
    return { ok: true };
  }

  // ---------------- Quy trinh duyet (xem liveblog-workflow.ts) ----------------

  async submitForReview(publicId: string, actor: Actor) {
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.liveblog.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actor.id, actor.roleName, 'submit', null);
    return this.toItem(updated);
  }

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string }) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${LIVEBLOG_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc hien tai
    // cua cung mot liveblog. Ap dung cho ca toan quyen — ngoai le tin
    // nong phai di qua co breakingNews va duoc ghi log ro rang.
    const prev = await this.prisma.liveblogApproval.findFirst({
      where: { liveblogId: row.id }, orderBy: { createdAt: 'desc' },
    });
    const sod = checkSeparationOfDuties(prev?.actorId || null, actor.id, !!opts?.breakingNews);
    if (!sod.allowed) {
      throw new ForbiddenException('tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua cung mot liveblog; dung ngoai le tin nong neu can');
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'published';
    const updated = await this.prisma.liveblog.update({
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

  async returnLiveblog(publicId: string, actor: Actor, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'return');
    const updated = await this.prisma.liveblog.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, row.workflowStep ?? 0, actor.id, actor.roleName, 'return', String(reason).trim());
    return this.toItem(updated);
  }

  async listApprovals(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.liveblogApproval.findMany({
      where: { liveblogId: row.id }, orderBy: { createdAt: 'asc' },
    });
    const names = await this.resolveActorNames(rows.map((r) => r.actorId));
    return { data: rows.map((r) => this.toApproval(r, names)) };
  }

  /**
   * Xuat ban / go xuong, co gate quy trinh (giong news):
   * - Dang cho duyet: chi nguoi duyet buoc cuoi hoac toan quyen moi xuat ban tat.
   * - Nhap: phai gui duyet truoc; xuat ban truc tiep chi toan quyen.
   * - Da ha xuat ban: xuat ban lai truc tiep duoc.
   */
  async setPublished(publicId: string, publish: boolean, publishAt: string | null | undefined, actor: Actor, isFullAdmin = false) {
    const row = await this.prisma.liveblog.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay liveblog');
    if (publish && row.status === 'published') return this.toItem(row);
    if (!publish && row.status !== 'published') return this.toItem(row);
    if (publish && row.status === 'pending_review') {
      if (!isFullAdmin && (row.workflowStep ?? 0) !== LIVEBLOG_WORKFLOW_STEPS.length) {
        throw new ConflictException(`liveblog dang cho duyet buoc ${row.workflowStep}/${LIVEBLOG_WORKFLOW_STEPS.length}, phai duyet xong moi xuat ban duoc`);
      }
      if (!isFullAdmin && !canApproveStep(actor.roleName, false, row.workflowStep ?? 0)) {
        throw new ForbiddenException('chi vai duyet buoc cuoi hoac toan quyen moi xuat ban liveblog dang cho duyet');
      }
    }
    if (publish && row.status === 'draft' && !isFullAdmin) {
      throw new ConflictException('liveblog nhap phai gui duyet truoc, chi toan quyen moi xuat ban truc tiep duoc');
    }
    const out = await this.prisma.liveblog.update({
      where: { id: row.id },
      data: publish
        ? { status: 'published', workflowStep: 0, publishAt: publishAt ? new Date(publishAt) : row.publishAt || new Date(), updatedBy: actor.username, updatedByRole: actor.roleName }
        : { status: 'unpublished', workflowStep: 0, updatedBy: actor.username, updatedByRole: actor.roleName },
      include: { event: true },
    });
    await this.writeApproval(row.id, 0, actor.id, actor.roleName, publish ? 'publish' : 'unpublish', null);
    return this.toItem(out);
  }

  // ---------------- Cong khai ----------------

  private visibleWhere(now: Date) {
    return { status: 'published', publishAt: { lte: now } };
  }

  async listPublic(params: { q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where: any = this.visibleWhere(new Date());
    if (params.q) {
      where.OR = [
        { title: { contains: params.q, mode: 'insensitive' } },
        { description: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.liveblog.count({ where }),
      this.prisma.liveblog.findMany({
        where,
        include: { event: true },
        orderBy: { publishAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((r) => this.toPublicItem(r)), total, page, limit };
  }

  /** Chi tiet cong khai kem cac dong tuong thuat (timeline ASC). */
  async getPublic(slug: string) {
    const row = await this.prisma.liveblog.findUnique({
      where: { slug },
      include: { event: true, entries: { orderBy: { createdAt: 'asc' } } },
    });
    if (!row || row.status !== 'published' || !row.publishAt || row.publishAt > new Date()) {
      throw new NotFoundException('khong tim thay liveblog');
    }
    return { ...this.toPublicItem(row), entries: (row.entries || []).map((e: any) => this.toPublicEntry(e)) };
  }
}
