// Workspace CMS (Dot 1b, Pha A): nhom menu sidebar theo 4 phan he va loc
// theo module quyen cua role. File thuan, khong import Vue/Nuxt de test
// truc tiep bang node --test.
//
// Luu y:
// - Loc menu chi la dieu huong: bao mat that su nam o API (guard quyen
//   tung endpoint) va nut hanh dong can() trong tung trang. An menu khong
//   thay the guard.
// - KHONG doi ten role: ten viet tat la khoa chan buoc duyet.
// - Module OTT catalog (phim/videos/...) nam trong workspace (1) vi mo
//   hinh 4 workspace khong co workspace OTT rieng; tach sau khong doi
//   co che loc.
// - Trang khong gate quyen (Thong ke, module = null) luon hien nhu hien
//   tai, vi trang do tu than khong kiem tra quyen.

export interface Workspace {
  id: string;
  label: string;
}

export interface MenuItem {
  to: string;
  label: string;
  icon: string;
  workspace: string;
  /** Module quyen (catalog quyen); null = luon hien. */
  module: string | null;
}

export const WORKSPACES: Workspace[] = [
  { id: 'tv', label: 'Sản xuất Truyền hình/Phát thanh' },
  { id: 'print', label: 'Xuất bản Báo in' },
  { id: 'online', label: 'Xuất bản Báo điện tử' },
  { id: 'admin', label: 'Quản trị chung' },
];

export const MENU_ITEMS: MenuItem[] = [
  // (1) San xuat Truyen hinh/Phat thanh
  { to: '/truyen-hinh', label: 'Truyền hình & EPG', icon: 'pi-tv', workspace: 'tv', module: 'tv' },
  { to: '/livestream', label: 'Livestream', icon: 'pi-broadcast-tower', workspace: 'tv', module: 'livestream' },
  { to: '/videos', label: 'Videos', icon: 'pi-play', workspace: 'tv', module: 'videos' },
  { to: '/short', label: 'Short', icon: 'pi-bolt', workspace: 'tv', module: 'shorts' },
  { to: '/phim', label: 'Phim', icon: 'pi-video', workspace: 'tv', module: 'movies' },
  { to: '/tap-tin', label: 'Tập tin', icon: 'pi-folder-open', workspace: 'tv', module: 'catalog' },
  { to: '/thu-vien', label: 'Thư viện', icon: 'pi-images', workspace: 'tv', module: 'catalog' },
  { to: '/the-loai', label: 'Thể loại', icon: 'pi-tags', workspace: 'tv', module: 'genres' },
  { to: '/dien-vien', label: 'Diễn viên', icon: 'pi-user', workspace: 'tv', module: 'actors' },
  { to: '/danh-sach-phat', label: 'Danh sách phát', icon: 'pi-list', workspace: 'tv', module: 'playlists' },
  { to: '/bai-viet', label: 'Bài viết', icon: 'pi-file-edit', workspace: 'tv', module: 'articles' },
  { to: '/su-kien', label: 'Sự kiện', icon: 'pi-calendar', workspace: 'tv', module: 'events' },
  // (2) Xuat ban Bao in
  { to: '/bao-in', label: 'Báo in', icon: 'pi-book', workspace: 'print', module: 'epaper' },
  // (3) Xuat ban Bao dien tu
  { to: '/tin-bai', label: 'Tin bài', icon: 'pi-newspaper', workspace: 'online', module: 'articles' },
  { to: '/danh-muc', label: 'Danh mục', icon: 'pi-folder', workspace: 'online', module: 'categories' },
  { to: '/banner', label: 'Banner', icon: 'pi-flag', workspace: 'online', module: 'banners' },
  { to: '/giao-dien', label: 'Giao diện', icon: 'pi-images', workspace: 'online', module: 'layout' },
  // (4) Quan tri chung
  { to: '/nguoi-dung', label: 'Người dùng', icon: 'pi-users', workspace: 'admin', module: 'users' },
  { to: '/thong-bao', label: 'Thông báo', icon: 'pi-bell', workspace: 'admin', module: 'notifications' },
  { to: '/tu-khoa', label: 'Từ khoá', icon: 'pi-search', workspace: 'admin', module: 'keywords' },
  { to: '/thong-ke', label: 'Thống kê', icon: 'pi-chart-bar', workspace: 'admin', module: null },
  { to: '/goi-cuoc', label: 'Gói cước', icon: 'pi-credit-card', workspace: 'admin', module: 'plans' },
  { to: '/cai-dat', label: 'Cài đặt', icon: 'pi-cog', workspace: 'admin', module: 'settings' },
  { to: '/nhat-ky', label: 'Nhật ký', icon: 'pi-history', workspace: 'admin', module: 'audit' },
  { to: '/roles', label: 'Quản lý quyền', icon: 'pi-shield', workspace: 'admin', module: 'roles' },
  { to: '/admins', label: 'Quản trị viên', icon: 'pi-user-edit', workspace: 'admin', module: 'admins' },
  { to: '/phong-ban', label: 'Phòng ban', icon: 'pi-sitemap', workspace: 'admin', module: 'departments' },
];

/** Item hien khi: khong gan module, hoac toan quyen ('*'), hoac co bat ky
 *  hanh dong nao cua module do (danh sach quyen dang 'module:action'). */
export function hasModulePermission(permissions: string[], module: string | null): boolean {
  if (module === null) return true;
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  const prefix = `${module}:`;
  return permissions.some((p) => p.startsWith(prefix));
}

export interface WorkspaceGroup {
  label: string;
  items: MenuItem[];
}

/** Nhom menu theo workspace, chi giu workspace co it nhat 1 item hien. */
export function visibleMenu(permissions: string[]): WorkspaceGroup[] {
  const out: WorkspaceGroup[] = [];
  for (const ws of WORKSPACES) {
    const items = MENU_ITEMS.filter((m) => m.workspace === ws.id && hasModulePermission(permissions, m.module));
    if (items.length) out.push({ label: ws.label, items });
  }
  return out;
}
