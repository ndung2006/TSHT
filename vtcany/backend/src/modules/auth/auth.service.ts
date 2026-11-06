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
import { MailerService } from './mailer.service';
import { turnstileEnabled, verifyTurnstile } from './turnstile';
import {
  EMAIL_VERIFICATION_TTL_MS,
  MIN_READER_PASSWORD_LEN,
  PASSWORD_RESET_TTL_MS,
  hashToken,
  isDevLinkAllowedEmail,
  isValidEmail,
  newOpaqueToken,
  passwordResetLink,
  verificationLink,
} from './reader-auth-helpers';

const REFRESH_TTL_MS = 7 * 24 * 3600 * 1000;
const ACCESS_TTL_S = 3600;

// Khoa tam dang nhap ban doc khi sai nhieu lan: 5 lan sai trong 15 phut
// -> khoa 15 phut (chi tinh theo email, luu bo nho — restart backend thi
// khoa tam duoc xoa, giong gioi han toc do hien co o rate-limit.ts).
const READER_LOCKOUT_MAX = 5;
const READER_LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const READER_LOCKOUT_MS = 15 * 60 * 1000;

// Admin CMS: uu tien Postgres (bang admin_users, seed tu USERS khi bang trong) de
// doi mat khau ben vung qua restart; khong co DB (dev/test) thi dung store in-memory.
// End-user: DB-first qua UsersService (bang users); END_USERS in-memory chi la cache
// phien lam viec, dong bo moi khi login (oauth hoac mat khau).
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  // Chi dung khi KHONG co DB (dev/test khong co Postgres): production luon
  // luu refresh token xuong DB (bang user_refresh_tokens) de ben qua
  // restart/deploy. Xem storeRefreshToken/findRefreshToken ben duoi.
  private refreshTokens = new Map<string, { userId: string; kind: 'cms' | 'enduser'; exp: number }>();
  private failedReaderLogins = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
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
    @Optional() private mailer?: MailerService,
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
    await this.revokeAllRefreshTokens(found.user.id, 'cms');
    this.logger.log(`Admin ${found.user.username} da doi mat khau.`);
    return { ok: true };
  }

  // ---- Refresh token luu DB (Giai doan 1, 2026-11-06) --------------------
  // Truoc day refresh token nam trong Map bo nho: moi lan backend deploy
  // (webhook tu dong chay moi lan push) la moi refresh token mat, ban doc
  // bi dang xuat. Nay luu xuong DB dang bam SHA-256 (khong luu gia tri
  // that), thu hoi duoc khi dang xuat / doi mat khau / dat lai mat khau.
  // Khong co DB (dev/test) thi roi ve Map cu de test cu van chay.
  private async storeRefreshToken(rec: { userId: string; kind: 'cms' | 'enduser'; token: string; exp: number }): Promise<void> {
    if (!this.prisma) {
      this.refreshTokens.set(rec.token, { userId: rec.userId, kind: rec.kind, exp: rec.exp });
      return;
    }
    await (this.prisma as any).userRefreshToken.create({
      data: { id: randomUUID(), kind: rec.kind, userId: rec.userId, tokenHash: hashToken(rec.token), expiresAt: new Date(rec.exp) },
    });
  }

  private async findRefreshToken(token: string): Promise<{ userId: string; kind: 'cms' | 'enduser'; exp: number } | null> {
    if (!this.prisma) return this.refreshTokens.get(token) || null;
    const row: any = await (this.prisma as any).userRefreshToken
      .findUnique({ where: { tokenHash: hashToken(token) } })
      .catch(() => null);
    if (!row || row.revokedAt) return null;
    return { userId: row.userId, kind: row.kind as 'cms' | 'enduser', exp: new Date(row.expiresAt).getTime() };
  }

  private async revokeRefreshToken(token: string): Promise<void> {
    if (!this.prisma) {
      this.refreshTokens.delete(token);
      return;
    }
    await (this.prisma as any).userRefreshToken
      .updateMany({ where: { tokenHash: hashToken(token) }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  private async revokeAllRefreshTokens(userId: string, kind?: 'cms' | 'enduser'): Promise<void> {
    if (!this.prisma) {
      for (const [tok, rec] of this.refreshTokens) {
        if (rec.userId === userId && (!kind || rec.kind === kind)) this.refreshTokens.delete(tok);
      }
      return;
    }
    await (this.prisma as any).userRefreshToken
      .updateMany({ where: { userId, ...(kind ? { kind } : {}), revokedAt: null }, data: { revokedAt: new Date() } })
      .catch(() => undefined);
  }

  // ---- Dang ky / xac nhan email / quen mat khau cho ban doc ---------------
  // Captcha Turnstile: bat khi co TURNSTILE_SECRET_KEY. Dang ky + quen
  // mat khau luon yeu cau captcha khi bat (khong co luong app cho 2 tac
  // vu nay). Dang nhap chi yeu cau khi request di qua portal (co header
  // x-webhook-secret khop) — app go truc tiep khong gui captcha duoc.
  private async assertCaptcha(captchaToken?: string): Promise<void> {
    if (!turnstileEnabled()) return;
    const ok = await verifyTurnstile(process.env.TURNSTILE_SECRET_KEY || '', captchaToken || '');
    if (!ok) throw new Error('captcha failed');
  }

  private async assertPortalCaptcha(opts: { captchaToken?: string; portalOrigin?: boolean }): Promise<void> {
    if (!turnstileEnabled() || !opts.portalOrigin) return;
    const ok = await verifyTurnstile(process.env.TURNSTILE_SECRET_KEY || '', opts.captchaToken || '');
    if (!ok) throw new Error('captcha failed');
  }

  // Phat token email dung mot lan (xac nhan 24h / dat lai 30 phut); token
  // cu cung muc dich con hieu luc se bi vo hieu ngay khi phat token moi.
  private async issueEmailToken(userId: string, purpose: 'email_verification' | 'password_reset'): Promise<string> {
    const token = newOpaqueToken();
    const ttl = purpose === 'email_verification' ? EMAIL_VERIFICATION_TTL_MS : PASSWORD_RESET_TTL_MS;
    await (this.prisma as any).userEmailToken
      .updateMany({ where: { userId, purpose, usedAt: null }, data: { usedAt: new Date() } })
      .catch(() => undefined);
    await (this.prisma as any).userEmailToken.create({
      data: { id: randomUUID(), userId, purpose, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + ttl) },
    });
    return token;
  }

  // Lien ket dev chi tra trong phan hoi API khi ca hai dieu kien dung:
  // DEV_AUTH_LINKS bat VA email nam trong DEV_AUTH_LINKS_ALLOW. Moi lan
  // tra deu ghi log (email, thoi diem, IP) de doi chieu sau; email ngoai
  // danh sach nhan phan hoi y nhu binh thuong, khong co lien ket.
  private devLinkFor(email: string, url: string, purpose: string, clientIp?: string): string | undefined {
    if (!this.mailer?.devLinksEnabled()) return undefined;
    if (!isDevLinkAllowedEmail(email, process.env.DEV_AUTH_LINKS_ALLOW || '')) return undefined;
    this.logger.log(`DEV_AUTH_LINK purpose=${purpose} email=${email} ip=${clientIp || 'unknown'} at=${new Date().toISOString()}`);
    return url;
  }

  async registerReader(input: {
    displayName?: string;
    email: string;
    password: string;
    termsAccepted: boolean;
    captchaToken?: string;
    clientIp?: string;
  }) {
    if (!this.users || !this.prisma) throw new Error('database unavailable');
    const email = (input.email || '').trim().toLowerCase();
    if (!isValidEmail(email)) throw new Error('invalid email');
    if (!input.password || input.password.length < MIN_READER_PASSWORD_LEN) throw new Error('weak password');
    if (!input.termsAccepted) throw new Error('terms not accepted');
    await this.assertCaptcha(input.captchaToken);
    const existing: any = await (this.prisma as any).user.findUnique({ where: { email } }).catch(() => null);
    if (existing) throw new Error('email already registered');
    const displayName = (input.displayName || '').trim() || null;
    const u: any = await (this.prisma as any).user.create({
      data: {
        id: `u-${randomUUID()}`,
        email,
        displayName,
        passwordHash: await bcrypt.hash(input.password, 10),
        termsAcceptedAt: new Date(),
        status: 'active',
      },
    });
    const token = await this.issueEmailToken(u.id, 'email_verification');
    const mail = this.mailer
      ? await this.mailer.sendVerificationEmail(email, displayName || undefined, token)
      : { sent: false, devUrl: verificationLink(token) };
    this.logger.log(`Ban doc dang ky ${u.id} (${email}); email xac nhan ${mail.sent ? 'da gui' : 'CHUA gui (chua co SMTP)'}.`);
    const devUrl = this.devLinkFor(email, mail.devUrl || verificationLink(token), 'email_verification', input.clientIp);
    return {
      ok: true,
      email,
      emailSent: mail.sent,
      ...(devUrl ? { devVerificationUrl: devUrl } : {}),
    };
  }

  async verifyReaderEmail(token: string) {
    if (!this.prisma) throw new Error('database unavailable');
    const row: any = await (this.prisma as any).userEmailToken
      .findUnique({ where: { tokenHash: hashToken(token || '') } })
      .catch(() => null);
    if (!row || row.purpose !== 'email_verification' || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
      throw new Error('invalid or expired token');
    }
    await (this.prisma as any).userEmailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await (this.prisma as any).user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } });
    const cached = END_USERS.find((u) => u.id === row.userId);
    if (cached) (cached as any).emailVerifiedAt = new Date().toISOString();
    return { ok: true };
  }

  async resendVerificationEmail(email: string, captchaToken?: string) {
    if (!this.prisma) throw new Error('database unavailable');
    await this.assertCaptcha(captchaToken);
    const norm = (email || '').trim().toLowerCase();
    // Luon tra cung mot ket qua de khong lo email co ton tai hay khong.
    const u: any = isValidEmail(norm)
      ? await (this.prisma as any).user.findUnique({ where: { email: norm } }).catch(() => null)
      : null;
    if (u && u.status === 'active' && !u.emailVerifiedAt) {
      const token = await this.issueEmailToken(u.id, 'email_verification');
      if (this.mailer) await this.mailer.sendVerificationEmail(u.email, u.displayName, token);
    }
    return { ok: true };
  }

  async forgotReaderPassword(email: string, captchaToken?: string, clientIp?: string) {
    if (!this.prisma) throw new Error('database unavailable');
    await this.assertCaptcha(captchaToken);
    const norm = (email || '').trim().toLowerCase();
    // Luon tra cung mot thong bao du email co ton tai hay khong.
    const u: any = isValidEmail(norm)
      ? await (this.prisma as any).user.findUnique({ where: { email: norm } }).catch(() => null)
      : null;
    if (u && u.status === 'active' && u.email) {
      const token = await this.issueEmailToken(u.id, 'password_reset');
      const mail = this.mailer
        ? await this.mailer.sendPasswordResetEmail(u.email, u.displayName, token)
        : { sent: false, devUrl: passwordResetLink(token) };
      this.logger.log(`Quen mat khau ${u.id}; email dat lai ${mail.sent ? 'da gui' : 'CHUA gui (chua co SMTP)'}.`);
      const devUrl = this.devLinkFor(u.email, mail.devUrl || passwordResetLink(token), 'password_reset', clientIp);
      return {
        ok: true,
        ...(devUrl ? { devResetUrl: devUrl } : {}),
      };
    }
    return { ok: true };
  }

  async resetReaderPassword(token: string, newPassword: string) {
    if (!this.prisma || !this.users) throw new Error('database unavailable');
    if (!newPassword || newPassword.length < MIN_READER_PASSWORD_LEN) throw new Error('weak password');
    const row: any = await (this.prisma as any).userEmailToken
      .findUnique({ where: { tokenHash: hashToken(token || '') } })
      .catch(() => null);
    if (!row || row.purpose !== 'password_reset' || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) {
      throw new Error('invalid or expired token');
    }
    await (this.prisma as any).userEmailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });
    await this.setReaderPassword(row.userId, newPassword);
    return { ok: true };
  }

  // Doi mat khau (ban doc tu doi) / dat lai mat khau: bam moi + ghi moc
  // passwordChangedAt + thu hoi TOAN BO refresh token + tat session OTT cu.
  // Access token cu (toi da 1 gio) bi chan o assertEnduserFresh nho moc nay.
  private async setReaderPassword(userId: string, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, 10);
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: { passwordHash: hash, passwordChangedAt: new Date() },
    });
    await this.revokeAllRefreshTokens(userId, 'enduser');
    await (this.prisma as any).userSession.updateMany({ where: { userId }, data: { isActive: false } }).catch(() => undefined);
    const cached = END_USERS.find((u) => u.id === userId);
    if (cached) (cached as any).passwordChangedAt = new Date().toISOString();
  }

  // Chan access token ban doc duoc cap TRUOC khi doi mat khau / bi khoa.
  // Khong co DB thi bo qua (che do fallback in-memory).
  private async assertEnduserFresh(userId: string, iatSeconds?: number): Promise<void> {
    if (!this.prisma) return;
    const u: any = await (this.prisma as any).user
      .findUnique({ where: { id: userId }, select: { status: true, passwordChangedAt: true } })
      .catch(() => null);
    if (!u) throw new Error('account not found');
    if (u.status !== 'active') throw new Error('tai khoan bi khoa');
    // So sanh theo GIAY (iat cua JWT chi co do chinh xac giay): token cap
    // trong cung giay voi luc doi mat khau duoc chap nhan (cua so <1s),
    // tranh truong hop dang nhap lai ngay sau khi doi mat khau bi chan oan.
    if (u.passwordChangedAt && iatSeconds && iatSeconds < Math.floor(new Date(u.passwordChangedAt).getTime() / 1000)) {
      throw new Error('session expired, please login again');
    }
  }

  async changeReaderPassword(userId: string, iatSeconds: number | undefined, currentPassword: string, newPassword: string) {
    if (!this.prisma) throw new Error('database unavailable');
    await this.assertEnduserFresh(userId, iatSeconds);
    if (!newPassword || newPassword.length < MIN_READER_PASSWORD_LEN) throw new Error('weak password');
    if (newPassword === currentPassword) throw new Error('password unchanged');
    const u: any = await (this.prisma as any).user.findUnique({ where: { id: userId } });
    if (!u || !u.passwordHash) throw new Error('account not found');
    const ok = await bcrypt.compare(currentPassword || '', u.passwordHash);
    if (!ok) throw new Error('current password incorrect');
    await this.setReaderPassword(userId, newPassword);
    return { ok: true };
  }

  async updateReaderMe(userId: string, iatSeconds: number | undefined, displayName: string) {
    if (!this.users) throw new Error('database unavailable');
    await this.assertEnduserFresh(userId, iatSeconds);
    const name = (displayName || '').trim();
    if (!name) throw new Error('display name required');
    return this.users.update(userId, { displayName: name });
  }

  // Yeu cau xoa tai khoan (Giai doan 1): chi ghi nhan + khoa tai khoan,
  // hien thi trong CMS trang Nguoi dung de admin xu ly; KHONG xoa cung.
  async requestReaderDeletion(userId: string, iatSeconds: number | undefined, reason?: string) {
    if (!this.prisma) throw new Error('database unavailable');
    await this.assertEnduserFresh(userId, iatSeconds);
    await (this.prisma as any).user.update({
      where: { id: userId },
      data: {
        deletionRequestedAt: new Date(),
        deletionRequestReason: (reason || '').trim() || null,
        status: 'banned',
      },
    });
    await this.revokeAllRefreshTokens(userId, 'enduser');
    await (this.prisma as any).userSession.updateMany({ where: { userId }, data: { isActive: false } }).catch(() => undefined);
    const cached = END_USERS.find((u) => u.id === userId);
    if (cached) cached.status = 'banned';
    this.logger.log(`Ban doc ${userId} yeu cau xoa tai khoan (da khoa).`);
    return { ok: true };
  }

  async logoutReader(refreshToken: string) {
    if (!refreshToken) return { ok: true };
    await this.revokeRefreshToken(refreshToken);
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
          emailVerified: profile.emailVerified,
        });
        user = this.syncEndUserCache(pub);
      } catch (e: any) {
        if (e?.code === 'forbidden' || e?.code === 'email_not_verified') throw e;
        this.logger.warn(`upsertOAuth DB loi, fallback in-memory: ${e?.message}`);
      }
    }
    if (!user) {
      user = END_USERS.find((u) => u.provider === provider && u.providerId === profile.providerId);
      if (!user && profile.email) {
        const byEmail = END_USERS.find((u) => (u.email || '').toLowerCase() === profile.email!.toLowerCase());
        // Cung luat gop nhu DB: khong gop vao tai khoan email chua xac
        // nhan khi OAuth khong chung minh duoc email da xac nhan.
        if (byEmail && !(byEmail as any).emailVerifiedAt && !profile.emailVerified) {
          throw Object.assign(
            new Error('email chua duoc xac nhan — hay xac nhan email truoc khi dang nhap bang Google/Facebook'),
            { code: 'email_not_verified' },
          );
        }
        user = byEmail;
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
      if (profile.emailVerified) (user as any).emailVerifiedAt = new Date().toISOString();
      END_USERS.push(user);
      PROFILES.push({ id: `p-${randomUUID()}`, userId: user.id, name: profile.displayName || 'Tôi', avatarUrl: profile.avatar, isKidsProfile: false });
    }
    if (user.status !== 'active') throw new Error('account banned');
    return this.issueEnduserPair(user);
  }

  // Dang nhap app/portal bang email/SDT + mat khau. Khoa tam theo email
  // khi sai nhieu lan (5 lan/15 phut -> khoa 15 phut); tai khoan bi khoa
  // san (banned) khong dem vao khoa tam. Captcha Turnstile chi bat cho
  // request di qua portal khi da cau hinh (xem assertPortalCaptcha).
  async userPasswordLogin(
    identifier: string,
    password: string,
    opts: { captchaToken?: string; portalOrigin?: boolean } = {},
  ) {
    if (!this.users || !process.env.DATABASE_URL) throw new Error('chua cau hinh CSDL nguoi dung');
    await this.assertPortalCaptcha(opts);
    const key = (identifier || '').trim().toLowerCase();
    const lock = this.failedReaderLogins.get(key);
    if (lock && lock.lockedUntil > Date.now()) throw new Error('account temporarily locked');
    try {
      const pub = await this.users.verifyPasswordLogin(identifier, password);
      this.failedReaderLogins.delete(key);
      return this.issueEnduserPair(this.syncEndUserCache(pub));
    } catch (e: any) {
      if (e?.message === 'tai khoan bi khoa') throw e;
      this.recordReaderLoginFailure(key);
      throw e;
    }
  }

  private recordReaderLoginFailure(key: string): void {
    const now = Date.now();
    const cur = this.failedReaderLogins.get(key);
    if (!cur || now - cur.firstAt > READER_LOCKOUT_WINDOW_MS) {
      this.failedReaderLogins.set(key, { count: 1, firstAt: now, lockedUntil: 0 });
      return;
    }
    cur.count += 1;
    if (cur.count >= READER_LOCKOUT_MAX) {
      cur.lockedUntil = now + READER_LOCKOUT_MS;
      this.logger.warn(`Khoa tam dang nhap ban doc ${key} (${READER_LOCKOUT_MAX} lan sai trong 15 phut).`);
    }
  }

  // Dong bo user tu DB vao cache END_USERS in-memory.
  private syncEndUserCache(pub: {
    id: string; email?: string | null; phone?: string | null; avatar?: string | null;
    displayName?: string | null; provider?: string | null; providerId?: string | null;
    status: string; createdAt: string; emailVerifiedAt?: string | null;
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
      if (pub.emailVerifiedAt) (cached as any).emailVerifiedAt = pub.emailVerifiedAt;
      END_USERS.push(cached);
    } else {
      cached.email = pub.email || undefined;
      cached.phone = pub.phone || undefined;
      cached.avatar = pub.avatar || undefined;
      cached.displayName = pub.displayName || undefined;
      cached.status = pub.status === 'banned' ? 'banned' : 'active';
      if (pub.emailVerifiedAt) (cached as any).emailVerifiedAt = pub.emailVerifiedAt;
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
    // Ban doc: chan access token cap truoc khi doi mat khau / bi khoa.
    await this.assertEnduserFresh(payload.sub, payload.iat);
    return { kind: 'enduser' as const, user, profiles: PROFILES.filter((p) => p.userId === user!.id) };
  }

  async refresh(refreshToken: string) {
    const rec = await this.findRefreshToken(refreshToken);
    // Rotation: token cu vo hieu ngay sau khi doi (chong replay).
    await this.revokeRefreshToken(refreshToken);
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
  ): Promise<{ providerId: string; email?: string; displayName?: string; avatar?: string; emailVerified?: boolean }> {
    if (provider === 'google') {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!res.ok) throw new Error('invalid google idToken');
      const data = (await res.json()) as any;
      if (!data.sub) throw new Error('invalid google idToken');
      // Siet aud (2026-11-06): truoc day chi kiem sub — idToken cua app
      // Google khac cung lot. Kiem khi da cau hinh GOOGLE_CLIENT_ID;
      // chua cau hinh thi ghi canh bao va giu hanh vi cu (de app khong
      // dung dot ngot truoc khi co Client ID).
      const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
      if (clientId) {
        if (data.aud !== clientId) throw new Error('invalid google idToken');
      } else {
        this.logger.warn('[oauth] GOOGLE_CLIENT_ID chua cau hinh — khong kiem aud cua Google idToken.');
      }
      return {
        providerId: `google:${data.sub}`,
        email: data.email,
        displayName: data.name,
        avatar: data.picture,
        emailVerified: data.email_verified === 'true' || data.email_verified === true,
      };
    }
    const res = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture&access_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new Error('invalid facebook token');
    const data = (await res.json()) as any;
    if (!data.id) throw new Error('invalid facebook token');
    // Siet app (2026-11-06): kiem token thuoc dung app dang nhap (app
    // rieng, KHONG dung chung app Phan phoi) qua debug_token khi da cau
    // hinh FB_LOGIN_APP_ID/FB_LOGIN_APP_SECRET; chua co thi canh bao.
    const fbAppId = (process.env.FB_LOGIN_APP_ID || '').trim();
    const fbAppSecret = (process.env.FB_LOGIN_APP_SECRET || '').trim();
    if (fbAppId && fbAppSecret) {
      const dbg = await fetch(
        `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(idToken)}&access_token=${encodeURIComponent(`${fbAppId}|${fbAppSecret}`)}`,
      );
      const dbgData = (await dbg.json().catch(() => null)) as any;
      if (!dbg.ok || !dbgData?.data?.is_valid || dbgData.data.app_id !== fbAppId) {
        throw new Error('invalid facebook token');
      }
    } else {
      this.logger.warn('[oauth] FB_LOGIN_APP_ID/FB_LOGIN_APP_SECRET chua cau hinh — khong kiem app cua Facebook token.');
    }
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
    await this.storeRefreshToken({ userId: sub, kind: 'cms', token: refresh_token, exp: Date.now() + REFRESH_TTL_MS });
    this.trackSession(sub, 'cms', refresh_token);
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, role, permissions };
  }

  private async issueEnduserPair(user: EndUser) {
    const access_token = await this.jwt.signAsync({ sub: user.id, kind: 'enduser', provider: user.provider });
    const refresh_token = randomBytes(32).toString('hex');
    await this.storeRefreshToken({ userId: user.id, kind: 'enduser', token: refresh_token, exp: Date.now() + REFRESH_TTL_MS });
    this.trackSession(user.id, 'enduser', refresh_token);
    return { access_token, refresh_token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, user };
  }
}
