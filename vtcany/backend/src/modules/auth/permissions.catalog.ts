// Danh muc quyen chuan theo CMS VTC Play: ma tran module x hanh dong.
// Hanh dong: view (Xem), create (Them), update (Cap nhat), publish (Cong khai), delete (Xoa).
// Luu trong Role.permissions dang { "<module>": ["view","create",...] } hoac { "*": ["*"] }.

export const PERMISSION_ACTIONS = ['view', 'create', 'update', 'publish', 'delete'] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  view: 'Xem',
  create: 'Thêm',
  update: 'Cập nhật',
  publish: 'Công khai',
  delete: 'Xoá',
};

export interface PermissionModule {
  key: string;
  label: string;
  // Nhom module khong co du 5 hanh dong (giong VTC Play).
  actions: PermissionAction[];
}

const FIVE: PermissionAction[] = ['view', 'create', 'update', 'publish', 'delete'];

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: 'categories', label: 'Danh mục', actions: FIVE },
  { key: 'genres', label: 'Thể loại', actions: FIVE },
  { key: 'playlists', label: 'Danh sách phát', actions: FIVE },
  { key: 'actors', label: 'Diễn viên', actions: FIVE },
  { key: 'tv', label: 'Truyền hình', actions: FIVE },
  { key: 'epg', label: 'Lịch phát sóng', actions: FIVE },
  { key: 'videos', label: 'Video', actions: FIVE },
  { key: 'shorts', label: 'Short', actions: FIVE },
  { key: 'movies', label: 'Phim', actions: FIVE },
  { key: 'seasons', label: 'Mùa / Phần', actions: FIVE },
  { key: 'episodes', label: 'Tập phim', actions: FIVE },
  { key: 'articles', label: 'Bài viết', actions: FIVE },
  { key: 'epaper', label: 'Báo in', actions: FIVE },
  { key: 'print_articles', label: 'Bài báo in', actions: FIVE },
  { key: 'distribution', label: 'Phân phối đa nền tảng', actions: FIVE },
  { key: 'zones', label: 'Vùng hiển thị (Zone)', actions: FIVE },
  { key: 'newsroom_events', label: 'Sự kiện tòa soạn', actions: FIVE },
  { key: 'liveblog', label: 'Tường thuật trực tiếp', actions: FIVE },
  { key: 'newsroom_ads', label: 'Quảng cáo tòa soạn', actions: FIVE },
  { key: 'royalties', label: 'Nhuận bút', actions: FIVE },
  { key: 'departments', label: 'Phòng ban', actions: FIVE },
  { key: 'events', label: 'Sự kiện', actions: FIVE },
  { key: 'keywords', label: 'Từ khoá tìm kiếm', actions: FIVE },
  { key: 'banners', label: 'Banner', actions: FIVE },
  { key: 'layout', label: 'Giao diện', actions: FIVE },
  { key: 'bannedwords', label: 'Từ cấm', actions: FIVE },
  { key: 'notifications', label: 'Thông báo', actions: FIVE },
  { key: 'cache', label: 'Xoá cache', actions: FIVE },
  { key: 'livestream', label: 'Livestream', actions: FIVE },
  { key: 'plans', label: 'Gói cước', actions: FIVE },
  { key: 'catalog', label: 'Catalog (chung)', actions: FIVE },
  { key: 'users', label: 'Người dùng', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'roles', label: 'Phân quyền', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'admins', label: 'Quản trị viên', actions: ['view', 'create', 'update', 'delete'] },
  { key: 'settings', label: 'Cài đặt', actions: ['view', 'update'] },
  { key: 'audit', label: 'Nhật ký', actions: ['view', 'delete'] },
];

export type PermissionMap = Record<string, string[]>;

// Alias ten module cu <-> moi (controller cu dung so it: video, category, user).
const MODULE_ALIASES: Record<string, string> = {
  video: 'videos',
  category: 'categories',
  user: 'users',
};

