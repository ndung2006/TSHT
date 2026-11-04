// Chan token doc gia/OTT khoi route admin — logic thuan, test truc tiep.
//
// Can cu (2026-11-04): 1 JwtModule/1 secret cho ca token CMS va token
// doc gia; JwtAuthGuard chi kiem tra chu ky; token doc gia khong co
// truong role nen fallback cu `permissionsFor(role || 'admin')` tra ve
// ['*'] -> token doc gia co toan quyen admin tren moi route dung
// PermissionsGuard (uploads, media-library, CRUD...). Guard sua bang
// 2 lop chan:
//  - token kind 'enduser' bi chan ngay, du chu ky hop le;
//  - token khong co role khong con mac dinh 'admin' (map rong -> 403).
// Token CMS (kind 'cms') va token khong co kind (CMS cu) khong doi.
// Khong gan media:* o day: PV/KTV dung token CMS nen khong anh huong.

import { legacyListToMap, type PermissionMap } from './permissions.catalog';
import { permissionsFor, type Role } from './users.store';

export interface TokenUser {
  sub?: string | null;
  kind?: string | null;
  role?: string | null;
}

/** Token nay co phai tai khoan CMS khong. kind 'enduser' -> false.
 *  Token khong co kind (cap truoc khi co kind) van coi la CMS de
 *  khong gay vo token dang luu hanh. */
export function isCmsToken(user: TokenUser | null | undefined): boolean {
  if (!user) return false;
  return user.kind === undefined || user.kind === null || user.kind === 'cms';
}

/** Map quyen fallback khi khong co map DB: theo role trong token.
 *  Token khong co role -> {} (khong quyen -> 403 o moi route co
 *  RequirePerms). Khong bao gio mac dinh 'admin'. */
export function fallbackPermissionMap(user: TokenUser | null | undefined): PermissionMap {
  if (!user?.role) return {};
  return legacyListToMap(permissionsFor(user.role as Role));
}
