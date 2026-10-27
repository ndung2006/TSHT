import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { hasModulePermission, legacyListToMap, PermissionMap } from './permissions.catalog';
import { permissionsFor, Role } from './users.store';
import { RolesService } from './roles.service';

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
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const req = ctx.switchToHttp().getRequest();
    const userId = req.user?.sub;
    if (!userId) throw new ForbiddenException('missing permission');
    // DB-first: quyen tu Role cua admin. Null -> fallback role cung trong JWT
    // (tuong thich khi chua seed / DB loi).
    let map: PermissionMap | null = null;
    if (this.roles) {
      try {
        map = await this.roles.permissionMapForAdmin(userId);
      } catch {
        map = null;
      }
    }
    if (!map) map = legacyListToMap(permissionsFor((req.user?.role as Role) || 'admin'));
    if (!required.every((p) => hasModulePermission(map!, p))) {
      throw new ForbiddenException('missing permission');
    }
    return true;
  }
}
