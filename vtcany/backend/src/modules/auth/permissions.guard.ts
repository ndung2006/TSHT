import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { hasModulePermission, PermissionMap } from './permissions.catalog';
import { RolesService } from './roles.service';
import { fallbackPermissionMap, isCmsToken } from './admin-token';

@Injectable()
export class PermissionsGuard extends JwtAuthGuard {
  constructor(
    jwt: JwtService,
    private reflector: Reflector,
    @Optional() private roles?: RolesService,
  ) {
    super(jwt);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest();
    // Token doc gia/OTT (kind 'enduser') khong duoc dung route admin,
    // du chu ky JWT hop le (chung 1 secret voi token CMS).
    if (!isCmsToken(req.user)) throw new ForbiddenException('chi tai khoan CMS duoc dung');
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const userId = req.user?.sub;
    if (!userId) throw new ForbiddenException('missing permission');
    // DB-first: quyen tu Role cua admin. Null -> fallback role cung trong JWT
    // (tuong thich khi chua seed / DB loi). Token khong co role -> map
    // rong (403), KHONG mac dinh 'admin' (lo hong cu: token doc gia
    // khong co role duoc toan quyen).
    let map: PermissionMap | null = null;
    if (this.roles) {
      try {
        map = await this.roles.permissionMapForAdmin(userId);
      } catch {
        map = null;
      }
    }
    if (!map) map = fallbackPermissionMap(req.user);
    if (!required.every((p) => hasModulePermission(map!, p))) {
      throw new ForbiddenException('missing permission');
    }
    return true;
  }
}
