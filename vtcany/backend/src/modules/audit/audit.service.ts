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

  list(limit = 100): AuditEntry[] {
    return this.entries.slice(-limit).reverse();
  }
}
