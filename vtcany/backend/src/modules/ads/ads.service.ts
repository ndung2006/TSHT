import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AD_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, checkSeparationOfDuties, stepLabel, transition,
} from './ads-workflow';

export interface Actor {
  id: string | null;
  username: string | null;
  roleName: string | null;
}

export interface AdInput {
  name: string;
  placement?: string;
  type?: string; // image | html
  imagePath?: string | null;
  linkUrl?: string | null;
  htmlContent?: string;
  sortOrder?: number;
  startsAt?: string | null;
  endsAt?: string | null;
  publishAt?: string | null;
}

export const AD_TYPES = ['image', 'html'] as const;

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  private newPublicId(): string {
    return randomBytes(12).toString('hex');
  }

  private toItem(row: any) {
    return {
      id: row.id,
      publicId: row.publicId,
      name: row.name,
      placement: row.placement,
      type: row.type,
      imagePath: row.imagePath,
      linkUrl: row.linkUrl,
      htmlContent: row.htmlContent,
      sortOrder: row.sortOrder ?? 0,
      startsAt: row.startsAt ? row.startsAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      status: row.status,
      // Quy trinh duyet (xem ads-workflow.ts). lastApproval do listAdmin gan them.
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: AD_WORKFLOW_STEPS.length,
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
    const all = await this.prisma.newsroomAdApproval.findMany({
      where: { adId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstByAd = new Map<string, any>();
    for (const a of all) if (!firstByAd.has(a.adId)) firstByAd.set(a.adId, a);
    return rows.map((r) => ({ ...r, lastApproval: firstByAd.has(r.id) ? this.toApproval(firstByAd.get(r.id)) : null }));
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  private async writeApproval(adId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null, extra?: { isException?: boolean; exceptionReason?: string | null }) {
    await this.prisma.newsroomAdApproval.create({
      data: { adId, step, stepLabel: stepLabel(step), actorId, actorRole, action, comment,
        isException: extra?.isException || false, exceptionReason: extra?.exceptionReason || null },
    });
  }

  private async workflowRow(publicId: string) {
    const row = await this.prisma.newsroomAd.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay quang cao');
    return row;
  }

  /** Ban cong khai: khong lo createdBy/updatedBy, khong lo ban chua xuat ban/het lich. */
  private toPublicItem(row: any) {
    return {
      publicId: row.publicId,
      name: row.name,
      placement: row.placement,
      type: row.type,
      imagePath: row.type === 'image' ? row.imagePath : null,
      linkUrl: row.type === 'image' ? row.linkUrl : null,
      // Ma HTML/JS chi tra cho quang cao loai html DA DUYET; phia hien
      // thi PHAI nhung trong iframe sandbox (xem thiet ke 2B quang cao).
      htmlContent: row.type === 'html' ? row.htmlContent : '',
      sortOrder: row.sortOrder ?? 0,
    };
  }

  private validateInput(input: AdInput) {
    if (!input.name || !input.name.trim()) throw new BadRequestException('ten quang cao bat buoc');
    const type = input.type || 'image';
    if (!AD_TYPES.includes(type as any)) throw new BadRequestException('loai quang cao khong hop le (image | html)');
    if (type === 'image' && !(input.imagePath || '').trim()) {
      throw new BadRequestException('quang cao anh bat buoc co anh');
    }
    if (type === 'html' && !(input.htmlContent || '').trim()) {
      throw new BadRequestException('quang cao HTML bat buoc co ma HTML/JS');
    }
    // Link dich chi nhan http(s): chan javascript:/data: chen vao trang portal.
    if (input.linkUrl && !/^https?:\/\//i.test(input.linkUrl.trim())) {
      throw new BadRequestException('link dich phai bat dau bang http:// hoac https://');
    }
    if (input.startsAt && input.endsAt) {
      const s = new Date(input.startsAt).getTime();
      const e = new Date(input.endsAt).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(e) && e < s) {
        throw new BadRequestException('thoi gian ket thuc khong duoc truoc thoi gian bat dau');
      }
    }
  }

  // ---------------- Admin: quang cao ----------------

  async listAdmin(params: { q?: string; status?: string; placement?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where: any = {};
    if (params.status) where.status = params.status;
    if (params.placement) where.placement = params.placement;
    if (params.q) {
      where.OR = [
        { name: { contains: params.q, mode: 'insensitive' } },
        { placement: { contains: params.q, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.newsroomAd.count({ where }),
      this.prisma.newsroomAd.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    const withApprovals = await this.attachLastApprovals(rows);
    return { data: withApprovals.map((r) => this.toItem(r)), total, page, limit };
  }

  async getAdmin(publicId: string) {
    const row = await this.prisma.newsroomAd.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay quang cao');
    return this.toItem(row);
  }

  async create(input: AdInput, actor: Actor) {
    this.validateInput(input);
    const row = await this.prisma.newsroomAd.create({
      data: {
        publicId: this.newPublicId(),
        name: input.name.trim(),
        placement: (input.placement || '').trim(),
        type: input.type || 'image',
        imagePath: input.imagePath || null,
        linkUrl: input.linkUrl?.trim() || null,
        htmlContent: input.htmlContent || '',
        sortOrder: Number.isFinite(input.sortOrder as number) ? Math.trunc(input.sortOrder as number) : 0,
        startsAt: input.startsAt ? new Date(input.startsAt) : null,
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        status: 'draft',
        publishAt: input.publishAt ? new Date(input.publishAt) : null,
        createdBy: actor.id,
        updatedBy: actor.username,
        updatedByRole: actor.roleName,
      },
    });
    return this.toItem(row);
  }

  async patch(publicId: string, input: Partial<AdInput>, actor: Actor) {
    const row = await this.prisma.newsroomAd.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay quang cao');
    this.validateInput({
      name: input.name ?? row.name,
      type: input.type ?? row.type,
      imagePath: input.imagePath !== undefined ? input.imagePath : row.imagePath,
      htmlContent: input.htmlContent !== undefined ? input.htmlContent : row.htmlContent,
      linkUrl: input.linkUrl !== undefined ? input.linkUrl : row.linkUrl,
      startsAt: input.startsAt !== undefined ? input.startsAt : (row.startsAt ? row.startsAt.toISOString() : null),
      endsAt: input.endsAt !== undefined ? input.endsAt : (row.endsAt ? row.endsAt.toISOString() : null),
    });
    const data: any = { updatedBy: actor.username, updatedByRole: actor.roleName };
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.placement !== undefined) data.placement = (input.placement || '').trim();
    if (input.type !== undefined) data.type = input.type;
    if (input.imagePath !== undefined) data.imagePath = input.imagePath || null;
    if (input.linkUrl !== undefined) data.linkUrl = input.linkUrl?.trim() || null;
    if (input.htmlContent !== undefined) data.htmlContent = input.htmlContent || '';
    if (input.sortOrder !== undefined && Number.isFinite(input.sortOrder as number)) data.sortOrder = Math.trunc(input.sortOrder as number);
    if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
    if (input.publishAt !== undefined) data.publishAt = input.publishAt ? new Date(input.publishAt) : null;
    const out = await this.prisma.newsroomAd.update({ where: { id: row.id }, data });
    return this.toItem(out);
  }

  /** Xoa chi quang cao nhap hoac da ha xuat ban (dang xuat ban phai go xuong truoc, dang cho duyet phai tra lai hoac duyet xong). */
  async remove(publicId: string) {
    const row = await this.prisma.newsroomAd.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay quang cao');
    if (row.status === 'published') {
      throw new ConflictException('quang cao dang xuat ban, hay go xuong truoc khi xoa');
    }
    if (row.status === 'pending_review') {
      throw new ConflictException('quang cao dang cho duyet, hay tra lai hoac duyet xong truoc khi xoa');
    }
    await this.prisma.newsroomAd.delete({ where: { id: row.id } });
    return { ok: true };
  }

  // ---------------- Quy trinh duyet (xem ads-workflow.ts) ----------------

  async submitForReview(publicId: string, actor: Actor) {
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.newsroomAd.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actor.id, actor.roleName, 'submit', null);
    return this.toItem(updated);
  }

  async approveStep(publicId: string, actor: Actor, isFullAdmin: boolean, opts?: { breakingNews?: boolean; breakingNewsReason?: string }) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actor.roleName, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${AD_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    // Tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc hien tai
    // cua cung mot quang cao. Ap dung cho ca toan quyen — truong hop ngoai
    // le tin nong phai di qua co breakingNews va duoc ghi log ro rang.
    const prev = await this.prisma.newsroomAdApproval.findFirst({
      where: { adId: row.id }, orderBy: { createdAt: 'desc' },
    });
    const sod = checkSeparationOfDuties(prev?.actorId || null, actor.id, !!opts?.breakingNews);
    if (!sod.allowed) {
      throw new ForbiddenException('tach nhiem vu: nguoi xu ly buoc truoc khong duoc duyet buoc sau cua cung mot quang cao; dung ngoai le tin nong neu can');
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'published';
    const updated = await this.prisma.newsroomAd.update({
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

  async returnAd(publicId: string, actor: Actor, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'return');
    const updated = await this.prisma.newsroomAd.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, row.workflowStep ?? 0, actor.id, actor.roleName, 'return', String(reason).trim());
    return this.toItem(updated);
  }

  async listApprovals(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.newsroomAdApproval.findMany({
      where: { adId: row.id }, orderBy: { createdAt: 'asc' },
    });
    const names = await this.resolveActorNames(rows.map((r) => r.actorId));
    return { data: rows.map((r) => this.toApproval(r, names)) };
  }

  /**
   * Xuat ban / go xuong, co gate quy trinh (giong events):
   * - Dang cho duyet: chi nguoi duyet buoc cuoi hoac toan quyen moi xuat ban tat.
   * - Nhap: phai gui duyet truoc; xuat ban truc tiep chi toan quyen.
   * - Da ha xuat ban: xuat ban lai truc tiep duoc.
   */
  async setPublished(publicId: string, publish: boolean, publishAt: string | null | undefined, actor: Actor, isFullAdmin = false) {
    const row = await this.prisma.newsroomAd.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay quang cao');
    if (publish && row.status === 'published') return this.toItem(row);
    if (!publish && row.status !== 'published') return this.toItem(row);
    if (publish && row.status === 'pending_review') {
      if (!isFullAdmin && (row.workflowStep ?? 0) !== AD_WORKFLOW_STEPS.length) {
        throw new ConflictException(`quang cao dang cho duyet buoc ${row.workflowStep}/${AD_WORKFLOW_STEPS.length}, phai duyet xong moi xuat ban duoc`);
      }
      if (!isFullAdmin && !canApproveStep(actor.roleName, false, row.workflowStep ?? 0)) {
        throw new ForbiddenException('chi vai duyet buoc cuoi hoac toan quyen moi xuat ban quang cao dang cho duyet');
      }
    }
    if (publish && row.status === 'draft' && !isFullAdmin) {
      throw new ConflictException('quang cao nhap phai gui duyet truoc, chi toan quyen moi xuat ban truc tiep duoc');
    }
    const out = await this.prisma.newsroomAd.update({
      where: { id: row.id },
      data: publish
        ? { status: 'published', workflowStep: 0, publishAt: publishAt ? new Date(publishAt) : row.publishAt || new Date(), updatedBy: actor.username, updatedByRole: actor.roleName }
        : { status: 'unpublished', workflowStep: 0, updatedBy: actor.username, updatedByRole: actor.roleName },
    });
    await this.writeApproval(row.id, 0, actor.id, actor.roleName, publish ? 'publish' : 'unpublish', null);
    return this.toItem(out);
  }

  // ---------------- Cong khai ----------------

  /** Quang cao dang chay: da xuat ban, da toi gio dang, trong lich chay. */
  private runningWhere(now: Date) {
    return {
      status: 'published',
      publishAt: { lte: now },
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    };
  }

  async listPublic(params: { placement?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where: any = this.runningWhere(new Date());
    if (params.placement) where.placement = params.placement;
    const [total, rows] = await Promise.all([
      this.prisma.newsroomAd.count({ where }),
      this.prisma.newsroomAd.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { publishAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((r) => this.toPublicItem(r)), total, page, limit };
  }
}
