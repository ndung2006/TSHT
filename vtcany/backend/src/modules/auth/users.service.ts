import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

// Quan ly nguoi dung cuoi (app): CRUD cho CMS + dang nhap mat khau + upsert OAuth.
// Du lieu luu Postgres (bang users); END_USERS in-memory o auth.service dong vai
// tro cache phien lam viec (dong bo moi khi login).
export interface EndUserPublic {
  id: string;
  email?: string | null;
  phone?: string | null;
  avatar?: string | null;
  displayName?: string | null;
  provider?: string | null;
  providerId?: string | null;
  status: string;
  createdAt: string;
}

const MIN_PASSWORD_LEN = 8;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  toPublic(u: any): EndUserPublic {
    return {
      id: u.id,
      email: u.email ?? null,
      phone: u.phone ?? null,
      avatar: u.avatar ?? null,
      displayName: u.displayName ?? null,
      provider: u.provider ?? null,
      providerId: u.providerId ?? null,
      status: u.status || 'active',
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt || ''),
    };
  }

  private normEmail(email?: string): string | undefined {
    const e = (email || '').trim().toLowerCase();
    return e || undefined;
  }

  private normPhone(phone?: string): string | undefined {
    const p = (phone || '').trim().replace(/[\s.-]/g, '');
    return p || undefined;
  }

  private checkPassword(pw?: string): void {
    if (!pw || pw.length < MIN_PASSWORD_LEN) {
      throw Object.assign(new Error(`mat khau phai co it nhat ${MIN_PASSWORD_LEN} ky tu`), { code: 'weak_password' });
    }
  }

  async list(opts: { page?: number; limit?: number; q?: string } = {}) {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const q = (opts.q || '').trim();
    const where: any = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { phone: { contains: q } },
            { displayName: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    return { data: rows.map((u) => this.toPublic(u)), meta: { page, limit, total } };
  }

  async getById(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id } });
    if (!u) throw Object.assign(new Error('nguoi dung khong ton tai'), { code: 'not_found' });
    return this.toPublic(u);
  }

  async create(input: { email?: string; phone?: string; displayName?: string; password?: string }) {
    const email = this.normEmail(input.email);
    const phone = this.normPhone(input.phone);
    if (!email && !phone) throw Object.assign(new Error('can email hoac so dien thoai'), { code: 'bad_request' });
    if (input.password) this.checkPassword(input.password);
    await this.assertUnique(email, phone);
    // NOTE: cast as any — schema moi co displayName/passwordHash/providerId;
    // `prisma generate` chay lai trong Docker build (mang VM chan download engine).
    const u = await this.prisma.user.create({
      data: {
        id: `u-${randomUUID()}`,
        email,
        phone,
        displayName: (input.displayName || '').trim() || null,
        passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
        status: 'active',
      } as any,
    });
    this.logger.log(`Admin tao nguoi dung ${u.id} (${email || phone}).`);
    return this.toPublic(u);
  }

  async update(
    id: string,
    input: { email?: string; phone?: string; displayName?: string; status?: string },
  ) {
    const cur: any = await this.prisma.user.findUnique({ where: { id } });
    if (!cur) throw Object.assign(new Error('nguoi dung khong ton tai'), { code: 'not_found' });
    const email = input.email !== undefined ? this.normEmail(input.email) : cur.email;
    const phone = input.phone !== undefined ? this.normPhone(input.phone) : cur.phone;
    if (!email && !phone) throw Object.assign(new Error('can email hoac so dien thoai'), { code: 'bad_request' });
    await this.assertUnique(email, phone, id);
    if (input.status !== undefined && !['active', 'banned'].includes(input.status)) {
      throw Object.assign(new Error('trang thai khong hop le'), { code: 'bad_request' });
    }
    const u = await this.prisma.user.update({
      where: { id },
      data: {
        email,
        phone,
        displayName: input.displayName !== undefined ? (input.displayName || '').trim() || null : cur.displayName,
        status: input.status ?? cur.status,
      } as any,
    });
    return this.toPublic(u);
  }

  async remove(id: string) {
    const cur = await this.prisma.user.findUnique({ where: { id } });
    if (!cur) throw Object.assign(new Error('nguoi dung khong ton tai'), { code: 'not_found' });
    // Xoa luon session de force logout; profile/lich su xoa theo cascade cua schema.
    await this.prisma.userSession.deleteMany({ where: { userId: id } }).catch(() => undefined);
    await this.prisma.user.delete({ where: { id } });
    this.logger.log(`Admin xoa nguoi dung ${id}.`);
    return { ok: true };
  }

  // Admin dat lai mat khau: hash moi + vo hieu hoa session cu (buoc dang nhap lai).
  async resetPassword(id: string, newPassword: string) {
    this.checkPassword(newPassword);
    const cur = await this.prisma.user.findUnique({ where: { id } });
    if (!cur) throw Object.assign(new Error('nguoi dung khong ton tai'), { code: 'not_found' });
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } as any });
    await this.prisma.userSession.updateMany({ where: { userId: id }, data: { isActive: false } }).catch(() => undefined);
    this.logger.log(`Admin dat lai mat khau cho nguoi dung ${id}.`);
    return { ok: true };
  }

  // Dang nhap app bang email/SDT + mat khau (mat khau do admin cap/dat lai).
  async verifyPasswordLogin(identifier: string, password: string) {
    const idf = (identifier || '').trim();
    if (!idf || !password) throw Object.assign(new Error('thieu thong tin dang nhap'), { code: 'bad_request' });
    const email = this.normEmail(idf);
    const phone = this.normPhone(idf);
    const u: any = await this.prisma.user.findFirst({
      where: { OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])] },
    });
    if (!u || !u.passwordHash) throw Object.assign(new Error('sai thong tin dang nhap'), { code: 'unauthorized' });
    const ok = await bcrypt.compare(password, u.passwordHash);
    if (!ok) throw Object.assign(new Error('sai thong tin dang nhap'), { code: 'unauthorized' });
    if (u.status !== 'active') throw Object.assign(new Error('tai khoan bi khoa'), { code: 'forbidden' });
    return this.toPublic(u);
  }

  // OAuth login: tim theo provider+providerId, roi email, roi tao moi (ke ca profile mac dinh).
  async upsertOAuth(input: { provider: string; providerId: string; email?: string; avatar?: string; displayName?: string }) {
    const email = this.normEmail(input.email);
    let u: any = await this.prisma.user.findFirst({
      where: { provider: input.provider, providerId: input.providerId } as any,
    });
    if (!u && email) u = await this.prisma.user.findUnique({ where: { email } }).catch(() => null) as any;
    if (!u) {
      u = await this.prisma.user.create({
        data: {
          id: `u-${randomUUID()}`,
          email,
          avatar: input.avatar || null,
          displayName: (input.displayName || '').trim() || null,
          provider: input.provider,
          providerId: input.providerId,
          status: 'active',
        } as any,
      });
      await this.prisma.userProfile
        .create({ data: { id: `p-${randomUUID()}`, userId: u.id, name: (input.displayName || '').trim() || 'Tôi' } })
        .catch(() => undefined);
      this.logger.log(`OAuth tao nguoi dung moi ${u.id} (${input.provider}).`);
    } else if (u.status !== 'active') {
      throw Object.assign(new Error('tai khoan bi khoa'), { code: 'forbidden' });
    } else {
      // Bo sung thong tin con thieu tu OAuth profile.
      const patch: any = {};
      if (!u.avatar && input.avatar) patch.avatar = input.avatar;
      if (!u.displayName && input.displayName) patch.displayName = input.displayName;
      if (!u.providerId) { patch.provider = input.provider; patch.providerId = input.providerId; }
      if (Object.keys(patch).length > 0) u = await this.prisma.user.update({ where: { id: u.id }, data: patch as any });
    }
    return this.toPublic(u);
  }

  private async assertUnique(email?: string, phone?: string, exceptId?: string) {
    const ors: any[] = [];
    if (email) ors.push({ email });
    if (phone) ors.push({ phone });
    if (ors.length === 0) return;
    const hit = await this.prisma.user.findFirst({
      where: { OR: ors, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    });
    if (hit) throw Object.assign(new Error('email hoac so dien thoai da ton tai'), { code: 'conflict' });
  }
}
