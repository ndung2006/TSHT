import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionMap, sanitizePermissionMap } from './permissions.catalog';

// Vai tro mac dinh (seed khi bang roles trong) — theo mo hinh CMS VTC Play.
// Super Admin / Admin full quyen; Editor giu nguyen quyen cu; Moderators /
// Khoi tao de trong, admin tu tick tren ma tran.
const DEFAULT_ROLES: Array<{ name: string; description?: string; permissions: PermissionMap }> = [
  { name: 'Super Admin', description: 'Toàn quyền hệ thống', permissions: { '*': ['*'] } },
  { name: 'Admin', description: 'Quản trị viên toàn quyền', permissions: { '*': ['*'] } },
  {
    name: 'Editor',
    description: 'Biên tập nội dung (giữ nguyên quyền cũ)',
    permissions: {
      videos: ['view', 'create', 'update', 'publish'],
      epg: ['view', 'create', 'update', 'publish', 'delete'],
      categories: ['view', 'create', 'update'],
      layout: ['view'],
      catalog: ['view', 'create', 'update', 'publish', 'delete'],
      users: ['view'],
    },
  },
  { name: 'Moderators', description: 'Kiểm duyệt viên', permissions: {} },
  { name: 'Khởi tạo', description: 'Vai trò mới khởi tạo', permissions: {} },
];

// roleName cu (superadmin/admin/editor) -> ten Role moi de backfill roleId.
const LEGACY_ROLE_NAMES: Record<string, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin',
  editor: 'Editor',
};

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);
  private seeded = false;

  constructor(@Optional() private prisma?: PrismaService) {}

  private get db() {
    if (!this.prisma) throw new BadRequestException('database unavailable');
    return this.prisma;
  }

  // Seed vai tro mac dinh + backfill roleId cho admin_users cu (chi co roleName).
  async ensureSeed(): Promise<void> {
    if (!this.prisma || this.seeded) return;
    try {
      const count = await this.prisma.role.count();
      if (count === 0) {
        for (const r of DEFAULT_ROLES) {
          await this.prisma.role.create({ data: { name: r.name, description: r.description, permissions: r.permissions } });
        }
        this.logger.log(`Da seed ${DEFAULT_ROLES.length} vai tro mac dinh.`);
      }
      // Backfill roleId tu roleName cu.
      const roles = await this.prisma.role.findMany({ select: { id: true, name: true } });
      const byName = new Map(roles.map((r) => [r.name.toLowerCase(), r.id]));
      const orphans = await this.prisma.adminUser.findMany({ where: { roleId: null }, select: { id: true, roleName: true } });
      for (const o of orphans) {
        const target = LEGACY_ROLE_NAMES[(o.roleName || '').toLowerCase()] || o.roleName;
        const roleId = target ? byName.get(target.toLowerCase()) : undefined;
        if (roleId) await this.prisma.adminUser.update({ where: { id: o.id }, data: { roleId } });
      }
      this.seeded = true;
    } catch (e) {
      this.logger.warn(`Seed roles bo qua: ${(e as Error).message}`);
    }
  }

  async list() {
    await this.ensureSeed();
    const roles = await this.db.role.findMany({ orderBy: { createdAt: 'asc' } });
    const counts = await this.db.adminUser.groupBy({ by: ['roleId'], _count: true });
    const countBy = new Map(counts.map((c) => [c.roleId, c._count]));
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      permissions: r.permissions,
      adminCount: countBy.get(r.id) ?? 0,
      createdAt: r.createdAt,
    }));
  }

  async create(data: { name: string; description?: string; permissions?: unknown }) {
    await this.ensureSeed();
    const name = (data.name || '').trim();
    if (!name) throw new BadRequestException('name required');
    const exists = await this.db.role.findUnique({ where: { name } });
    if (exists) throw new BadRequestException('role name exists');
    return this.db.role.create({
      data: { name, description: data.description?.trim() || null, permissions: sanitizePermissionMap(data.permissions) },
    });
  }

  async update(id: string, data: { name?: string; description?: string; permissions?: unknown }) {
    await this.ensureSeed();
    const role = await this.db.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('role not found');
    const patch: any = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('name required');
      const dup = await this.db.role.findFirst({ where: { name, id: { not: id } } });
      if (dup) throw new BadRequestException('role name exists');
      patch.name = name;
    }
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.permissions !== undefined) patch.permissions = sanitizePermissionMap(data.permissions);
    return this.db.role.update({ where: { id }, data: patch });
  }

  async remove(id: string) {
    await this.ensureSeed();
    const role = await this.db.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('role not found');
    const inUse = await this.db.adminUser.count({ where: { roleId: id } });
    if (inUse > 0) throw new BadRequestException(`role đang gán cho ${inUse} quản trị viên, không thể xoá`);
    await this.db.role.delete({ where: { id } });
    return { ok: true };
  }

  // Permission map cua 1 admin (qua roleId; fallback roleName -> Role theo ten).
  // Tra null khi khong tim thay (caller fallback ve role cung) — {} nghia la
  // role co that nhung khong co quyen nao (deny all).
  async permissionMapForAdmin(adminId: string): Promise<PermissionMap | null> {
    if (!this.prisma) return null;
    try {
      await this.ensureSeed();
      const admin = await this.prisma.adminUser.findUnique({
        where: { id: adminId },
        include: { role: true },
      });
      if (!admin) return null;
      if (admin.role?.permissions && typeof admin.role.permissions === 'object') {
        return admin.role.permissions as PermissionMap;
      }
      if (admin.roleName) {
        const byName = await this.prisma.role.findFirst({ where: { name: { equals: admin.roleName, mode: 'insensitive' } } });
        if (byName?.permissions && typeof byName.permissions === 'object') return byName.permissions as PermissionMap;
      }
      return null;
    } catch {
      return null;
    }
  }
}
