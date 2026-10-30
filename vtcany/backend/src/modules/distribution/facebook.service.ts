import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildOAuthUrl, facebookConfigFromEnv, graphErrorMessage, graphUrl,
  parseGraphPostResult, planFacebookPost, type FacebookConfig,
} from './facebook';

// Ket noi Facebook that cho module Phan phoi (Goi 2D-3).
// Nguyen tac trung thuc: trang thai "posted" chi duoc ghi SAU KHI Graph
// API tra ve id bai dang that; loi Graph ghi vao note cua dich, khong
// gia danh thanh cong. Token Page chi nam trong DB, khong tra ra API.
@Injectable()
export class FacebookService {
  private readonly logger = new Logger(FacebookService.name);
  private readonly states = new Map<string, { actorId?: string; exp: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private config(): FacebookConfig | null {
    return facebookConfigFromEnv(process.env as Record<string, string | undefined>);
  }

  private publicMediaBase(config: FacebookConfig): string {
    const fromEnv = (process.env.PUBLIC_MEDIA_BASE_URL || process.env.VOD_PUBLIC_BASE_URL || '').trim();
    if (fromEnv) return fromEnv;
    try { return new URL(config.redirectUri).origin; } catch { return ''; }
  }

  private async connection() {
    return this.prisma.socialConnection.findUnique({ where: { platform: 'facebook' } });
  }

  /** Trang thai cho CMS: chua cau hinh / chua ket noi / da ket noi Page nao. */
  async status() {
    const configured = !!this.config();
    const conn = await this.connection().catch(() => null);
    return {
      configured,
      connected: !!conn,
      pageId: conn?.pageId || null,
      pageName: conn?.pageName || null,
      connectedBy: conn?.connectedBy || null,
      updatedAt: conn?.updatedAt || null,
    };
  }

  /** Tao URL OAuth Meta (state 1 lan, han 10 phut, gan voi nguoi bam). */
  async connectUrl(actorId?: string) {
    const config = this.config();
    if (!config) {
      throw new BadRequestException('chua cau hinh ung dung Meta (FB_APP_ID / FB_APP_SECRET / FB_REDIRECT_URI tren backend)');
    }
    const state = randomBytes(16).toString('hex');
    this.states.set(state, { actorId, exp: Date.now() + 10 * 60 * 1000 });
    return { url: buildOAuthUrl(config, state) };
  }

  /**
   * Callback OAuth: doi code -> user token -> lay Page (Page dau tien,
   * hoac Page trung FB_PAGE_ID neu co dat) -> luu Page token dai han.
   * Tra ve trang HTML thong bao de trinh duyet dung lai dep (callback do
   * Meta dieu huong ve, khong phai loi goi API cua CMS).
   */
  async handleCallback(code: string, state: string): Promise<{ pageName: string | null; pageId: string }> {
    const config = this.config();
    if (!config) throw new BadRequestException('chua cau hinh ung dung Meta');
    const rec = this.states.get(state);
    this.states.delete(state);
    if (!rec || rec.exp < Date.now()) throw new BadRequestException('phien ket noi het han hoac khong hop le — bam Ket noi lai tu CMS');
    if (!code) throw new BadRequestException('Meta khong tra ve ma ket noi');

    const tokenRes = await fetch(graphUrl('oauth/access_token'), {
      method: 'POST',
      body: new URLSearchParams({
        client_id: config.appId,
        client_secret: config.appSecret,
        redirect_uri: config.redirectUri,
        code,
      }),
    });
    const tokenJson: any = await tokenRes.json().catch(() => null);
    const userToken = tokenJson?.access_token;
    if (!tokenRes.ok || !userToken) {
      throw new BadRequestException(`doi ma ket noi that bai: ${graphErrorMessage(tokenJson)}`);
    }

    const pagesRes = await fetch(graphUrl(`me/accounts?access_token=${encodeURIComponent(userToken)}`));
    const pagesJson: any = await pagesRes.json().catch(() => null);
    const pages: any[] = Array.isArray(pagesJson?.data) ? pagesJson.data : [];
    if (!pagesRes.ok || !pages.length) {
      throw new BadRequestException('tai khoan Meta khong quan ly Page nao (hoac chua cap quyen pages_read_engagement)');
    }
    const wanted = (process.env.FB_PAGE_ID || '').trim();
    const page = (wanted && pages.find((p) => String(p.id) === wanted)) || pages[0];
    if (!page?.id || !page?.access_token) {
      throw new BadRequestException('khong lay duoc Page token tu Meta');
    }
    await this.prisma.socialConnection.upsert({
      where: { platform: 'facebook' },
      create: {
        platform: 'facebook',
        pageId: String(page.id),
        pageName: page.name || null,
        accessToken: page.access_token,
        connectedBy: rec.actorId || null,
      },
      update: {
        pageId: String(page.id),
        pageName: page.name || null,
        accessToken: page.access_token,
        connectedBy: rec.actorId || null,
      },
    });
    this.logger.log(`Da ket noi Facebook Page ${page.name || page.id} (${page.id})`);
    return { pageName: page.name || null, pageId: String(page.id) };
  }

  async disconnect() {
    await this.prisma.socialConnection.deleteMany({ where: { platform: 'facebook' } });
    return { ok: true };
  }

  /**
   * Dang that 1 bai phan phoi (da xuat ban, dich facebook dang ready/
   * failed) len Page da ket noi. Thanh cong -> target posted + url that;
   * that bai -> target failed + note la loi Graph.
   */
  async postToFacebook(publicId: string) {
    const config = this.config();
    if (!config) throw new BadRequestException('chua cau hinh ung dung Meta tren backend');
    const conn = await this.connection();
    if (!conn) throw new BadRequestException('chua ket noi Facebook Page');
    const row = await this.prisma.distributionPost.findUnique({
      where: { publicId },
      include: { targets: true },
    });
    if (!row) throw new NotFoundException('khong tim thay bai phan phoi');
    if (row.status !== 'published') throw new BadRequestException('chi dang Facebook duoc bai da xuat ban');
    const target = row.targets.find((t) => t.platform === 'facebook');
    if (!target) throw new BadRequestException('bai chua chon dich Facebook');
    if (target.status === 'posted') throw new BadRequestException('dich Facebook da dang roi');
    if (target.status !== 'ready' && target.status !== 'failed') {
      throw new BadRequestException('dich Facebook chua o trang thai San sang');
    }
    const plan = planFacebookPost(conn.pageId, row as any, this.publicMediaBase(config));
    let json: any = null;
    let ok = false;
    try {
      const res = await fetch(graphUrl(plan.endpoint), {
        method: 'POST',
        body: new URLSearchParams({ ...plan.body, access_token: conn.accessToken }),
      });
      json = await res.json().catch(() => null);
      ok = res.ok;
    } catch (e: any) {
      json = { error: { message: `khong goi duoc Graph API: ${e?.message || e}` } };
    }
    const parsed = ok ? parseGraphPostResult(json) : null;
    if (!parsed) {
      const message = graphErrorMessage(json, 'Graph API khong tra ve id bai dang');
      await this.prisma.distributionTarget.update({
        where: { id: target.id },
        data: { status: 'failed', note: message },
      });
      throw new BadRequestException(`dang Facebook that bai: ${message}`);
    }
    const updated = await this.prisma.distributionTarget.update({
      where: { id: target.id },
      data: { status: 'posted', url: parsed.url, postedAt: new Date(), note: null },
    });
    this.logger.log(`Da dang Facebook bai ${publicId} -> ${parsed.url}`);
    return { platform: updated.platform, status: updated.status, url: updated.url, postedAt: updated.postedAt, note: updated.note };
  }
}
