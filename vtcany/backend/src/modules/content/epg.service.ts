import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface EpgItem {
  time: string; // HH:mm
  title: string;
  description?: string;
  end?: string;
  status: 'LIVE' | 'UPCOMING' | 'REPLAY';
}

// Key theo kenh + ngay (YYYY-MM-DD) de CMS nhap lich nhieu ngay.
// Khong truyen date = lich mac dinh (live hien tai).
// Persist qua bang catalog_settings (key "epg:<KENH>:<date>", value JSON) —
// truoc day chi la Map in-memory: redeploy/restart la mat lich CMS tu nhap,
// lam tinh nang tat EPG AIO (use_aio_epg=false) vo nghia. Hydrate luc khoi dong,
// ghi xuyen suot moi lan set; API get/set giu nguyen dang dong bo.
@Injectable()
export class EpgService implements OnModuleInit {
  private readonly logger = new Logger(EpgService.name);
  private store = new Map<string, EpgItem[]>([
    ['PHUTHO:default', [{ time: 'now', title: 'Live', status: 'LIVE' }]],
  ]);

  constructor(@Optional() private prisma?: PrismaService) {}

  async onModuleInit(): Promise<void> {
    if (!this.prisma) return;
    try {
      const rows = await this.prisma.catalogSetting.findMany({ where: { key: { startsWith: 'epg:' } } });
      let n = 0;
      for (const r of rows) {
        try {
          const items = JSON.parse(r.value);
          if (Array.isArray(items)) {
            this.store.set(r.key.slice(4), items);
            n++;
          }
        } catch { /* value hong thi bo qua, giu mac dinh */ }
      }
      if (n) this.logger.log(`Da nap ${n} lich EPG tu DB.`);
    } catch (e) {
      this.logger.warn(`Chua nap duoc EPG tu DB (dung in-memory): ${(e as Error).message}`);
    }
  }

  private key(slug: string, date?: string): string {
    return `${slug.toUpperCase()}:${date || 'default'}`;
  }

  get(slug: string, date?: string): EpgItem[] {
    return this.store.get(this.key(slug, date)) || [];
  }

  set(slug: string, timeline: EpgItem[], date?: string): EpgItem[] {
    const k = this.key(slug, date);
    this.store.set(k, timeline);
    this.persist(k, timeline);
    return timeline;
  }

  private persist(k: string, timeline: EpgItem[]): void {
    if (!this.prisma) return;
    try {
      const key = `epg:${k}`;
      const p = this.prisma.catalogSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(timeline) },
        update: { value: JSON.stringify(timeline) },
      });
      Promise.resolve(p).catch(() => { /* ghi loi thi lan sau ghi lai, khong lam hong request */ });
    } catch { /* DB chua san sang */ }
  }
}
