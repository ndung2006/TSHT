import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { END_USERS, EndUser, OAuthProvider, PROFILES, SESSIONS, USERS, CmsUser, Role, isOAuthProvider, permissionsFor } from './users.store';
import { flattenPermissions } from './permissions.catalog';
import { RolesService } from './roles.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from './users.service';
import { generateTotpSecret, otpauthUrl, verifyTotp } from './totp';

const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;
const ACCESS_TTL_S = 3600;

// Admin CMS: uu tien Postgres (bang admin_users, seed tu USERS khi bang trong) de
// doi mat khau ben vung qua restart; khong co DB (dev/test) thi dung store in-memory.
// End-user: DB-first qua UsersService (bang users); END_USERS in-memory chi la cache
// phien lam viec, dong bo moi khi login (oauth hoac mat khau).
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private refreshTokens = new Map<string, { userId: string; kind: 'cms' | 'enduser'; exp: number }>();
  private dbSeeded = false;
  // DB loi thoang qua: chi fallback in-memory trong cua so cooldown nay, het
  // han se thu lai DB. Ban cu dung co co dinh vinh vien (dbDown) khien auth
  // doc sai nguon mat khau den het doi process (su co mat khau 19-21/10/2026).
  private dbDownUntil = 0;

  private dbCoolingDown(): boolean {
    return Date.now() < this.dbDownUntil;
  }

  private noteDbFailure(e: unknown): void {
    this.dbDownUntil = Date.now() + 30_000;
    this.logger.warn(`Admin DB loi, fallback in-memory tam thoi (thu lai sau 30s): ${(e as Error).message}`);
  }

  constructor(
    private jwt: JwtService,
    @Optional() private prisma?: PrismaService,
    @Optional() private users?: UsersService,
    @Optional() private roles?: RolesService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureDbSeed();
  }

  // Seed admin mac dinh vao Postgres khi bang admin_users con trong. Id giu nguyen
  // cua store in-memory de token/lien ket cu khong bi lech.
  private async ensureDbSeed(): Promise<void> {
    if (!this.prisma || this.dbSeeded || this.dbCoolingDown()) return;
    try {
      const count = await this.prisma.adminUser.count();
      if (count === 0) {
        for (const u of USERS) {
          await this.prisma.adminUser.create({
            data: {
              id: u.id,
              username: u.username,
              email: u.email ?? null,
              passwordHash: u.passwordHash,
              fullName: u.fullName ?? null,
              roleName: u.role,
              status: 'active',
            },
          });
        }
        this.logger.log(`Da seed ${USERS.length} tai khoan admin vao Postgres.`);
      }
      this.dbSeeded = true;
    } catch (e) {
      this.noteDbFailure(e);
    }
  }

  private rowToUser(row: any): CmsUser {
    return {
      id: row.id,
      username: row.username || row.email || row.id,
      email: row.email ?? undefined,
      passwordHash: row.passwordHash,
      fullName: row.fullName ?? undefined,
      role: (row.roleName as Role) || 'admin',
      totpSecret: row.totpSecret ?? null,
      totpEnabled: row.totpEnabled === true,
    };
  }

  // Tim tai khoan CMS: DB truoc (neu co), fallback in-memory. status != active -> null.
  private async findCmsUser(where: { id?: string; email?: string; username?: string }): Promise<{ user: CmsUser; source: 'db' | 'memory' } | null> {
    if (this.prisma && !this.dbCoolingDown()) {
      try {
        await this.ensureDbSeed();
        const row = await this.prisma.adminUser.findFirst({
          where: where.id
            ? { id: where.id }
            : where.email
              ? { email: { equals: where.email, mode: 'insensitive' } }
              : { username: where.username },
        });
        if (row) {
          if (row.status !== 'active') return null;
          return { user: this.rowToUser(row), source: 'db' };
        }
      } catch (e) {
        this.noteDbFailure(e);
      }
    }
    const mem = USERS.find((u) =>
      where.id ? u.id === where.id
        : where.email ? (u.email || '').toLowerCase() === (where.email || '').toLowerCase()
          : u.username === where.username,
    );
    return mem ? { user: mem, source: 'memory' } : null;
  }

  // Quyen tra ve cho CMS login: DB-first (Role.permissions), fallback role cung.
  private async permissionsForAdmin(userId: string, source: 'db' | 'memory', legacyRole: Role): Promise<string[]> {
    if (source === 'db' && this.roles) {
      try {
        const map = await this.roles.permissionMapForAdmin(userId);
        if (map) return flattenPermissions(map);
      } catch {
        /* fallback */
      }
    }
    return permissionsFor(legacyRole);
  }

  // ---- CMS username login (giữ tương thích app/CMS hiện tại) ----
  async login(username: string, password: string) {
    const found = await this.findCmsUser({ username });
    if (!found) throw new Error('invalid credentials');
    const ok = await bcrypt.compare(password, found.user.passwordHash);
    if (!ok) throw new Error('invalid credentials');
    return this.afterCmsPassword(found);
  }

  // ---- Bước 2: POST /auth/admin/login {email, password} ----
  async adminLogin(email: string, password: string) {
    const found = await this.findCmsUser({ email });
    if (!found) throw new Error('invalid credentials');
    const ok = await bcrypt.compare(password, found.user.passwordHash);
    if (!ok) throw new Error('invalid credentials');
    return this.afterCmsPassword(found);
  }

  // Sau khi mat khau dung: tai khoan da bat 2FA thi tra ve "thach thuc"
  // thay vi cap token ngay; chua bat thi dang nhap nhu cu (2FA la opt-in
  // tung tai khoan nen admin cu khong bi khoa ngoai — Goi 2D-2).
  private async afterCmsPassword(found: { user: CmsUser; source: 'db' | 'memory' }) {
    if (found.user.totpEnabled && found.user.totpSecret) {
      return this.issueTwoFactorChallenge(found);
    }
    await this.touchLastLogin(found);
    return this.issueCmsPair(found.user.id, found.user.username, found.user.role, found.source);
  }

  // ---- 2FA TOTP (Goi 2D-2) -------------------------------------------------
  // Challenge token ky bang secret PHAT SINH (JWT_SECRET + hau to) nen
  // JwtAuthGuard (ky bang JWT_SECRET goc) tu choi no: khong the dung
  // challenge lam access token. Han 5 phut, dung mot muc dich.
  private challengeKey(): string {
    return `${process.env.JWT_SECRET || 'change-me-dev'}:2fa-challenge`;
  }

  private async issueTwoFactorChallenge(found: { user: CmsUser; source: 'db' | 'memory' }) {
    const challengeToken = await this.jwt.signAsync(
      { sub: found.user.id, username: found.user.username, kind: 'cms', purpose: '2fa-challenge' },
      { secret: this.challengeKey(), expiresIn: 300 },
    );
    return { requiresTwoFactor: true, challengeToken, token_type: 'Bearer' };
  }

  /** Bước 2 của đăng nhập: POST /auth/admin/login/2fa {challengeToken, code}. */
  async verifyTwoFactor(challengeToken: string, code: string) {
    let payload: any;
    try {
      payload = await this.jwt.verifyAsync(challengeToken, { secret: this.challengeKey() });
    } catch {
      throw new Error('invalid or expired challenge');
    }
    if (!payload || payload.purpose !== '2fa-challenge' || !payload.sub) {
      throw new Error('invalid or expired challenge');
    }
    const found = await this.findCmsUser({ id: String(payload.sub) });
    if (!found || !found.user.totpEnabled || !found.user.totpSecret) {
      throw new Error('invalid or expired challenge');
    }
    if (!verifyTotp(found.user.totpSecret, code, Date.now())) {
      throw new Error('invalid two-factor code');
    }
    await this.touchLastLogin(found);
    return this.issueCmsPair(found.user.id, found.user.username, found.user.role, found.source);
  }

  // Cac thao tac 2FA tu phuc vu can ghi xuong DB; dang fallback in-memory
  // (DB loi) thi tu choi nhu doi mat khau — ghi RAM se mat khi restart.
  private async requireDbAdmin(userId: string) {
    const found = await this.findCmsUser({ id: userId });
    if (!found) throw new Error('account not found');
    if (this.prisma && found.source !== 'db') {
      throw new Error('database unavailable: cannot manage 2FA while in fallback mode');
    }
    if (!this.prisma || found.source !== 'db') {
      throw new Error('database unavailable: 2FA requires the admin database');
    }
    return found;
  }

  async twoFactorStatus(userId: string) {
    const found = await this.findCmsUser({ id: userId });
    if (!found) throw new Error('account not found');
    return { enabled: !!(found.user.totpEnabled && found.user.totpSecret) };
  }

  /** Sinh secret moi vao o "cho xac nhan" + tra otpauth URL. Chua bat 2FA. */
  async twoFactorSetup(userId: string) {
    const found = await this.requireDbAdmin(userId);
    const secret = generateTotpSecret();
    await this.prisma!.adminUser.update({
      where: { id: found.user.id },
      data: { totpPendingSecret: secret },
    });
    const account = found.user.email || found.user.username;
    return { secret, otpauthUrl: otpauthUrl(secret, account) };
  }

  /** Xac nhan ma dau tien -> bat 2FA (secret cho -> secret chinh thuc). */
  async twoFactorEnable(userId: string, code: string) {
    const found = await this.requireDbAdmin(userId);
    const row = await this.prisma!.adminUser.findUnique({ where: { id: found.user.id } });
    const pending = (row as any)?.totpPendingSecret as string | null;
    if (!pending) throw new Error('no pending 2FA setup');
    if (!verifyTotp(pending, code, Date.now())) throw new Error('invalid two-factor code');
    await this.prisma!.adminUser.update({
      where: { id: found.user.id },
      data: { totpSecret: pending, totpPendingSecret: null, totpEnabled: true },
    });
    this.logger.log(`Admin ${found.user.username} da BAT 2FA.`);
    return { ok: true, enabled: true };
  }

  /** Tat 2FA: bat buoc nhap ma dang dung de tranh bi tat trom tu phien bi chiem. */
  async twoFactorDisable(userId: string, code: string) {
    const found = await this.requireDbAdmin(userId);
    if (!found.user.totpSecret || !verifyTotp(found.user.totpSecret, code, Date.now())) {
      throw new Error('invalid two-factor code');
    }
    await this.prisma!.adminUser.update({
      where: { id: found.user.id },
      data: { totpSecret: null, totpPendingSecret: null, totpEnabled: false },
    });
    this.logger.log(`Admin ${found.user.username} da TAT 2FA.`);
    return { ok: true, enabled: false };
  }

  private async touchLastLogin(found: { user: CmsUser; source: 'db' | 'memory' }): Promise<void> {
    if (found.source !== 'db' || !this.prisma) return;
    await this.prisma.adminUser
      .update({ where: { id: found.user.id }, data: { lastLogin: new Date() } })
      .catch(() => undefined);
  }

  // ---- Đổi mật khẩu admin: ghi DB (bền qua restart), thu hồi refresh token cũ ----
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword && newPassword === currentPassword) throw new Error('password unchanged');
    if (!newPassword || newPassword.length < 10) throw new Error('weak password');
    const found = await this.findCmsUser({ id: userId });
    if (!found) throw new Error('account not found');
    const ok = await bcrypt.compare(currentPassword || '', found.user.passwordHash);
    if (!ok) throw new Error('current password incorrect');
    // Co DB nhung tai khoan chi tim thay o fallback in-memory (DB dang loi):
    // TU CHOI doi mat khau. Ghi vao RAM luc nay se mat khi restart va gay
    // cam giac mat khau "tu quay ve" mat khau cu trong DB.
    if (this.prisma && found.source !== 'db') {
      throw new Error('database unavailable: cannot change password while in fallback mode');
    }
    const hash = await bcrypt.hash(newPassword, 10);
    if (found.source === 'db' && this.prisma) {
      await this.prisma.adminUser.update({ where: { id: found.user.id }, data: { passwordHash: hash } });
    }
    const mem = USERS.find((u) => u.id === found.user.id);
    if (mem) mem.passwordHash = hash;
    for (const [tok, rec] of this.refreshTokens) {
      if (rec.userId === found.user.id && rec.kind === 'cms') this.refreshTokens.delete(tok);
    }
    this.logger.log(`Admin ${found.user.username} da doi mat khau.`);
    return { ok: true };
  }

  // ---- Bước 2: POST /auth/oauth/:provider {idToken} ----
  // DB-first: upsert vao Postgres (ben vung, CMS quan ly duoc); khong co DB
  // thi fallback store in-memory nhu cu. Ket qua luon duoc dong bo vao cache
  // END_USERS de me()/refresh() chay binh thuong.
  async oauthLogin(provider: string, idToken: string) {
    if (!isOAuthProvider(provider)) throw new Error('unsupported provider (only google, facebook)');
    if (!idToken) throw new Error('missing idToken');
    const profile = await this.verifyIdToken(provider, idToken);
    let user: EndUser | undefined;
    if (this.users && process.env.DATABASE_URL) {
      try {
        const pub = await this.users.upsertOAuth({
          provider,
          providerId: profile.providerId,
          email: profile.email,
          avatar: profile.avatar,
          displayName: profile.displayName,
        });
        user = this.syncEndUserCache(pub);
      } catch (e: any) {
        if (e?.code === 'forbidden') throw new Error('account banned');
        this.logger.warn(`upsertOAuth DB loi, fallback in-memory: ${e?.message}`);
      }
    }
    if (!user) {
      user = END_USERS.find((u) => u.provider === provider && u.providerId === profile.providerId);
      if (!user && profile.email) {
        user = END_USERS.find((u) => (u.email || '').toLowerCase() === profile.email!.toLowerCase());
      }
    }
    if (!user) {
      user = {
        id: `u-${randomUUID()}`,
        email: profile.email,
        avatar: profile.avatar,
        displayName: profile.displayName,
        provider,
        providerId: profile.providerId,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      END_USERS.push(user);
      PROFILES.push({ id: `p-${randomUUID()}`, userId: user.id, name: profile.displayName || 'Tôi', avatarUrl: profile.avatar, isKidsProfile: false });
    }
    if (user.status !== 'active') throw new Error('account banned');
    return this.issueEnduserPair(user);
  }

  // Dang nhap app bang email/SDT + mat khau (mat khau do admin cap trong CMS).
  async userPasswordLogin(identifier: string, password: string) {
    if (!this.users || !process.env.DATABASE_URL) throw new Error('chua cau hinh CSDL nguoi dung');
    const pub = await this.users.verifyPasswordLogin(identifier, password);
    return this.issueEnduserPair(this.syncEndUserCache(pub));
  }

  // Dong bo user tu DB vao cache END_USERS in-memory.
  private syncEndUserCache(pub: {
    id: string; email?: string | null; phone?: string | null; avatar?: string | null;
    displayName?: string | null; provider?: string | null; providerId?: string | null;
    status: string; createdAt: string;
  }): EndUser {
    let cached = END_USERS.find((u) => u.id === pub.id);
    if (!cached) {
      cached = {
        id: pub.id, email: pub.email || undefined, phone: pub.phone || undefined,
        avatar: pub.avatar || undefined, displayName: pub.displayName || undefined,
        provider: (pub.provider as OAuthProvider) || undefined,
        providerId: pub.providerId || undefined,
        status: pub.status === 'banned' ? 'banned' : 'active',
        createdAt: pub.createdAt,
      };
      END_USERS.push(cached);
    } else {
      cached.email = pub.email || undefined;
      cached.phone = pub.phone || undefined;
      cached.avatar = pub.avatar || undefined;
      cached.displayName = pub.displayName || undefined;
      cached.status = pub.status === 'banned' ? 'banned' : 'active';
    }
    return cached;
  }

  // ---- Bước 2: GET /auth/me ----
  async me(payload: any) {
    if (!payload) throw new Error('invalid token');
    if (payload.kind === 'cms' || payload.role) {
      const found = await this.findCmsUser({ id: payload.sub });
      if (!found) throw new Error('account not found');
      const user = found.user;
      return {
        kind: 'cms' as const,
        user: { id: user.id, username: user.username, email: user.email, fullName: user.fullName, role: user.role },
        permissions: await this.permissionsForAdmin(user.id, found.source, user.role),
      };
    }
    const user = END_USERS.find((u) => u.id === payload.sub);
    if (!user || user.status !== 'active') throw new Error('account not found');
    return { kind: 'enduser' as const, user, profiles: PROFILES.filter((p) => p.userId === user!.id) };
  }

  async refresh(refreshToken: string) {
    const rec = this.refreshTokens.get(refreshToken);
    // Rotation: token cu vo hieu ngay sau khi doi (chong replay).
    this.refreshTokens.delete(refreshToken);
    if (!rec || rec.exp < Date.now()) throw new Error('invalid refresh token');
    if (rec.kind === 'cms') {
      const found = await this.findCmsUser({ id: rec.userId });
      if (!found) throw new Error('invalid refresh token');
      return this.issueCmsPair(found.user.id, found.user.username, found.user.role, found.source);
    }
    const user = END_USERS.find((u) => u.id === rec.userId);
    if (!user || user.status !== 'active') throw new Error('invalid refresh token');
    return this.issueEnduserPair(user);
  }

  private async verifyIdToken(
    provider: OAuthProvider,
    idToken: string,
  ): Promise<{ providerId: string; email?: string; displayName?: string; avatar?: string }> {
    if (provider === 'google') {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!res.ok) throw new Error('invalid google idToken');
      const data = (await res.json()) as any;
      if (!data.sub) throw new Error('invalid google idToken');
      return { providerId: `google:${data.sub}`, email: data.email, displayName: data.name, avatar: data.picture };
    }
    const res = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new Error('invalid facebook token');
    const data = (await res.json()) as any;
    if (!data.id) throw new Error('invalid facebook token');
    return {
      providerId: `facebook:${data.id}`,
      email: data.email,
      displayName: data.name,
      avatar: data.picture?.data?.url,
    };
  }

  private trackSession(userId: string, kind: 'cms' | 'enduser', refreshToken: string) {
    const sessionId = `sess-${randomUUID()}`;
    SESSIONS.set(sessionId, {
      sessionId, userId, kind, lastHeartbeat: Date.now(), isActive: true,
      refreshToken, refreshExp: Date.now() + REFRESH_TTL_MS,
    });
  }

  private async issueCmsPair(sub: string, username: string, role: string, source: 'db' | 'memory' = 'memory') {
    const permissions = await this.permissionsForAdmin(sub, source, role as any);
    const access_token = await this.jwt.signAsync({ sub, username, role, permissions, kind: 'cms' });
    const refresh_token = randomBytes(32).toString('hex');
    this.refreshTokens.set(refresh_token, { userId: sub, kind: 'cms', exp: Date.now() + REFRESH_TTL_MS });
    this.trackSession(sub, 'cms', refresh_token);
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, role, permissions };
  }

  private async issueEnduserPair(user: EndUser) {
    const access_token = await this.jwt.signAsync({ sub: user.id, kind: 'enduser', provider: user.provider });
    const refresh_token = randomBytes(32).toString('hex');
    this.refreshTokens.set(refresh_token, { userId: user.id, kind: 'enduser', exp: Date.now() + REFRESH_TTL_MS });
    this.trackSession(user.id, 'enduser', refresh_token);
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, user };
  }
}
