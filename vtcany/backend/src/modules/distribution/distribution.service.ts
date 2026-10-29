import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DISTRIBUTION_MEDIA_TYPES,
  DISTRIBUTION_PLATFORMS,
  cleanPlatforms,
  isHttpUrl,
  publishTargetUpdate,
  unpublishTargetUpdate,
  type DistributionPlatform,
} from './distribution-rules';

export interface DistributionUpsert {
  title: string;
  caption?: string | null;
  mediaUrl?: string | null;
  mediaType?: string;
  platforms?: string[];
}

function newPublicId(): string {
  return randomBytes(12).toString('hex');
}

@Injectable()
export class DistributionService {
  constructor(private readonly prisma: PrismaService) {}

  private rowToAdmin(row: any) {
    return {
      publicId: row.publicId,
      title: row.title,
      caption: row.caption,
      mediaUrl: row.mediaUrl,
      mediaType: row.mediaType,
      status: row.status,
      publishedAt: row.publishedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      targets: (row.targets || []).map((t: any) => ({
        platform: t.platform, status: t.status, url: t.url, postedAt: t.postedAt, note: t.note,
      })),
    };
  }

  async listAdmin() {
    const rows = await this.prisma.distributionPost.findMany({
      include: { targets: { orderBy: { platform: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.rowToAdmin(r));
  }

  async create(dto: DistributionUpsert, actorId?: string) {
    if (!dto.title?.trim()) throw new BadRequestException('thieu tieu de');
    if (dto.mediaType && !(DISTRIBUTION_MEDIA_TYPES as readonly string[]).includes(dto.mediaType)) {
      throw new BadRequestException('mediaType khong hop le');
    }
    const platforms = cleanPlatforms(dto.platforms);
    const row = await this.prisma.distributionPost.create({
      data: {
        publicId: newPublicId(),
        title: dto.title.trim(),
        caption: dto.caption?.trim() || null,
        mediaUrl: dto.mediaUrl?.trim() || null,
        mediaType: dto.mediaType || 'image',
        status: 'draft',
        createdBy: actorId || null,
        targets: { create: platforms.map((platform) => ({ platform, status: 'draft' })) },
      },
      include: { targets: { orderBy: { platform: 'asc' } } },
    });
    return this.rowToAdmin(row);
  }

  private async draftRow(publicId: string) {
    const row = await this.prisma.distributionPost.findUnique({
      where: { publicId },
      include: { targets: true },
    });
    if (!row) throw new NotFoundException('khong tim thay bai phan phoi');
    if (row.status !== 'draft') throw new BadRequestException('chi sua duoc bai o trang thai nhap');
    return row;
  }

  async update(publicId: string, dto: DistributionUpsert) {
    const row = await this.draftRow(publicId);
    if (dto.mediaType && !(DISTRIBUTION_MEDIA_TYPES as readonly string[]).includes(dto.mediaType)) {
      throw new BadRequestException('mediaType khong hop le');
    }
    const platforms = dto.platforms === undefined ? null : cleanPlatforms(dto.platforms);
    const updated = await this.prisma.$transaction(async (tx) => {
      if (platforms !== null) {
        await tx.distributionTarget.deleteMany({ where: { postId: row.id } });
        await tx.distributionTarget.createMany({
          data: platforms.map((platform) => ({ postId: row.id, platform, status: 'draft' })),
        });
      }
      return tx.distributionPost.update({
        where: { id: row.id },
        data: {
          title: dto.title?.trim() || row.title,
          caption: dto.caption === undefined ? row.caption : (dto.caption?.trim() || null),
          mediaUrl: dto.mediaUrl === undefined ? row.mediaUrl : (dto.mediaUrl?.trim() || null),
          mediaType: dto.mediaType || row.mediaType,
        },
        include: { targets: { orderBy: { platform: 'asc' } } },
      });
    });
    return this.rowToAdmin(updated);
  }

  async remove(publicId: string) {
    const row = await this.draftRow(publicId);
    await this.prisma.distributionPost.delete({ where: { id: row.id } });
    return { ok: true };
  }

  async publish(publicId: string) {
    const row = await this.prisma.distributionPost.findUnique({
      where: { publicId },
      include: { targets: true },
    });
    if (!row) throw new NotFoundException('khong tim thay bai phan phoi');
    if (row.status !== 'draft') throw new BadRequestException('chi xuat ban duoc bai o trang thai nhap');
    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.distributionPost.update({
        where: { id: row.id },
        data: { status: 'published', publishedAt: now },
      });
      for (const t of row.targets) {
        const next = publishTargetUpdate(t);
        if (!next) continue;
        await tx.distributionTarget.update({
          where: { id: t.id },
          data: { status: next.status, url: next.url, postedAt: next.status === 'posted' ? now : t.postedAt },
        });
      }
      return tx.distributionPost.findUnique({
        where: { id: row.id },
        include: { targets: { orderBy: { platform: 'asc' } } },
      });
    });
    return this.rowToAdmin(updated);
  }

  async unpublish(publicId: string) {
    const row = await this.prisma.distributionPost.findUnique({
      where: { publicId },
      include: { targets: true },
    });
    if (!row) throw new NotFoundException('khong tim thay bai phan phoi');
    if (row.status !== 'published') throw new BadRequestException('chi go xuat ban duoc bai dang xuat ban');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.distributionPost.update({
        where: { id: row.id },
        data: { status: 'draft', publishedAt: null },
      });
      for (const t of row.targets) {
        const next = unpublishTargetUpdate(t);
        if (!next) continue;
        await tx.distributionTarget.update({
          where: { id: t.id },
          data: { status: next.status, url: next.url, postedAt: null },
        });
      }
      return tx.distributionPost.findUnique({
        where: { id: row.id },
        include: { targets: { orderBy: { platform: 'asc' } } },
      });
    });
    return this.rowToAdmin(updated);
  }

