import * as bcrypt from 'bcryptjs';

export type Role = 'superadmin' | 'admin' | 'editor';
export type OAuthProvider = 'google' | 'facebook';

export interface CmsUser {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  fullName?: string;
  role: Role;
}

export interface EndUser {
  id: string;
  email?: string;
  phone?: string;
  avatar?: string;
  displayName?: string;
  provider?: OAuthProvider;
  providerId?: string;
  status: 'active' | 'banned';
  createdAt: string;
}

export interface UserProfile {
  id: string;
  userId: string;
  name: string;
  avatarUrl?: string;
  isKidsProfile: boolean;
  pinCode?: string;
}

export interface UserSession {
  sessionId: string;
  userId: string;
  kind: 'cms' | 'enduser';
  deviceInfo?: unknown;
  ip?: string;
  lastHeartbeat: number;
  isActive: boolean;
  refreshToken?: string;
  refreshExp?: number;
}

// Seed CMS/admin. Postgres (admin_users + roles) thay store nay, giu nguyen shape.
// admin@vtcany.vn / Admin@123 — superadmin theo Bước 2. Giữ admin/admin123,
// editor/editor123 để tương thích CMS + app hiện tại.
export const USERS: CmsUser[] = [
  { id: 'u-root-0', username: 'root', email: 'admin@vtcany.vn', passwordHash: bcrypt.hashSync('Admin@123', 10), fullName: 'Super Admin', role: 'superadmin' },
  { id: 'u-admin-1', username: 'admin', passwordHash: bcrypt.hashSync('admin123', 10), role: 'admin' },
  { id: 'u-editor-1', username: 'editor', passwordHash: bcrypt.hashSync('editor123', 10), role: 'editor' },
];

// End-user OAuth (users + user_profiles + user_sessions trong migration 0001).
export const END_USERS: EndUser[] = [];
export const PROFILES: UserProfile[] = [];
export const SESSIONS = new Map<string, UserSession>(); // key: sessionId

const ROLE_PERMS: Record<Role, string[]> = {
  superadmin: ['*'],
  admin: ['*'],
  editor: [
    'video:read', 'video:create', 'video:update', 'video:submit',
    'epg:read', 'epg:write',
    'category:read', 'category:create', 'category:update',
    'layout:read',
    'catalog:read', 'catalog:write',
    'user:read',
  ],
};

export function permissionsFor(role: Role): string[] {
  return ROLE_PERMS[role] || [];
}

export function hasPermission(role: Role, perm: string): boolean {
  const perms = permissionsFor(role);
  return perms.includes('*') || perms.includes(perm);
}

export function isOAuthProvider(p: string): p is OAuthProvider {
  return p === 'google' || p === 'facebook';
}
