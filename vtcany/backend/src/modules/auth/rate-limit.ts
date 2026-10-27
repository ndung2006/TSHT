// Pure in-memory sliding-window limiter. Redis (INCR + EXPIRE) thay the
// Map nay khi len Coolify ma khong doi API tick().
export class RateLimiter {
  private hits = new Map<string, number[]>();

  tick(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
    const list = (this.hits.get(key) || []).filter((t) => now - t < windowMs);
    if (list.length >= limit) {
      this.hits.set(key, list);
      return false;
    }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}

export const rateLimiter = new RateLimiter();
