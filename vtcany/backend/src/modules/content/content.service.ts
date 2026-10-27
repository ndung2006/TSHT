import { Injectable } from '@nestjs/common';

export type PublishStatus = 'draft' | 'pending' | 'published' | 'rejected';

export interface Video {
  id: string;
  title: string;
  status: PublishStatus;
  channel?: string;
}

// Phase 1: in-memory store behind the Nghiep vuNhap lieu -> Kiem duyet -> Xuat ban.
// Postgres (Prisma) replaces the Map without changing the API shape.
@Injectable()
export class ContentService {
  private videos = new Map<string, Video>();
  private seq = 0;

  create(title: string, channel = 'PHUTHO'): Video {
    const v: Video = { id: `vid-${Date.now()}-${(this.seq++).toString(36)}`, title, status: 'draft', channel };
    this.videos.set(v.id, v);
    return v;
  }

  submit(id: string): Video {
    return this.transition(id, 'draft', 'pending');
  }

  publish(id: string): Video {
    return this.transition(id, 'pending', 'published');
  }

  reject(id: string): Video {
    return this.transition(id, 'pending', 'rejected');
  }

  get(id: string): Video {
    const v = this.videos.get(id);
    if (!v) throw new Error('not found');
    return v;
  }

  update(id: string, patch: { title?: string; channel?: string }): Video {
    const v = this.get(id);
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw new Error('title is required');
      v.title = patch.title.trim();
    }
    if (patch.channel !== undefined) v.channel = patch.channel;
    return v;
  }

  list(): Video[] {
    return [...this.videos.values()];
  }

  listPaged(page = 1, limit = 20): { data: Video[]; meta: { page: number; limit: number; total: number } } {
    const p = Math.max(1, Math.floor(page) || 1);
    const l = Math.min(100, Math.max(1, Math.floor(limit) || 20));
    const all = this.list();
    return { data: all.slice((p - 1) * l, p * l), meta: { page: p, limit: l, total: all.length } };
  }

  private transition(id: string, from: PublishStatus, to: PublishStatus): Video {
    const v = this.get(id);
    if (v.status !== from) throw new Error(`invalid transition ${v.status} -> ${to}`);
    v.status = to;
    return v;
  }
}
