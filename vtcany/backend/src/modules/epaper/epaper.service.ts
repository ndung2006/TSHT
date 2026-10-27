import { ConflictException, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { checkPatch, generatePublicId, isIssueType, issueSlug, issueUrl, parsePublishDate } from './epaper.utils';

// Dich vu so bao in (E-paper) cho CMS VTCANY, thuoc repo TSHT.
// Muc tieu: nhap lieu so bao moi, khong phai trinh doc cong khai — doc cong
// khai /bao-in se la giai doan rieng, khong nam trong module nay.
// pageCount: repo chua co trinh doc PDF nen con so do bien tap nhap tay khi
// tao/cap nhat; khong bao gio tu dem gia. TODO: dem tu dong khi co pdf parser.
@Injectable()
export class EpaperService {
  constructor(private prisma: PrismaService) {}

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
    };
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

  async list(query: { issueType?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const limit = Math.min(100, Math.max(1, Math.trunc(Number(query.limit) || 20)));
    const where: any = {};
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
    return { data: rows.map((r) => this.toItem(r)), total, page, limit };
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

  async setPublished(publicId: string, publish: boolean, actorId: string | null) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    if (publish && row.status === 'published') return this.toItem(row);
    if (!publish && row.status !== 'published') return this.toItem(row);
    const before = await this.snapshot(row.id);
    const updated = await this.prisma.epaperIssue.update({
      where: { id: row.id },
      data: { status: publish ? 'published' : 'draft', publishedAt: publish ? new Date() : null },
    });
    if (row.status === 'published' || publish) {
      await this.writeRevision(row.id, actorId, publish ? 'xuat ban' : 'go xuong', before);
    }
    return this.toItem(updated);
  }

  async remove(publicId: string) {
    const row = await this.prisma.epaperIssue.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay so bao');
    if (row.status === 'published') throw new ConflictException('so dang xuat ban: go xuong truoc khi xoa');
    await this.prisma.epaperIssue.delete({ where: { id: row.id } });
    return { deleted: true, publicId };
  }
}
