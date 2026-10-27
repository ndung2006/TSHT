import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesService } from './roles.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AdminsService {
  constructor(private prisma: PrismaService, private roles: RolesService) {}

  private toOut(row: any) {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl ?? null,
      roleId: row.roleId,
      roleName: row.role?.name || row.roleName,
      status: row.status,
      lastLogin: row.lastLogin,
      createdAt: row.createdAt,
    };
  }

  async list(q?: string, page = 1, limit = 20) {
    await this.roles.ensureSeed();
    const where: any = {};
    if (q?.trim()) {
      const s = q.trim();
      where.OR = [
        { email: { contains: s, mode: 'insensitive' } },
        { username: { contains: s, mode: 'insensitive' } },
        { fullName: { contains: s, mode: 'insensitive' } },
      ];
    }
    const [total, rows] = await Promise.all([
      this.prisma.adminUser.count({ where }),
      this.prisma.adminUser.findMany({
        where,
        include: { role: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((r) => this.toOut(r)), total, page, limit };
  }

  async create(data: { email: string; password?: string; fullName?: string; avatarUrl?: string; roleId?: string; status?: string }) {
    await this.roles.ensureSeed();
    const email = (data.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new BadRequestException('email không hợp lệ');
    const dup = await this.prisma.adminUser.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (dup) throw new BadRequestException('email đã tồn tại');
    if (data.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
      if (!role) throw new BadRequestException('vai trò không tồn tại');
    }
    const password = data.password || '';
    if (password && password.length < 8) throw new BadRequestException('mật khẩu tối thiểu 8 ký tự');
    const row = await this.prisma.adminUser.create({
      data: {
        email,
        passwordHash: password ? await bcrypt.hash(password, 10) : await bcrypt.hash(Math.random().toString(36), 10),
        fullName: data.fullName?.trim() || null,
        avatarUrl: data.avatarUrl?.trim() || null,
        roleId: data.roleId || null,
        status: data.status === 'disabled' ? 'disabled' : 'active',
      },
      include: { role: { select: { name: true } } },
    });
    return this.toOut(row);
  }

  async update(id: string, data: { fullName?: string; avatarUrl?: string; roleId?: string | null; status?: string; password?: string }, actorId?: string) {
    await this.roles.ensureSeed();
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('không tìm thấy quản trị viên');
    const patch: any = {};
    if (data.fullName !== undefined) patch.fullName = data.fullName?.trim() || null;
    if (data.avatarUrl !== undefined) patch.avatarUrl = data.avatarUrl?.trim() || null;
    if (data.roleId !== undefined) {
      if (data.roleId) {
        const role = await this.prisma.role.findUnique({ where: { id: data.roleId } });
        if (!role) throw new BadRequestException('vai trò không tồn tại');
        patch.roleId = data.roleId;
        patch.roleName = null;
      } else {
        patch.roleId = null;
      }
    }
    if (data.status !== undefined) {
      const next = data.status === 'disabled' ? 'disabled' : 'active';
      // Khong tu khoa chinh minh.
      if (next === 'disabled' && id === actorId) throw new BadRequestException('không thể khoá chính mình');
      patch.status = next;
    }
    if (data.password !== undefined) {
      if (!data.password) throw new BadRequestException('mật khẩu không được trống');
      if (data.password.length < 8) throw new BadRequestException('mật khẩu tối thiểu 8 ký tự');
      patch.passwordHash = await bcrypt.hash(data.password, 10);
    }
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: patch,
      include: { role: { select: { name: true } } },
    });
    return this.toOut(updated);
  }

  async remove(id: string, actorId?: string) {
    if (id === actorId) throw new BadRequestException('không thể xoá chính mình');
    const row = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('không tìm thấy quản trị viên');
    const total = await this.prisma.adminUser.count({ where: { status: 'active' } });
    if (total <= 1 && row.status === 'active') throw new BadRequestException('không thể xoá quản trị viên cuối cùng');
    await this.prisma.adminUser.delete({ where: { id } });
    return { ok: true };
  }
}
