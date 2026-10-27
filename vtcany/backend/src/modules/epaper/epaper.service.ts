import { ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'fs';
import { join } from 'path';
import { checkPatch, generatePublicId, isIssueType, issueSlug, issueUrl, parsePublishDate } from './epaper.utils';
import {
  EPAPER_WORKFLOW_STEPS, WORKFLOW_ACTION_LABELS, canApproveStep, stepLabel, transition,
} from './epaper-workflow';

// Dich vu so bao in (E-paper) cho CMS VTCANY, thuoc repo TSHT.
// Muc tieu: nhap lieu so bao moi, khong phai trinh doc cong khai — doc cong
// khai /bao-in se la giai doan rieng, khong nam trong module nay.
// pageCount: repo chua co trinh doc PDF nen con so do bien tap nhap tay khi
// tao/cap nhat; khong bao gio tu dem gia. TODO: dem tu dong khi co pdf parser.
@Injectable()
export class EpaperService {
  constructor(private prisma: PrismaService, private uploads: UploadsService) {}

  // --- Anh trang render san phia server (Hybrid, thay cho PDF.js ve toan
  // bo o muc fit) ---
  // Moi trang duoc render LAZY o lan goi dau tien bang pdftoppm (poppler,
  // co san trong Dockerfile nho poppler-utils) roi cache tren storage
  // ben vung: page-images/<publicId>-<fingerprint>/page-NNN.jpg.
  // Fingerprint = kich thuoc + mtime cua file PDF => thay PDF la doi
  // thu muc cache => render lai, khong bao gio phuc vu anh cua PDF cu.
  // Do phan giai fit: canh lon nhat 1600px, JPEG q85 (nhanh trang dau;
  // zoom >100% van dung overlay PDF.js sac net nhu cu, khong phu thuoc
  // vao anh nay — vi vay khong can 300dpi cho anh fit).
  private pageRenderJobs = new Map<string, Promise<string>>();
  private pdfCountCache = new Map<string, number | null>();

  /** Fingerprint + so trang that cua 1 file PDF (dung chung cho ca 2 route anh). */
  private async pdfFileInfo(abs: string, publicId: string): Promise<{ fingerprint: string; pdfPageCount: number | null }> {
    const st = statSync(abs);
    const fingerprint = `${st.size}-${Math.trunc(st.mtimeMs)}`;
    const cacheKey = `${publicId}-${fingerprint}`;
    let pdfPageCount = this.pdfCountCache.get(cacheKey);
    if (pdfPageCount === undefined) {
      pdfPageCount = null;
      try {
        const execFileAsync = promisify(execFile);
        const { stdout } = await execFileAsync('pdfinfo', [abs], { timeout: 30000 });
        const m = /^Pages:\s+(\d+)\s*$/m.exec(stdout || '');
        if (m) pdfPageCount = Number(m[1]);
      } catch { /* null => trinh doc fallback ve PDF.js nhu cu */ }
      this.pdfCountCache.set(cacheKey, pdfPageCount);
    }
    return { fingerprint, pdfPageCount };
  }

  /** Thong tin PDF cua so da xuat ban (404 neu chua xuat ban / chua co PDF). */
  async publishedPdfInfo(publicId: string): Promise<{ pdfPath: string; fingerprint: string; pdfPageCount: number | null }> {
    const pdfPath = await this.publishedPdfPath(publicId);
    if (!pdfPath) throw new NotFoundException('so bao chua co file PDF');
    const root = this.uploads.storageRoot();
    const abs = join(root, pdfPath);
    if (!abs.startsWith(root) || !existsSync(abs)) throw new NotFoundException('file PDF khong ton tai');
    return { pdfPath, ...(await this.pdfFileInfo(abs, publicId)) };
  }

  /** Render (lazy) + cache anh 1 trang; dung chung cho route cong khai va route admin. */
  private async renderPageImage(pdfPath: string, publicId: string, fingerprint: string, pdfPageCount: number | null, page: number): Promise<{ abs: string; fingerprint: string }> {
    if (!Number.isInteger(page) || page < 1 || (pdfPageCount !== null && page > pdfPageCount)) {
      throw new NotFoundException('trang khong ton tai');
    }
    const root = this.uploads.storageRoot();
    const dir = join(root, 'page-images', `${publicId}-${fingerprint}`);
    const name = `page-${String(page).padStart(3, '0')}.jpg`;
    const abs = join(dir, name);
    if (existsSync(abs)) return { abs, fingerprint };
    let job = this.pageRenderJobs.get(abs);
    if (!job) {
      job = (async () => {
        if (existsSync(abs)) return abs;
        mkdirSync(dir, { recursive: true });
        const tmpPrefix = join(dir, `.tmp-${process.pid}-${page}`);
        const execFileAsync = promisify(execFile);
        await execFileAsync('pdftoppm', [
          '-jpeg', '-jpegopt', 'quality=85', '-scale-to', '1600',
          '-f', String(page), '-l', String(page),
          join(root, pdfPath), tmpPrefix,
        ], { timeout: 60000 });
        // pdftoppm dat ten <prefix>-<so trang co pad>.jpg; chi co 1 file
        // vi chi render 1 trang, loc dung prefix + '-' de tranh nham
        // trang 1 voi trang 12 khi chay song song.
        const produced = readdirSync(dir)
          .filter((f) => f.startsWith(`${tmpPrefix.split('/').pop()}-`) && f.endsWith('.jpg'))
          .sort();
        if (produced.length === 0) throw new NotFoundException('khong render duoc trang');
        renameSync(join(dir, produced[0]), abs);
        return abs;
      })();
      this.pageRenderJobs.set(abs, job);
      job.then(() => this.pageRenderJobs.delete(abs), () => this.pageRenderJobs.delete(abs));
    }
    await job;
    return { abs, fingerprint };
  }

  /** Duong dan anh cua 1 trang, chi so da xuat ban (route cong khai). */
  async pageImage(publicId: string, page: number): Promise<{ abs: string; fingerprint: string }> {
    const info = await this.publishedPdfInfo(publicId);
    return this.renderPageImage(info.pdfPath, publicId, info.fingerprint, info.pdfPageCount, page);
  }

  /** Duong dan anh cua 1 trang, moi trang thai (route admin cho dialog Xem duyet).
   *  Khac pageImage o cho khong yeu cau published — nhap/cho duyet van xem
   *  duoc; quyen epaper:view do controller chan bang @RequirePerms. */
  async pageImageAdmin(publicId: string, page: number): Promise<{ abs: string; fingerprint: string }> {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    const pdfPath = row.pdfPath as string | null;
    if (!pdfPath) throw new NotFoundException('so bao chua co file PDF');
    const root = this.uploads.storageRoot();
    const abs = join(root, pdfPath);
    if (!abs.startsWith(root) || !existsSync(abs)) throw new NotFoundException('file PDF khong ton tai');
    const info = await this.pdfFileInfo(abs, publicId);
    return this.renderPageImage(pdfPath, publicId, info.fingerprint, info.pdfPageCount, page);
  }

  private toItem(row: any) {
    return {
      id: row.id,
      publicId: row.publicId,
      issueNumber: row.issueNumber,
      issueType: row.issueType,
      publishDate: row.publishDate instanceof Date ? row.publishDate.toISOString().slice(0, 10) : row.publishDate,
      title: row.title,
      slug: row.slug,
      url: issueUrl(row.slug),
      status: row.status,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      pdfPath: row.pdfPath,
      pdfSizeBytes: row.pdfSizeBytes ? Number(row.pdfSizeBytes) : null,
      pageCount: row.pageCount,
      coverPath: row.coverPath,
      createdBy: row.createdBy,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      // Quy trinh duyet (xem epaper-workflow.ts). lastApproval do list() gan them.
      workflowStep: row.workflowStep ?? 0,
      workflowStepLabel: stepLabel(row.workflowStep ?? 0),
      workflowTotalSteps: EPAPER_WORKFLOW_STEPS.length,
      lastApproval: (row as any).lastApproval || null,
    };
  }

  private toApproval(row: any) {
    return {
      id: row.id,
      step: row.step,
      stepLabel: row.stepLabel,
      actorId: row.actorId,
      actorRole: row.actorRole,
      action: row.action,
      actionLabel: WORKFLOW_ACTION_LABELS[row.action] || row.action,
      comment: row.comment,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
    };
  }

  private async writeApproval(issueId: string, step: number, actorId: string | null, actorRole: string | null, action: string, comment: string | null) {
    await this.prisma.epaperIssueApproval.create({
      data: {
        issueId, step, stepLabel: stepLabel(step),
        actorId: actorId || null, actorRole: actorRole || null,
        action, comment: comment || null,
      },
    });
  }

  /** Gan lastApproval (dong duyet moi nhat) vao cac row cua 1 trang list. */
  private async attachLastApprovals(rows: any[]) {
    if (rows.length === 0) return rows;
    const ids = rows.map((r) => r.id);
    const all = await this.prisma.epaperIssueApproval.findMany({
      where: { issueId: { in: ids } }, orderBy: { createdAt: 'desc' },
    });
    const firstByIssue = new Map<string, any>();
    for (const a of all) if (!firstByIssue.has(a.issueId)) firstByIssue.set(a.issueId, a);
    return rows.map((r) => ({ ...r, lastApproval: firstByIssue.has(r.id) ? this.toApproval(firstByIssue.get(r.id)) : null }));
  }

  private async snapshot(issueId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { id: issueId } });
    if (!row) return {};
    return {
      title: row.title, issueNumber: row.issueNumber, issueType: row.issueType,
      publishDate: row.publishDate, status: row.status, pdfPath: row.pdfPath,
      pageCount: row.pageCount, slug: row.slug,
    };
  }

  private async writeRevision(issueId: string, changedBy: string | null, reason: string | null, before: any) {
    const last = await this.prisma.epaperIssueRevision.findFirst({
      where: { issueId }, orderBy: { revisionNo: 'desc' }, select: { revisionNo: true },
    });
    await this.prisma.epaperIssueRevision.create({
      data: {
        issueId, revisionNo: (last?.revisionNo || 0) + 1,
        changedBy: changedBy || null, changeReason: reason || null, snapshot: before,
      },
    });
  }

  async list(query: { issueType?: string; q?: string; status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 20)));
    const where: any = {};
    if (query.issueType && isIssueType(query.issueType)) where.issueType = query.issueType;
    if (query.status && ['draft', 'pending_review', 'published'].includes(query.status)) where.status = query.status;
    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      const n = Number(q);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        ...(Number.isInteger(n) ? [{ issueNumber: n }] : []),
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.epaperIssue.findMany({
        where, orderBy: [{ publishDate: 'desc' }, { issueNumber: 'desc' }],
        skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.epaperIssue.count({ where }),
    ]);
    const withApprovals = await this.attachLastApprovals(rows);
    return { data: withApprovals.map((r) => this.toItem(r)), total, page, limit };
  }

  // --- Doc cong khai (chi so da xuat ban; khong lo thong tin noi bo) ---
  private toPublicItem(row: any) {
    return {
      publicId: row.publicId,
      issueNumber: row.issueNumber,
      issueType: row.issueType,
      publishDate: row.publishDate instanceof Date ? row.publishDate.toISOString().slice(0, 10) : row.publishDate,
      title: row.title,
      slug: row.slug,
      url: issueUrl(row.slug),
      status: row.status,
      publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
      pageCount: row.pageCount,
      coverPath: row.coverPath,
    };
  }

  async listPublished(query: { issueType?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 20)));
    const where: any = { status: 'published' };
    if (query.issueType && isIssueType(query.issueType)) where.issueType = query.issueType;
    if (query.q && String(query.q).trim()) {
      const q = String(query.q).trim();
      const n = Number(q);
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        ...(Number.isInteger(n) ? [{ issueNumber: n }] : []),
      ];
    }
    const [rows, total] = await Promise.all([
      this.prisma.epaperIssue.findMany({
        where, orderBy: [{ publishDate: 'desc' }, { issueNumber: 'desc' }],
        skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.epaperIssue.count({ where }),
    ]);
    return { data: rows.map((r) => this.toPublicItem(r)), total, page, limit };
  }

  async getPublished(publicId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row || row.status !== 'published') throw new NotFoundException('khong tim thay so bao');
    return this.toPublicItem(row);
  }

  async publishedPdfPath(publicId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row || row.status !== 'published') throw new NotFoundException('khong tim thay so bao');
    return row.pdfPath as string | null;
  }

  async get(publicId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    const revisions = await this.prisma.epaperIssueRevision.findMany({
      where: { issueId: row.id }, orderBy: { revisionNo: 'desc' }, take: 50,
    });
    return { ...this.toItem(row), revisions };
  }

  async create(dto: any, actorId: string | null) {
    if (!isIssueType(dto?.issueType)) throw new BadRequestException('issue_type chi nhan thuong hoac vung_cao');
    if (!Number.isInteger(dto?.issueNumber) || dto.issueNumber <= 0) throw new BadRequestException('issue_number phai la so nguyen duong');
    if (!dto?.title || !String(dto.title).trim()) throw new BadRequestException('title khong duoc trong');
    const publishDate = parsePublishDate(dto?.publishDate);
    if (!publishDate) throw new BadRequestException('publish_date phai dang YYYY-MM-DD');
    const pageCount = dto?.pageCount === undefined ? 0 : dto.pageCount;
    if (!Number.isInteger(pageCount) || pageCount < 0) throw new BadRequestException('page_count phai la so nguyen >= 0');
    const dup = await this.prisma.epaperIssue.findFirst({
      where: { issueType: dto.issueType, issueNumber: dto.issueNumber }, select: { id: true },
    });
    if (dup) throw new ConflictException('da co so bao nay o loai so do (UNIQUE issue_type, issue_number)');
    const publicId = generatePublicId();
    const row = await this.prisma.epaperIssue.create({
      data: {
        publicId, issueNumber: dto.issueNumber, issueType: dto.issueType,
        publishDate, title: String(dto.title).trim(), slug: issueSlug(dto.issueNumber, publicId),
        status: 'draft', pdfPath: dto.pdfPath || null,
        pdfSizeBytes: dto.pdfSizeBytes !== undefined && dto.pdfSizeBytes !== null ? BigInt(dto.pdfSizeBytes) : null,
        pageCount, coverPath: dto.coverPath || null, createdBy: actorId || null,
      },
    });
    return this.toItem(row);
  }

  async patch(publicId: string, dto: any, actorId: string | null) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    const wasPublished = row.status === 'published';
    const check = checkPatch(wasPublished, { issueNumber: row.issueNumber }, dto || {});
    if (!check.ok) throw new BadRequestException(check.error);
    const data: any = {};
    if (dto.issueType !== undefined) data.issueType = dto.issueType;
    if (dto.title !== undefined) {
      if (!String(dto.title).trim()) throw new BadRequestException('title khong duoc trong');
      data.title = String(dto.title).trim();
    }
    if (dto.publishDate !== undefined) {
      const d = parsePublishDate(dto.publishDate);
      if (!d) throw new BadRequestException('publish_date phai dang YYYY-MM-DD');
      data.publishDate = d;
    }
    if (dto.pdfPath !== undefined) data.pdfPath = dto.pdfPath || null;
    if (dto.pdfSizeBytes !== undefined) data.pdfSizeBytes = dto.pdfSizeBytes === null ? null : BigInt(dto.pdfSizeBytes);
    if (dto.pageCount !== undefined) {
      if (!Number.isInteger(dto.pageCount) || dto.pageCount < 0) throw new BadRequestException('page_count phai la so nguyen >= 0');
      data.pageCount = dto.pageCount;
    }
    if (dto.coverPath !== undefined) data.coverPath = dto.coverPath || null;
    if (dto.issueNumber !== undefined && dto.issueNumber !== row.issueNumber) {
      // So nhap moi duoc doi so; so da xuat ban da bi checkPatch chan o tren.
      data.issueNumber = dto.issueNumber;
    }
    if (data.issueType !== undefined || data.issueNumber !== undefined) {
      const dup = await this.prisma.epaperIssue.findFirst({
        where: {
          issueType: data.issueType ?? row.issueType,
          issueNumber: data.issueNumber ?? row.issueNumber,
          id: { not: row.id },
        },
        select: { id: true },
      });
      if (dup) throw new ConflictException('da co so bao nay o loai so moi (UNIQUE issue_type, issue_number)');
    }
    const before = await this.snapshot(row.id);
    const updated = await this.prisma.epaperIssue.update({ where: { id: row.id }, data });
    if (wasPublished) {
      await this.writeRevision(row.id, actorId, dto.changeReason ? String(dto.changeReason).trim() : null, before);
    }
    return this.toItem(updated);
  }

  // --- Quy trinh duyet (xem epaper-workflow.ts) ---
  private async workflowRow(publicId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    return row;
  }

  private applyTransition(row: any, action: 'submit' | 'approve' | 'return' | 'publish-direct' | 'unpublish') {
    try {
      return transition({ status: row.status, step: row.workflowStep ?? 0 }, action);
    } catch (e: any) {
      throw new ConflictException(e?.message || 'trang thai quy trinh khong hop le');
    }
  }

  async submitForReview(publicId: string, actorId: string | null, actorRole: string | null) {
    const row = await this.workflowRow(publicId);
    const next = this.applyTransition(row, 'submit');
    const updated = await this.prisma.epaperIssue.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, next.step, actorId, actorRole, 'submit', null);
    return this.toItem(updated);
  }

  async approveStep(publicId: string, actorId: string | null, actorRole: string | null, isFullAdmin: boolean) {
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    if (!canApproveStep(actorRole, isFullAdmin, step)) {
      throw new ForbiddenException(`buoc duyet hien tai (${stepLabel(step) || '?'}) chi vai ${EPAPER_WORKFLOW_STEPS[step - 1]?.roleName || '?'} hoac toan quyen moi duyet duoc`);
    }
    const next = this.applyTransition(row, 'approve');
    const wasFinal = next.status === 'published';
    const before = await this.snapshot(row.id);
    const updated = await this.prisma.epaperIssue.update({
      where: { id: row.id },
      data: { status: next.status, workflowStep: next.step, publishedAt: wasFinal ? new Date() : row.publishedAt },
    });
    await this.writeApproval(row.id, step, actorId, actorRole, 'approve', null);
    if (wasFinal) {
      await this.writeRevision(row.id, actorId, 'xuat ban', before);
      await this.writeApproval(row.id, 0, actorId, actorRole, 'publish', null);
    }
    return this.toItem(updated);
  }

  async returnIssue(publicId: string, actorId: string | null, actorRole: string | null, reason: string) {
    if (!reason || !String(reason).trim()) throw new BadRequestException('tra lai bat buoc co ly do');
    const row = await this.workflowRow(publicId);
    const step = row.workflowStep ?? 0;
    const next = this.applyTransition(row, 'return');
    const before = await this.snapshot(row.id);
    const updated = await this.prisma.epaperIssue.update({
      where: { id: row.id }, data: { status: next.status, workflowStep: next.step },
    });
    await this.writeApproval(row.id, step, actorId, actorRole, 'return', String(reason).trim());
    await this.writeRevision(row.id, actorId, `tra lai duyet: ${String(reason).trim()}`, before);
    return this.toItem(updated);
  }

  async listApprovals(publicId: string) {
    const row = await this.workflowRow(publicId);
    const rows = await this.prisma.epaperIssueApproval.findMany({
      where: { issueId: row.id }, orderBy: { createdAt: 'asc' },
    });
    return { data: rows.map((r) => this.toApproval(r)) };
  }

  async setPublished(publicId: string, publish: boolean, actorId: string | null, actorRole: string | null = null, isFullAdmin = false) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    if (publish && row.status === 'published') return this.toItem(row);
    if (!publish && row.status !== 'published') return this.toItem(row);
    if (publish && row.status === 'pending_review') {
      // So dang cho duyet khong xuat ban tat: phai duyet het cac buoc
      // (approve buoc cuoi tu xuat ban) hoac toan quyen duyet tat.
      if (!isFullAdmin && (row.workflowStep ?? 0) !== EPAPER_WORKFLOW_STEPS.length) {
        throw new ConflictException(`so dang cho duyet buoc ${row.workflowStep}/${EPAPER_WORKFLOW_STEPS.length}, phai duyet xong moi xuat ban duoc`);
      }
      if (!isFullAdmin && !canApproveStep(actorRole, false, row.workflowStep ?? 0)) {
        throw new ForbiddenException('chi vai duyet buoc cuoi hoac toan quyen moi xuat ban so dang cho duyet');
      }
    }
    if (publish && row.status === 'draft' && !isFullAdmin) {
      // So nhap phai di qua quy trinh; xuat ban truc tiep chi danh cho toan quyen.
      throw new ConflictException('so nhap phai gui duyet truoc, chi toan quyen moi xuat ban truc tiep duoc');
    }
    const before = await this.snapshot(row.id);
    const updated = await this.prisma.epaperIssue.update({
      where: { id: row.id },
      data: { status: publish ? 'published' : 'draft', workflowStep: 0, publishedAt: publish ? new Date() : null },
    });
    if (row.status === 'published' || publish) {
      await this.writeRevision(row.id, actorId, publish ? 'xuat ban' : 'go xuong', before);
    }
    await this.writeApproval(row.id, 0, actorId, actorRole, publish ? 'publish' : 'unpublish', null);
    return this.toItem(updated);
  }

  async remove(publicId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    if (row.status === 'published') throw new ConflictException('so dang xuat ban: go xuong truoc khi xoa');
    if (row.status === 'pending_review') throw new ConflictException('so dang cho duyet: tra lai hoac duyet xong truoc khi xoa');
    await this.prisma.epaperIssue.delete({ where: { id: row.id } });
    return { deleted: true, publicId };
  }
}
