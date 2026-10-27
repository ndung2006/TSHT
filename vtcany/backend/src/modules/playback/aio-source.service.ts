import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { getChannels, isAudioOnly, type AioConfig } from './aio-client';

// Nguon phat VTCAIO cau hinh trong CMS (trang truyen-hinh):
// - Nhieu domain khac nhau, moi nguon co token key rieng.
// - Admin nhap domain + key, "quet kenh" thu truoc khi kich hoat.
// - Runtime (PlaybackService) uu tien nguon active trong DB,
//   fallback ve env MEDIA_BASE_URL / VTC_PARTNER_KEY khi chua cau hinh.
// - Token key KHONG bao gio tra ve qua API (chi hien thi dang che).

export interface AioSourceOut {
  id: string;
  name: string;
  domain: string;
  isActive: boolean;
  hasKey: boolean;
  keyHint: string; // **** + 4 ky tu cuoi
  createdAt: string;
  updatedAt: string;
}

export interface ScanResult {
  baseUrl: string;
  total: number;
  live: number;
  channels: Array<{
    name: string;
    status: string;
    live: boolean;
    audioOnly: boolean;
    epgId: number | null;
    hasEpg: boolean;
  }>;
}

function normalizeDomain(input: string): string {
  const d = (input || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(d)) throw new Error('domain phai bat dau bang http:// hoac https://');
  if (d.length > 200) throw new Error('domain qua dai');
  return d;
}

function maskKey(key: string): string {
  const k = key || '';
  return k.length <= 4 ? '****' : `****${k.slice(-4)}`;
}

function toOut(r: any): AioSourceOut {
  return {
    id: r.id,
    name: r.name,
    domain: r.domain,
    isActive: !!r.isActive,
    hasKey: !!(r.tokenKey || '').length,
    keyHint: maskKey(r.tokenKey || ''),
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  };
}

function friendlyScanError(e: any): Error {
  const msg = String(e?.message || e || '');
  if (/invalid partner key|401/.test(msg)) return new Error('Token key khong dung hoac het han (401)');
  if (/403/.test(msg)) return new Error('Bi tu choi (403) — kiem tra quyen cua token key');
  if (/404/.test(msg)) return new Error('Khong tim thay API kenh tren domain nay (404)');
  if (/abort|timeout|ECONN|ENOTFOUND|fetch failed|network/i.test(msg)) {
    return new Error('Khong ket noi duoc toi domain — kiem tra ten mien');
  }
  return new Error(`Quet kenh that bai: ${msg.slice(0, 160)}`);
}

@Injectable()
export class AioSourceService {
  private readonly logger = new Logger(AioSourceService.name);

  constructor(private prisma: PrismaService) {}

  // NOTE: @prisma/client trong VM chua regenerate (xem CategoryService). Dung cast tam.
  private get db(): any {
    return (this.prisma as any).tvAioSource;
  }

  async list(): Promise<AioSourceOut[]> {
    try {
      const rows = await this.db.findMany({ orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }] });
      return rows.map(toOut);
    } catch {
      return [];
    }
  }

  async create(dto: { name: string; domain: string; tokenKey: string }): Promise<AioSourceOut> {
    const name = (dto.name || '').trim();
    if (!name) throw new Error('name is required');
    const domain = normalizeDomain(dto.domain);
    const tokenKey = (dto.tokenKey || '').trim();
    if (!tokenKey) throw new Error('tokenKey is required');
    const now = new Date();
    const r = await this.db.create({
      data: {
        id: `aio-${Date.now().toString(36)}${randomBytes(3).toString('hex')}`,
        name,
        domain,
        tokenKey,
        isActive: false,
        createdAt: now,
        updatedAt: now,
      },
    });
    return toOut(r);
  }

  async update(id: string, dto: { name?: string; domain?: string; tokenKey?: string }): Promise<AioSourceOut> {
    const cur = await this.db.findUnique({ where: { id } });
    if (!cur) throw new Error('not found');
    const patch: any = { updatedAt: new Date() };
    if (dto.name !== undefined) {
      if (!(dto.name || '').trim()) throw new Error('name is required');
      patch.name = dto.name.trim();
    }
    if (dto.domain !== undefined) patch.domain = normalizeDomain(dto.domain);
    // tokenKey rong = giu nguyen key cu (khong tra key ve client bao gio)
    if (dto.tokenKey !== undefined && (dto.tokenKey || '').trim()) {
      patch.tokenKey = dto.tokenKey.trim();
    }
    const r = await this.db.update({ where: { id }, data: patch });
    return toOut(r);
  }

  async remove(id: string): Promise<{ id: string }> {
    const cur = await this.db.findUnique({ where: { id } });
    if (!cur) throw new Error('not found');
    await this.db.delete({ where: { id } });
    return { id };
  }

  async setActive(id: string): Promise<AioSourceOut> {
    const cur = await this.db.findUnique({ where: { id } });
    if (!cur) throw new Error('not found');
    // Chi 1 nguon active tai 1 thoi diem.
    await this.db.updateMany({ where: { isActive: true }, data: { isActive: false, updatedAt: new Date() } });
    const r = await this.db.update({ where: { id }, data: { isActive: true, updatedAt: new Date() } });
    this.logger.log(`Da kich hoat nguon VTCAIO: ${r.name} (${r.domain})`);
    return toOut(r);
  }

  // Cau hinh runtime cho PlaybackService: nguon active trong DB, null neu chua co.
  async getActiveConfig(): Promise<AioConfig | null> {
    try {
      const r = await this.db.findFirst({ where: { isActive: true } });
      if (!r?.tokenKey) return null;
      return { baseUrl: r.domain, partnerKey: r.tokenKey };
    } catch {
      return null;
    }
  }

  // Quet thu kenh tu 1 domain + token key (khong luu DB) — admin kiem tra truoc khi luu/kich hoat.
  async scan(domain: string, tokenKey: string): Promise<ScanResult> {
    const baseUrl = normalizeDomain(domain);
    const key = (tokenKey || '').trim();
    if (!key) throw new Error('tokenKey is required');
    let data;
    try {
      data = await getChannels({ baseUrl, partnerKey: key });
    } catch (e) {
      throw friendlyScanError(e);
    }
    const channels = (data.channels || []).map((c: any) => ({
      name: c.name,
      status: c.status,
      live: !!c.live && c.status === 'RUNNING',
      audioOnly: isAudioOnly(c),
      epgId: c.epgId ?? null,
      hasEpg: !!(c.epgId || c.epg?.schedule || c.epgNow),
    }));
    return {
      baseUrl: data.baseUrl || baseUrl,
      total: channels.length,
      live: channels.filter((c: any) => c.live).length,
      channels,
    };
  }

  // Quet lai 1 nguon da luu (dung token key trong DB, khong can nhap lai).
  async scanSaved(id: string): Promise<ScanResult> {
    const r = await this.db.findUnique({ where: { id } });
    if (!r) throw new Error('not found');
    return this.scan(r.domain, r.tokenKey);
  }
}