  // Ghi nhan trang thai dich thu cong (facebook/tiktok). Dich app la tu
  // dong theo bai, khong cho danh dau tay — tranh trang thai gia.
  async markTarget(publicId: string, platform: string, body: { status?: string; url?: string | null; note?: string | null }) {
    if (!(DISTRIBUTION_PLATFORMS as readonly string[]).includes(platform)) {
      throw new BadRequestException('platform khong hop le');
    }
    if (platform === 'app') {
      throw new BadRequestException('dich app tu dong theo bai, khong danh dau tay');
    }
    const row = await this.prisma.distributionPost.findUnique({
      where: { publicId },
      include: { targets: true },
    });
    if (!row) throw new NotFoundException('khong tim thay bai phan phoi');
    const target = row.targets.find((t) => t.platform === platform);
    if (!target) throw new NotFoundException('bai chua chon dich nay');
    const status = body.status || 'posted';
    if (!['posted', 'ready', 'failed'].includes(status)) throw new BadRequestException('status dich khong hop le');
    if (status === 'posted' && (!body.url || !isHttpUrl(body.url))) {
      throw new BadRequestException('danh dau da dang can url http(s) hop le');
    }
    const updated = await this.prisma.distributionTarget.update({
      where: { id: target.id },
      data: {
        status,
        url: status === 'ready' ? null : (body.url?.trim() || target.url),
        postedAt: status === 'posted' ? new Date() : (status === 'ready' ? null : target.postedAt),
        note: body.note === undefined ? target.note : (body.note?.trim() || null),
      },
    });
    return { platform: updated.platform, status: updated.status, url: updated.url, postedAt: updated.postedAt, note: updated.note };
  }

  // Cong khai: chi bai published; khong bao gio tra createdBy hay id noi bo.
  async listPublic(params: { platform?: string; page?: number; limit?: number }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(params.limit) || 20));
    const where: any = { status: 'published' };
    if (params.platform && (DISTRIBUTION_PLATFORMS as readonly string[]).includes(params.platform)) {
      where.targets = { some: { platform: params.platform } };
    }
    const [total, rows] = await Promise.all([
      this.prisma.distributionPost.count({ where }),
      this.prisma.distributionPost.findMany({
        where,
        include: { targets: { orderBy: { platform: 'asc' } } },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return {
      data: rows.map((r) => ({
        publicId: r.publicId,
        title: r.title,
        caption: r.caption,
        mediaUrl: r.mediaUrl,
        mediaType: r.mediaType,
        publishedAt: r.publishedAt,
        targets: r.targets.map((t) => ({ platform: t.platform, status: t.status, url: t.status === 'posted' ? t.url : null })),
      })),
      total, page, limit,
    };
  }
}
