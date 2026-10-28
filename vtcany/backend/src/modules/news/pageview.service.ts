import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizePageViewInput } from './pageview-input';

// Bo thu luot xem (Dot 1a): CHI thu thap, chua dashboard, chua chong
// lam dung (khong rate-limit, khong dedupe theo phien — lam sau o Dot 4
// cung dashboard). Endpoint cong khai, khong can auth, body JSON nho
// (nam trong gioi han 256kb hien tai, khong tang gioi han).
@Injectable()
export class PageViewService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: { articlePublicId?: unknown; path?: unknown }) {
    let data;
    try {
      data = normalizePageViewInput(input);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'pageview khong hop le');
    }
    await this.prisma.pageView.create({ data });
    return { ok: true };
  }
}
