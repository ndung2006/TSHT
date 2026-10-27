import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../app.module';
import { LayoutService } from '../modules/layout/layout.service';
import { USERS } from '../modules/auth/users.store';

// Bước 2/8 — Seed trang chủ + admin (chạy: npm run seed).
// Phase hiện tại seed in-memory lúc boot; khi chuyển Postgres, script này
// INSERT vào layout_blocks / admin_users thay vì verify.
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const layout = app.get(LayoutService);
    const home = layout.getHome('WEB');
    const hero = home.layout_blocks.filter((b) => b.type === 'HERO_CAROUSEL');
    const rails = home.layout_blocks.filter((b) => b.type === 'HORIZONTAL_LIST');
    if (hero.length !== 1 || hero[0].items.length !== 5) throw new Error('hero must have 5 slides');
    if (rails.length !== 5 || !rails.every((r) => r.items.length === 8)) throw new Error('need 5 rails x 8 items');

    const admin = USERS.find((u) => u.email === 'admin@vtcany.vn');
    if (!admin) throw new Error('admin@vtcany.vn missing');
    const ok = await bcrypt.compare('Admin@123', admin.passwordHash);
    if (!ok) throw new Error('admin password mismatch');

    console.log(`seed ok: ${home.layout_blocks.length} blocks (1 hero + 5 rails), admin ${admin.email} [${admin.role}]`);
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error(`seed failed: ${e?.message}`);
  process.exit(1);
});
