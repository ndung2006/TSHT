import { Injectable } from '@nestjs/common';

export interface AuditEntry {
  at: number;
  actor: string;
  role?: string;
  action: string;
  resource?: string;
}

// In-memory audit. Len Postgres: append-only table, giu nguyen ham record().
@Injectable()
export class AuditService {
  private entries: AuditEntry[] = [];

  record(entry: AuditEntry) {
    this.entries.push(entry);
    if (this.entries.length > 1000) this.entries.shift();
    return entry;
  }

  list(limit = 100, filters: { actor?: string; action?: string } = {}): AuditEntry[] {
    let rows = this.entries;
    // Loc phuc vu widget D4 dashboard GĐ1 (actor/action, chuoi con, khong
    // phan biet hoa thuong); loc truoc khi cat limit de trang co du dong.
    if (filters.actor && filters.actor.trim()) {
      const needle = filters.actor.trim().toLowerCase();
      rows = rows.filter((e) => String((e as any).actor || '').toLowerCase().includes(needle));
    }
    if (filters.action && filters.action.trim()) {
      const needle = filters.action.trim().toLowerCase();
      rows = rows.filter((e) => String((e as any).action || '').toLowerCase().includes(needle));
    }
    return rows.slice(-limit).reverse();
  }
}
