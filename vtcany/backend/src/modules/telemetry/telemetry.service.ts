import { Injectable } from '@nestjs/common';

interface Session {
  sessionId: string;
  ip: string;
  lastPing: number;
}

interface WatchState {
  positionSec: number;
  bitrate?: string;
  updatedAt: number;
}

// Phase 1.1: in-memory store. Interface san de thay bang Redis (sessions) +
// Postgres/Timescale (watch history) ma khong doi API.
const SESSION_TTL_MS = 45_000;
const MAX_DEVICES = 2;

@Injectable()
export class TelemetryService {
  private sessions = new Map<string, Map<string, Session>>(); // userId -> sessionId -> Session
  private watch = new Map<string, WatchState>(); // `${userId}:${contentId}`

  heartbeat(input: {
    userId: string;
    sessionId: string;
    contentId: string;
    positionSec: number;
    bitrate?: string;
    ip?: string;
  }): { ok: true; kicked: false } {
    const now = Date.now();
    let userSessions = this.sessions.get(input.userId);
    if (!userSessions) {
      userSessions = new Map();
      this.sessions.set(input.userId, userSessions);
    }
    // Expire stale sessions first (quyet dinh kick dua tren session song).
    for (const [sid, s] of userSessions) {
      if (now - s.lastPing > SESSION_TTL_MS) userSessions.delete(sid);
    }
    userSessions.set(input.sessionId, {
      sessionId: input.sessionId,
      ip: input.ip || 'unknown',
      lastPing: now,
    });
    if (userSessions.size > MAX_DEVICES) {
      userSessions.delete(input.sessionId);
      const err: any = new Error('concurrency limit exceeded');
      err.status = 403;
      throw err;
    }
    this.watch.set(`${input.userId}:${input.contentId}`, {
      positionSec: input.positionSec,
      bitrate: input.bitrate,
      updatedAt: now,
    });
    return { ok: true, kicked: false };
  }

  continueWatching(userId: string) {
    const out: Array<{ contentId: string; positionSec: number; updatedAt: number }> = [];
    for (const [key, w] of this.watch) {
      const [u, ...rest] = key.split(':');
      if (u === userId) out.push({ contentId: rest.join(':'), positionSec: w.positionSec, updatedAt: w.updatedAt });
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }
}
