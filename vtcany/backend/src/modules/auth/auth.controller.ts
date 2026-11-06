import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RateLimitGuard } from './rate-limit.guard';

class LoginDto {
  @IsString()
  username!: string;
  @IsString()
  password!: string;
}

class AdminLoginDto {
  @IsString()
  email!: string;
  @IsString()
  password!: string;
}

class OAuthDto {
  @IsString()
  idToken!: string;
}

class RefreshDto {
  @IsString()
  refresh_token!: string;
}

class ChangePasswordDto {
  @IsString()
  currentPassword!: string;
  @IsString()
  newPassword!: string;
}

class TwoFactorVerifyDto {
  @IsString()
  challengeToken!: string;
  @IsString()
  code!: string;
}

class TwoFactorCodeDto {
  @IsString()
  code!: string;
}

// --- Dang ky / xac nhan email / quen mat khau cho ban doc (Giai doan 1) ---
class RegisterReaderDto {
  @IsString()
  displayName!: string;
  @IsEmail()
  email!: string;
  @IsString()
  @MinLength(8)
  password!: string;
  @IsBoolean()
  termsAccepted!: boolean;
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

class VerifyEmailDto {
  @IsString()
  token!: string;
}

class ResendVerificationDto {
  @IsEmail()
  email!: string;
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

class ForgotPasswordDto {
  @IsEmail()
  email!: string;
  @IsOptional()
  @IsString()
  captchaToken?: string;
}

class ResetPasswordDto {
  @IsString()
  token!: string;
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

class UpdateReaderMeDto {
  @IsString()
  displayName!: string;
}

class RequestDeletionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

class LogoutDto {
  @IsString()
  refresh_token!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @UseGuards(RateLimitGuard)
  @Post('login')
  async login(@Body() dto: LoginDto) {
    try {
      return await this.auth.login(dto.username, dto.password);
    } catch {
      throw new HttpException('invalid credentials', HttpStatus.UNAUTHORIZED);
    }
  }

  // Bước 2: POST /api/v1/auth/admin/login {email, password} — cho CMS.
  @UseGuards(RateLimitGuard)
  @Post('admin/login')
  async adminLogin(@Body() dto: AdminLoginDto) {
    try {
      return await this.auth.adminLogin(dto.email, dto.password);
    } catch {
      throw new HttpException('invalid credentials', HttpStatus.UNAUTHORIZED);
    }
  }

  // POST /api/v1/auth/user/login {identifier, password} — app dang nhap bang
  // email/SDT + mat khau (mat khau do admin cap/dat lai trong CMS).
  // Portal gui kem captchaToken + header x-webhook-secret (chung secret
  // noi bo) de backend biet request di qua portal va bat captcha khi da
  // cau hinh Turnstile; app go truc tiep khong gui captcha.
  @UseGuards(RateLimitGuard)
  @Post('user/login')
  async userLogin(@Req() req: any, @Body() dto: { identifier?: string; password?: string; captchaToken?: string }) {
    try {
      return await this.auth.userPasswordLogin(dto.identifier || '', dto.password || '', {
        captchaToken: dto.captchaToken,
        portalOrigin: this.isPortalOrigin(req),
      });
    } catch (e: any) {
      const msg = e?.message || 'login failed';
      if (msg.includes('tai khoan bi khoa')) throw new HttpException(msg, HttpStatus.FORBIDDEN);
      if (msg.includes('account temporarily locked')) {
        throw new HttpException('tai khoan tam khoa, thu lai sau 15 phut', HttpStatus.TOO_MANY_REQUESTS);
      }
      if (msg.includes('captcha failed')) throw new HttpException(msg, HttpStatus.BAD_REQUEST);
      throw new HttpException('invalid credentials', HttpStatus.UNAUTHORIZED);
    }
  }

  // Request di qua portal proxy: portal kem header x-webhook-secret dung
  // secret noi bo da co (MEDIA_WEBHOOK_SECRET). Header nay chi lam tang
  // yeu cau (bat captcha), khong bao gio bo qua kiem tra nao.
  private isPortalOrigin(req: any): boolean {
    const secret = (process.env.MEDIA_WEBHOOK_SECRET || '').trim();
    const given = String(req.headers?.['x-webhook-secret'] || '');
    return !!secret && given === secret;
  }

