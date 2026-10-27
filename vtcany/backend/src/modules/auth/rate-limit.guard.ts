import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { rateLimiter } from './rate-limit';

// 30 req/phut cho login + cap token playback (chong do pass / share link).
// Limit/window la field thuong (khong qua constructor) de Nest DI khong can resolve.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private limit = 30;
  private windowMs = 60_000;

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const key = `${req.ip}:${req.method}:${req.route?.path || req.url}`;
    if (!rateLimiter.tick(key, this.limit, this.windowMs)) {
      throw new HttpException('too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
