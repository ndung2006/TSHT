import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// Prisma client dung chung. DATABASE_URL chua dat (dev khong DB) -> khong connect,
// app van boot; cac API can DB se loi o tang service, khong crash ca he thong.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    if (!process.env.DATABASE_URL) {
      this.logger.warn('DATABASE_URL chua duoc dat — bo qua ket noi Postgres.');
      return;
    }
    try {
      await this.$connect();
      this.logger.log('Da ket noi Postgres qua Prisma.');
    } catch (e) {
      this.logger.error(`Khong ket noi duoc Postgres: ${(e as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect().catch(() => undefined);
  }
}