  // --- Dang ky / xac nhan email / quen mat khau cho ban doc (Giai doan 1) ---
  @UseGuards(RateLimitGuard)
  @Post('user/register')
  async registerReader(@Body() dto: RegisterReaderDto) {
    try {
      return await this.auth.registerReader(dto);
    } catch (e: any) {
      const msg = e?.message || 'register failed';
      if (msg === 'email already registered') throw new HttpException('email da duoc dang ky', HttpStatus.CONFLICT);
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(RateLimitGuard)
  @Post('user/verify-email')
  async verifyReaderEmail(@Body() dto: VerifyEmailDto) {
    try {
      return await this.auth.verifyReaderEmail(dto.token);
    } catch {
      throw new HttpException('invalid or expired token', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(RateLimitGuard)
  @Post('user/resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto) {
    try {
      return await this.auth.resendVerificationEmail(dto.email, dto.captchaToken);
    } catch (e: any) {
      throw new HttpException(e?.message || 'resend failed', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(RateLimitGuard)
  @Post('user/forgot-password')
  async forgotReaderPassword(@Body() dto: ForgotPasswordDto) {
    try {
      return await this.auth.forgotReaderPassword(dto.email, dto.captchaToken);
    } catch (e: any) {
      throw new HttpException(e?.message || 'forgot password failed', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(RateLimitGuard)
  @Post('user/reset-password')
  async resetReaderPassword(@Body() dto: ResetPasswordDto) {
    try {
      return await this.auth.resetReaderPassword(dto.token, dto.newPassword);
    } catch (e: any) {
      throw new HttpException(e?.message || 'reset password failed', HttpStatus.BAD_REQUEST);
    }
  }

  // --- Ban doc da dang nhap (JWT kind enduser) ---
  private assertEnduser(req: any) {
    const payload = req.user;
    if (!payload || payload.kind !== 'enduser') {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    return payload;
  }

  @UseGuards(JwtAuthGuard)
  @Post('user/change-password')
  async changeReaderPassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const payload = this.assertEnduser(req);
    try {
      return await this.auth.changeReaderPassword(payload.sub, payload.iat, dto.currentPassword, dto.newPassword);
    } catch (e: any) {
      const msg = e?.message || 'change password failed';
      if (msg === 'weak password' || msg === 'password unchanged') {
        throw new HttpException(msg, HttpStatus.BAD_REQUEST);
      }
      if (msg === 'current password incorrect' || msg === 'account not found') {
        throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      }
      if (msg === 'tai khoan bi khoa') throw new HttpException(msg, HttpStatus.FORBIDDEN);
      if (msg === 'session expired, please login again') throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Patch('user/me')
  async updateReaderMe(@Req() req: any, @Body() dto: UpdateReaderMeDto) {
    const payload = this.assertEnduser(req);
    try {
      return await this.auth.updateReaderMe(payload.sub, payload.iat, dto.displayName);
    } catch (e: any) {
      const msg = e?.message || 'update failed';
      if (msg === 'tai khoan bi khoa') throw new HttpException(msg, HttpStatus.FORBIDDEN);
      if (msg === 'session expired, please login again') throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('user/request-deletion')
  async requestReaderDeletion(@Req() req: any, @Body() dto: RequestDeletionDto) {
    const payload = this.assertEnduser(req);
    try {
      return await this.auth.requestReaderDeletion(payload.sub, payload.iat, dto.reason);
    } catch (e: any) {
      const msg = e?.message || 'request deletion failed';
      if (msg === 'tai khoan bi khoa') throw new HttpException(msg, HttpStatus.FORBIDDEN);
      if (msg === 'session expired, please login again') throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('user/logout')
  async logoutReader(@Body() dto: LogoutDto) {
    try {
      return await this.auth.logoutReader(dto.refresh_token);
    } catch {
      return { ok: true };
    }
  }

  // Bước 2: POST /api/v1/auth/oauth/:provider {idToken} — web chỉ dùng OAuth.
  @UseGuards(RateLimitGuard)
  @Post('oauth/:provider')
  async oauth(@Param('provider') provider: string, @Body() dto: OAuthDto) {
    try {
      return await this.auth.oauthLogin(provider, dto.idToken);
    } catch (e: any) {
      const msg = e?.message || 'oauth failed';
      if (msg.includes('email chua duoc xac nhan')) throw new HttpException(msg, HttpStatus.FORBIDDEN);
      const status = msg.includes('unsupported provider') ? HttpStatus.BAD_REQUEST : HttpStatus.UNAUTHORIZED;
      throw new HttpException(msg, status);
    }
  }

  // Bước 2 của đăng nhập khi tài khoản đã bật 2FA (Gói 2D-2):
  // POST /api/v1/auth/admin/login/2fa {challengeToken, code} -> cap token.
  @UseGuards(RateLimitGuard)
  @Post('admin/login/2fa')
  async adminLoginTwoFactor(@Body() dto: TwoFactorVerifyDto) {
    try {
      return await this.auth.verifyTwoFactor(dto.challengeToken, dto.code);
    } catch {
      throw new HttpException('invalid two-factor code', HttpStatus.UNAUTHORIZED);
    }
  }

  // 2FA tự phục vụ (đã đăng nhập) — Gói 2D-2.
  private assertCms(req: any) {
    const payload = req.user;
    if (!payload || !(payload.kind === 'cms' || payload.role)) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    return payload;
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/2fa')
  async twoFactorStatus(@Req() req: any) {
    const payload = this.assertCms(req);
    try {
      return await this.auth.twoFactorStatus(payload.sub);
    } catch (e: any) {
      throw new HttpException(e?.message || '2fa status failed', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/2fa/setup')
  async twoFactorSetup(@Req() req: any) {
    const payload = this.assertCms(req);
    try {
      return await this.auth.twoFactorSetup(payload.sub);
    } catch (e: any) {
      throw new HttpException(e?.message || '2fa setup failed', HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/2fa/enable')
  async twoFactorEnable(@Req() req: any, @Body() dto: TwoFactorCodeDto) {
    const payload = this.assertCms(req);
    try {
      return await this.auth.twoFactorEnable(payload.sub, dto.code);
    } catch (e: any) {
      const msg = e?.message || '2fa enable failed';
      if (msg === 'invalid two-factor code') throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/2fa/disable')
  async twoFactorDisable(@Req() req: any, @Body() dto: TwoFactorCodeDto) {
    const payload = this.assertCms(req);
    try {
      return await this.auth.twoFactorDisable(payload.sub, dto.code);
    } catch (e: any) {
      const msg = e?.message || '2fa disable failed';
      if (msg === 'invalid two-factor code') throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  // Đổi mật khẩu tài khoản CMS đang đăng nhập (ghi Postgres, bền qua restart).
  @UseGuards(JwtAuthGuard)
  @Post('admin/change-password')
  async changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    const payload = req.user;
    if (!payload || !(payload.kind === 'cms' || payload.role)) {
      throw new HttpException('forbidden', HttpStatus.FORBIDDEN);
    }
    try {
      return await this.auth.changePassword(payload.sub, dto.currentPassword, dto.newPassword);
    } catch (e: any) {
      const msg = e?.message || 'change password failed';
      if (msg === 'weak password' || msg === 'password unchanged') {
        throw new HttpException(msg, HttpStatus.BAD_REQUEST);
      }
      if (msg === 'current password incorrect' || msg === 'account not found') {
        throw new HttpException(msg, HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException(msg, HttpStatus.BAD_REQUEST);
    }
  }

  // Bước 2: GET /api/v1/auth/me — thông tin user hiện tại.
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    try {
      return await this.auth.me(req.user);
    } catch {
      throw new HttpException('account not found', HttpStatus.UNAUTHORIZED);
    }
  }

  @UseGuards(RateLimitGuard)
  @Post('refresh')
  async refresh(@Body() dto: RefreshDto) {
    try {
      return await this.auth.refresh(dto.refresh_token);
    } catch {
      throw new HttpException('invalid refresh token', HttpStatus.UNAUTHORIZED);
    }
  }
}