function actionsFor(permMap: PermissionMap, module: string): string[] {
  const candidates = [module];
  if (MODULE_ALIASES[module]) candidates.push(MODULE_ALIASES[module]);
  for (const [k, v] of Object.entries(MODULE_ALIASES)) {
    if (v === module && k !== module) candidates.push(k);
  }
  for (const c of candidates) {
    if (permMap[c]) return permMap[c];
  }
  return [];
}

// Kiem tra 1 quyen "module:action" tren permission map.
// Tuong thich nguoc voi cac chuoi cu: write = bat ky hanh dong sua doi nao
// (create/update/publish/delete), read = view, submit = publish.
export function hasModulePermission(permMap: PermissionMap | null | undefined, required: string): boolean {
  if (!permMap || !required) return false;
  if (permMap['*']?.includes('*')) return true;
  const idx = required.indexOf(':');
  if (idx < 0) return false;
  const module = required.slice(0, idx);
  const action = required.slice(idx + 1);
  const actions = actionsFor(permMap, module);
  if (actions.includes('*') || actions.includes(action)) return true;
  if (action === 'write') return ['create', 'update', 'publish', 'delete'].some((a) => actions.includes(a));
  if (action === 'read') return actions.includes('view');
  if (action === 'submit') return actions.includes('publish');
  return false;
}

// Lam phang permission map thanh ["module:action", ...] de tra ve cho CMS login.
// Kem alias cu (module:write / module:read / module:submit) va bien the so it/so
// nhieu (video/videos, category/categories, user/users) de ham can() cu tren CMS
// (exact match) van dung ma khong can sua.
export function flattenPermissions(permMap: PermissionMap | null | undefined): string[] {
  if (!permMap) return [];
  if (permMap['*']?.includes('*')) return ['*'];
  const out = new Set<string>();
  const emit = (module: string, action: string) => {
    out.add(`${module}:${action}`);
    if (MODULE_ALIASES[module]) out.add(`${MODULE_ALIASES[module]}:${action}`);
    for (const [k, v] of Object.entries(MODULE_ALIASES)) {
      if (v === module && k !== module) out.add(`${k}:${action}`);
    }
  };
  for (const [module, actions] of Object.entries(permMap)) {
    for (const a of actions || []) emit(module, a);
    if ((actions || []).some((a) => ['create', 'update', 'publish', 'delete'].includes(a))) emit(module, 'write');
    if ((actions || []).includes('view')) emit(module, 'read');
    if ((actions || []).includes('publish')) emit(module, 'submit');
  }
  return [...out];
}

// Chuyen danh sach quyen kieu cu (["video:read", ...]) sang permission map moi.
export function legacyListToMap(perms: string[]): PermissionMap {
  const map: PermissionMap = {};
  for (const p of perms || []) {
    if (p === '*') return { '*': ['*'] };
    const idx = p.indexOf(':');
    if (idx < 0) continue;
    const module = p.slice(0, idx);
    const action = p.slice(idx + 1);
    (map[module] ||= []).push(action);
  }
  return map;
}

// Validate + chuan hoa permission map tu client (bo action khong hop le).
export function sanitizePermissionMap(input: unknown): PermissionMap {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const out: PermissionMap = {};
  for (const m of PERMISSION_MODULES) {
    const raw = (input as Record<string, unknown>)[m.key];
    if (raw === '*') { out[m.key] = ['*']; continue; }
    if (!Array.isArray(raw)) continue;
    const kept = [...new Set(raw.filter((a): a is PermissionAction =>
      typeof a === 'string' && (m.actions as string[]).includes(a),
    ))];
    if (kept.length) out[m.key] = kept;
  }
  if ((input as Record<string, unknown>)['*'] === '*') return { '*': ['*'] };
  const star = (input as Record<string, string[]>).star;
  if (Array.isArray(star) && star.includes('*')) return { '*': ['*'] };
  return out;
}
