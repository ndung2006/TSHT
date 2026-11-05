import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async ok() {
    // Readiness that (2026-11-05): phai kiem tra DB that (SELECT 1),
    // khong tra object tinh nhu truoc — de Docker/Coolify healthcheck
    // chi bao ready khi DB da ket noi (tranh route traffic vao luc
    // migrate/Nest boot, la mot mat xich gay trang chu cham sau deploy).
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({ status: 'error', service: 'vtc-any-backend', phase: 1, db: 'down' });
    }
    return { status: 'ok', service: 'vtc-any-backend', phase: 1, db: 'ok' };
  }
}
