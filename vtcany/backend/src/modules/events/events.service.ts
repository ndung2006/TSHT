import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  EVENT_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, checkSeparationOfDuties, stepLabel, transition,
} from './events-workflow';

/** Slug tieng Viet: bo dau, 'd' -> 'd', ky tu la -> '-'. Sao khuon news.service.ts. */
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

export interface EventInput {
  title: string;
  slug?: string;
  description?: string;
  coverPath?: string | null;
  categoryId?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  publishAt?: string | null;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  private newPublicId(): string {
    return randomBytes(12).toString('hex');
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = slugify(base) || 'su-kien';
    let n = 2;
    while (true) {
      const row = await this.prisma.newsroomEvent.findUnique({ where: { slug } });
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(base) || 'su-kien'}-${n++}`;
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
      categoryId: row.categoryId,
      category: row.category ? { publicId: row.category.publicId, name: row.category.name, slug: row.category.slug } : null,
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      status: row.status,
      // Quy trinh duyet (xem events-workflow.ts). lastApproval do listAdmin gan them.
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: EVENT_WORKFLOW_STEPS.length,
      lastApproval: (row as any).lastApproval || null,
      publishAt: row.publishAt ? row.publishAt.toISOString() : null,
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
    const all = await this.prisma.newsroomEventApproval.findMany({
      where: { eventId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstByEvent = new Map<string, any>();
    for (const a of all) if (!firstByEvent.has(a.eventId)) firstByEvent.set(a.eventId, a);
    return rows.map((r) => ({ ...r, lastApproval: firstByEvent.has(r.id) ? this.toApproval(firstByEvent.get(r.id)) : null }));
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(eventId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.newsroomEventApproval.create({
      data: { eventId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null },
    });
  }

  private async workflowRow(publicId: string) {
    const row = await this.prisma.newsroomEvent.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay su kien');
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
      category: row.category ? { publicId: row.category.publicId, name: row.category.name, slug: row.category.slug } : null,
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      publishAt: row.publishAt ? row.publishAt.toISOString() : null,
    };
  }

  private validateInput(input: EventInput) {
    if (!input.title || !input.title.trim()) throw new BadRequestException('tieu de bat buoc');
    if (input.startsAt && input.endsAt) {
      const s = new Date(input.startsAt).getTime();
      const e = new Date(input.endsAt).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
        throw new BadRequestException('thoi gian ket thuc khong duoc truoc thoi gian bat dau');
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

  // ---------------- Admin: su kien ----------------

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
        { description: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.newsroomEvent.count({ where }),
      this.prisma.newsroomEvent.findMany({
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
    const row = await this.prisma.newsroomEvent.findUnique({ where: { publicId }, include: { category: true } });
    if (!row) throw new NotFoundException('khong tim thay su kien');
    return this.toItem(row);
  }

  async create(input: EventInput, actor: Actor) {
    this.validateInput(input);
    const categoryId = await this.checkCategory(input.categoryId);
    const slug = await this.uniqueSlug(input.slug?.trim() ? input.slug : input.title);
    const row = await this.prisma.newsroomEvent.create({
      data: {
        publicId: this.newPublicId(),
        title: input.title.trim(),
        slug,
        description: input.description || '',
        coverPath: input.coverPath || null,
        categoryId,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: 'draft',
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
      include: { category: true },
    });
    return this.toItem(row);
  }

  async patch(publicId: string, input: Partial<EventInput>, actor: Actor) {
    const row = await this.prisma.newsroomEvent.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay su kien');
    this.validateInput({
      title: input.title ?? row.title,
      startsAt: input.startsAt !== undefined ? input.startsAt : (row.startsAt ? row.startsAt.toISOString() : null),
      endsAt: input.endsAt !== undefined ? input.endsAt : (row.endsAt ? row.endsAt.toISOString() : null),
    });
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
    if (input.categoryId !== undefined) data.categoryId = await this.checkCategory(input.categoryId);
    if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.publishAt !== undefined) data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
    const out = await this.prisma.newsroomEvent.update({
      where: { id: row.id },
      data,
      include: { category: true },
    });
    return this.toItem(out);
  }

  /** Xoa chi su kien nhap hoac da ha xuat ban (dang xuat ban phai go xuong truoc, dang cho duyet phai tra lai hoac duyet xong). */
  async remove(publicId: string) {
    const row = await this.prisma.newsroomEvent.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay su kien');
    if (row.status === 'published') {
      throw new ConflictException('su kien dang xuat ban, hay go xuong truoc khi xoa');
    }
    if (row.status === 'pending_review') {
      throw new ConflictException('su kien dang cho duyet, hay tra lai hoac duyet xong truoc khi xoa');
    }
    await this.prisma.newsroomEvent.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- Quy trinh duyet (xem events-workflow.ts) ----------------

  async submitForReview(publicId: string, actor: Actor) {
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.newsroomEvent.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actor.id, actor.roleName, 'submit', null);
    return this.toItem(updated);
  }

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string }) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${EVENT_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc hien tai
    // cua cung mot su kien. Ap dung cho ca toan quyen — truong hop ngoai
    // le tin nong phai di qua co breakingNews va duoc ghi log ro rang.
    const prev = await this.prisma.newsroomEventApproval.findFirst({
      where: { eventId: row.id }, orderBy: { createdAt: 'desc' },
    });
    const sod = checkSeparationOfDuties(prev?.actorId || null, actor.id, !!opts?.breakingNews);
    if (!sod.allowed) {
      throw new ForbiddenException('tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua cung mot su kien; dung ngoai le tin nong neu can');
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'published';
    const updated = await this.prisma.newsroomEvent.update({
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

  async returnEvent(publicId: string, actor: Actor, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'return');
    const updated = await this.prisma.newsroomEvent.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, row.workflowStep ?? 0, actor.id, actor.roleName, 'return', String(reason).trim());
    return this.toItem(updated);
  }

  async listApprovals(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.newsroomEventApproval.findMany({
      where: { eventId: row.id }, orderBy: { createdAt: 'asc' },
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
    const row = await this.prisma.newsroomEvent.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay su kien');
    if (publish && row.status === 'published') return this.toItem(row);
    if (!publish && row.status !== 'published') return this.toItem(row);
    if (publish && row.status === 'pending_review') {
      if (!isFullAdmin && (row.workflowStep ?? 0) !== EVENT_WORKFLOW_STEPS.length) {
        throw new ConflictException(`su kien dang cho duyet buoc ${row.workflowStep}/${EVENT_WORKFLOW_STEPS.length}, phai duyet xong moi xuat ban duoc`);
      }
      if (!isFullAdmin && !canApproveStep(actor.roleName, false, row.workflowStep ?? 0)) {
        throw new ForbiddenException('chi vai duyet buoc cuoi hoac toan quyen moi xuat ban su kien dang cho duyet');
      }
    }
    if (publish && row.status === 'draft' && !isFullAdmin) {
      throw new ConflictException('su kien nhap phai gui duyet truoc, chi toan quyen moi xuat ban truc tiep duoc');
    }
    const out = await this.prisma.newsroomEvent.update({
      where: { id: row.id },
      data: publish
        ? { status: 'published', workflowStep: 0, publishAt: publishAt ? new Date(publishAt) : row.publishAt || new Date(), updatedBy: actor.username, updatedByRole: actor.roleName }
        : { status: 'unpublished', workflowStep: 0, updatedBy: actor.username, updatedByRole: actor.roleName },
      include: { category: true },
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
      this.prisma.newsroomEvent.count({ where }),
      this.prisma.newsroomEvent.findMany({
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
    const row = await this.prisma.newsroomEvent.findUnique({ where: { slug }, include: { category: true } });
    if (!row || row.status !== 'published' || !row.publishAt || row.publishAt > new Date()) {
      throw new NotFoundException('khong tim thay su kien');
    }
    return this.toPublicItem(row);
  }
}
