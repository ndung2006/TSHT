import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AdminController } from './admin.controller';
import { AuthService } from './auth.service';
import { UsersService } from './users.service';
import { RolesService } from './roles.service';
import { AdminsService } from './admins.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';
import { RateLimitGuard } from './rate-limit.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET', 'change-me-dev'),
        signOptions: { expiresIn: Number(cfg.get('JWT_EXPIRES_IN', 3600)) },
      }),
    }),
  ],
  controllers: [AuthController, AdminController],
  providers: [AuthService, UsersService, RolesService, AdminsService, JwtAuthGuard, PermissionsGuard, RateLimitGuard],
  exports: [JwtModule, JwtAuthGuard, PermissionsGuard, RateLimitGuard, UsersService, RolesService],
})
export class AuthModule {}
