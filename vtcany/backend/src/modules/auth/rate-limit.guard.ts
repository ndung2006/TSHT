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

// 300 req/phut theo IP cho endpoint thu thap cong khai (pageview +
// heartbeat kenh). Cao hon guard login vi heartbeat la 1 phut/viewer:
// 300 cho phep ~300 viewer sau cung 1 NAT IP. Key lay X-Forwarded-For
// dau tien (portal proxy forward tu trinh duyet) roi moi fallback
// req.ip; chi dung de han che lam dung, khong phai dinh danh (XFF tu
// client goi thang backend co the gia mao — chap nhan duoc vi endpoint
// chi ghi telemetry vo danh, da dedupe + loc bot + gioi han body).
// Limiter in-memory (1 backend instance); len Redis khi can mo rong.
@Injectable()
export class CollectRateLimitGuard implements CanActivate {
  private limit = 300;
  private windowMs = 60_000;

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const xff = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();
    const key = `${xff || req.ip}:${req.method}:${req.route?.path || req.url}`;
    if (!rateLimiter.tick(key, this.limit, this.windowMs)) {
      throw new HttpException('too many requests', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
