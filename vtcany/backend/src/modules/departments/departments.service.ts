import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeDepartmentInput, normalizeDepartmentPatch } from './department-input';

// CRUD Phong ban (Dot 1a, chi du lieu nen). Quyen: departments:* (them vao
// PERMISSION_MODULES nen trang Quan ly quyen tu hien dong "Phong ban").
// KHONG co logic loc buoc duyet theo phong — de Dot 4.
@Injectable()
export class DepartmentsService {
  constructor(private readonly prisma: PrismaService) {}

  private newPublicId(): string {
    return randomBytes(12).toString('hex');
  }

  private toItem(row: any) {
    return {
      id: row.id,
      publicId: row.publicId,
      name: row.name,
      slug: row.slug,
      sortOrder: row.sortOrder,
      isVisible: row.isVisible,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
    };
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let n = 2;
    while (true) {
      const row = await this.prisma.department.findUnique({ where: { slug } });
      if (!row || row.id === excludeId) return slug;
      slug = `${base}-${n++}`;
    }
  }

  async list() {
    const rows = await this.prisma.department.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map((r) => this.toItem(r));
  }

  async get(publicId: string) {
    const row = await this.prisma.department.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay phong ban');
    return this.toItem(row);
  }

  async create(input: any) {
    let data;
    try {
      data = normalizeDepartmentInput(input || {});
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'phong ban khong hop le');
    }
    const slug = await this.uniqueSlug(data.slug);
    const row = await this.prisma.department.create({
      data: {
        publicId: this.newPublicId(),
        name: data.name,
        slug,
        sortOrder: data.sortOrder,
        isVisible: data.isVisible,
      },
    });
    return this.toItem(row);
  }

  async patch(publicId: string, input: any) {
    const row = await this.prisma.department.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay phong ban');
    let patch;
    try {
      patch = normalizeDepartmentPatch(input || {}, row);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'phong ban khong hop le');
    }
    const data: any = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.slug !== undefined) data.slug = await this.uniqueSlug(patch.slug, row.id);
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    if (patch.isVisible !== undefined) data.isVisible = patch.isVisible;
    const out = await this.prisma.department.update({ where: { id: row.id }, data });
    return this.toItem(out);
  }

  async remove(publicId: string) {
    const row = await this.prisma.department.findUnique({ where: { publicId } });
    if (!row) throw new NotFoundException('khong tim thay phong ban');
    const userCount = await this.prisma.adminUser.count({ where: { departmentId: row.id } });
    if (userCount > 0) {
      throw new ConflictException('phong ban con quan tri vien truc thuoc, hay chuyen ho sang phong khac truoc');
    }
    await this.prisma.department.delete({ where: { id: row.id } });
    return { ok: true };
  }
}
