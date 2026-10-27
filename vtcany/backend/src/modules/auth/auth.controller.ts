import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
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
  @UseGuards(RateLimitGuard)
  @Post('user/login')
  async userLogin(@Body() dto: { identifier?: string; password?: string }) {
    try {
      return await this.auth.userPasswordLogin(dto.identifier || '', dto.password || '');
    } catch (e: any) {
      const msg = e?.message || 'login failed';
      if (msg.includes('tai khoan bi khoa')) throw new HttpException(msg, HttpStatus.FORBIDDEN);
      throw new HttpException('invalid credentials', HttpStatus.UNAUTHORIZED);
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
      const status = msg.includes('unsupported provider') ? HttpStatus.BAD_REQUEST : HttpStatus.UNAUTHORIZED;
      throw new HttpException(msg, status);
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
