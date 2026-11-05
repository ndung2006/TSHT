// Workspace CMS (Dot 1b, Pha A): nhom menu sidebar theo 4 phan he va loc
// theo module quyen cua role. File thuan, khong import Vue/Nuxt de test
// truc tiep bang node --test.
//
// Luu y:
// - Loc menu chi la dieu huong: bao mat that su nam o API (guard quyen
//   tung endpoint) va nut hanh dong can() trong tung trang. An menu khong
//   thay the guard.
// - KHONG doi ten role: ten viet tat la khoa chan buoc duyet.
// - Don dep sidebar 2026-11-04: cac muc lap (Bai viet, Su kien trong
//   nhom TV, Giao dien trong nhom Bao dien tu) da bi xoa khoi menu —
//   trang page van ton tai de deep-link cu khong vo, chi khong hien
//   tren sidebar. Cac muc thuan OTT (Phim, The loai phim, Dien vien,
//   Goi cuoc) gom vao nhom "Nen tang so (OTT)" chi Super Admin thay
//   (co adminOnly, gate bang quyen '*').
//   Tap tin + Thu vien gop thanh 1 muc Kho Media (DAM) tro ve /thu-vien
//   (thu vien media that), gate bang media:* (role toa soan chi co
//   media:*); trang /tap-tin (hang doi upload/transcode VOD) co lai
//   cua vao rieng "Upload video" trong nhom TV, gate bang catalog:*
//   theo endpoint /admin/catalog/files/all ma trang do dang dung.
// - Vung hien thi (Zones) giu quyen zones:* rieng, chi doi vi tri hien
//   thi: cuoi nhom Quan ly giao dien.
// - Dot 2 sidebar 2026-11-05: So bao thanh accordion (Tao so bao / Danh
//   sach / Cho duyet); Bai bao in them Nhap + Bi tra ve, doi nhan
//   "Them bai bao in" -> "Viet bai", "Da duyet" -> "Da duyet, cho dan
//   trang"; Tin bai them Bai cua toi / Nhap cua toi / Bi tra ve; Tuong
//   thuat them Bi tra ve. Moi muc co so co countKey rieng de doc tu
//   GET /admin/sidebar-counts (khong dung lai list limit=1 hay
//   news/counts nua). Khoi ghim Tong quan / Cho toi duyet nam o
//   layouts/admin.vue, khong nam trong MENU_ITEMS.
// - Trang khong gate quyen (Thong ke, module = null) luon hien nhu hien
//   tai, vi trang do tu than khong kiem tra quyen.

export interface Workspace {
  id: string;
  label: string;
}

/** Menu con cua mot muc cha accordion: link kem query loc hoac ?new=1. */
export interface MenuChild {
  to: string;
  label: string;
  /** Gia tri status de loc danh sach; null = khong loc theo status (menu
   *  "Them..." hoac "Bai cua toi" / "Danh sach so bao"). */
  status: string | null;
  /** Hanh dong quyen bo sung (vd 'create'); null = chi can quyen module. */
  action: string | null;
  /** Khoa so dem trong GET /admin/sidebar-counts (theo muc cha); null =
   *  muc khong co so (menu "Them..." / "Tao..."). Moi muc co so trong
   *  cung muc cha phai co countKey khac nhau (vd 'draft' toan cuc vs
   *  'draftMine' cua minh) de so khong de len nhau. */
  countKey: string | null;
  /** Chi role xem toan toa soan thay (vd muc "Bai nhap" toan cuc cua
   *  Tin bai — role hep chi thay "Nhap cua toi"). CMS xac dinh rong/hep
   *  bang scope tra ve tu GET /admin/sidebar-counts (backend la nguon
   *  that, khong dung cms_role vi login tra 'admin' cho moi tai khoan). */
  wideOnly?: boolean;
}

export interface MenuItem {
  to: string;
  label: string;
  icon: string;
  workspace: string;
  /** Module quyen (catalog quyen); null = luon hien. */
  module: string | null;
  /** Chi Super Admin (quyen '*') thay; dung cho nhom OTT. */
  adminOnly?: boolean;
  /** Menu con accordion; chi muc cha tac nghiep moi co. */
  children?: MenuChild[];
}

export const WORKSPACES: Workspace[] = [
  { id: 'online', label: 'Xuất bản Báo điện tử' },
  { id: 'tv', label: 'Xuất bản Truyền hình/Phát thanh' },
  { id: 'print', label: 'Xuất bản Báo in' },
  { id: 'interface', label: 'Quản lý giao diện' },
  { id: 'admin', label: 'Quản trị chung' },
  { id: 'ott', label: 'Nền tảng số (OTT)' },
];

export const MENU_ITEMS: MenuItem[] = [
  // (1) Xuat ban Truyen hinh/Phat thanh
  { to: '/truyen-hinh', label: 'Truyền hình & EPG', icon: 'pi-tv', workspace: 'tv', module: 'tv' },
  { to: '/livestream', label: 'Livestream', icon: 'pi-broadcast-tower', workspace: 'tv', module: 'livestream' },
  { to: '/videos', label: 'Videos', icon: 'pi-play', workspace: 'tv', module: 'videos' },
  { to: '/tap-tin', label: 'Upload video', icon: 'pi-upload', workspace: 'tv', module: 'catalog' },
  { to: '/danh-muc?tab=video', label: 'Chuyên mục Video', icon: 'pi-folder', workspace: 'tv', module: 'categories' },
  { to: '/short', label: 'Short', icon: 'pi-bolt', workspace: 'tv', module: 'shorts' },
  { to: '/danh-sach-phat', label: 'Danh sách phát', icon: 'pi-list', workspace: 'tv', module: 'playlists' },
  { to: '/thu-vien', label: 'Kho Media (DAM)', icon: 'pi-images', workspace: 'tv', module: 'media' },
  // (2) Xuat ban Bao in
  {
    to: '/bao-in', label: 'Báo in', icon: 'pi-book', workspace: 'print', module: 'epaper',
    children: [
      { to: '/bao-in?new=1', label: 'Tạo số báo', status: null, action: 'create', countKey: null },
      { to: '/bao-in', label: 'Danh sách số báo', status: null, action: null, countKey: 'total' },
      { to: '/bao-in?status=pending_review', label: 'Chờ duyệt', status: 'pending_review', action: null, countKey: 'pending' },
    ],
  },
  {
    to: '/bai-bao-in', label: 'Bài báo in', icon: 'pi-file-edit', workspace: 'print', module: 'print_articles',
    children: [
      { to: '/bai-bao-in?new=1', label: 'Viết bài', status: null, action: 'create', countKey: null },
      { to: '/bai-bao-in?status=draft', label: 'Nháp', status: 'draft', action: null, countKey: 'draft' },
      { to: '/bai-bao-in?status=draft&returned=1&src=menu', label: 'Bị trả về', status: 'draft', action: null, countKey: 'returned' },
      { to: '/bai-bao-in?status=pending_review', label: 'Chờ duyệt', status: 'pending_review', action: null, countKey: 'pending' },
      { to: '/bai-bao-in?status=approved', label: 'Đã duyệt, chờ dàn trang', status: 'approved', action: null, countKey: 'approved' },
    ],
  },
  // (3) Xuat ban Bao dien tu
  {
    to: '/tin-bai', label: 'Tin bài', icon: 'pi-newspaper', workspace: 'online', module: 'articles',
    children: [
      { to: '/tin-bai?new=1', label: 'Thêm bài viết', status: null, action: 'create', countKey: null },
      { to: '/tin-bai?status=draft', label: 'Bài nháp', status: 'draft', action: null, countKey: 'draft', wideOnly: true },
      { to: '/tin-bai?mine=1', label: 'Bài của tôi', status: null, action: null, countKey: 'authored' },
      { to: '/tin-bai?mine=1&status=draft', label: 'Nháp của tôi', status: 'draft', action: null, countKey: 'draftMine' },
      { to: '/tin-bai?status=draft&returned=1&src=menu', label: 'Bị trả về', status: 'draft', action: null, countKey: 'returned' },
      { to: '/tin-bai?status=pending_review', label: 'Chờ duyệt', status: 'pending_review', action: null, countKey: 'pending' },
      { to: '/tin-bai?status=published', label: 'Đã xuất bản', status: 'published', action: null, countKey: 'published' },
    ],
  },
  { to: '/su-kien-toa-soan', label: 'Sự kiện', icon: 'pi-calendar-plus', workspace: 'online', module: 'newsroom_events' },
  // Thiet lap tin noi bat (Buoc 0 2026-11-05, phuong an A): 2 man hinh
  // sap xep dung chung 1 component, gate theo quyen zones nhu trang
  // Vung hien thi (xem zones:view, luu zones:publish).
  {
    to: '/sap-xep-noi-bat?block=noi-bat', label: 'Thiết lập tin nổi bật', icon: 'pi-star', workspace: 'online', module: 'zones',
    children: [
      { to: '/sap-xep-noi-bat?block=noi-bat', label: 'Tin nổi bật', status: null, action: null, countKey: null },
      { to: '/sap-xep-noi-bat?block=tieu-diem', label: 'Tin tiêu điểm', status: null, action: null, countKey: null },
    ],
  },
  {
    to: '/tuong-thuat', label: 'Tường thuật', icon: 'pi-megaphone', workspace: 'online', module: 'liveblog',
    children: [
      { to: '/tuong-thuat?new=1', label: 'Thêm tường thuật', status: null, action: 'create', countKey: null },
      { to: '/tuong-thuat?status=draft', label: 'Nháp', status: 'draft', action: null, countKey: 'draft' },
      { to: '/tuong-thuat?status=draft&returned=1&src=menu', label: 'Bị trả về', status: 'draft', action: null, countKey: 'returned' },
      { to: '/tuong-thuat?status=pending_review', label: 'Chờ duyệt', status: 'pending_review', action: null, countKey: 'pending' },
      { to: '/tuong-thuat?status=published', label: 'Đã xuất bản', status: 'published', action: null, countKey: 'published' },
    ],
  },
  { to: '/quang-cao-toa-soan', label: 'Quảng cáo', icon: 'pi-bullseye', workspace: 'online', module: 'newsroom_ads' },
  { to: '/banner', label: 'Banner', icon: 'pi-flag', workspace: 'online', module: 'banners' },
  { to: '/nhuan-but', label: 'Nhuận bút', icon: 'pi-star', workspace: 'online', module: 'royalties' },
  { to: '/thong-ke-nhuan-but', label: 'Thống kê nhuận bút', icon: 'pi-chart-bar', workspace: 'online', module: 'royalties' },
  { to: '/danh-muc', label: 'Danh mục', icon: 'pi-folder', workspace: 'online', module: 'categories' },
  { to: '/phan-phoi', label: 'Phân phối', icon: 'pi-share-alt', workspace: 'online', module: 'distribution' },
  // (3b) Quan ly giao dien (goi moi): menu, khoi trang chu, hot link,
  // header, footer, favicon — hien khi co bat ky quyen site_interface nao.
  // Vung hien thi (Zones) dat cuoi nhom nay (giu quyen zones:* rieng).
  { to: '/giao-dien-menu', label: 'Menu', icon: 'pi-bars', workspace: 'interface', module: 'site_interface' },
  { to: '/giao-dien-trang-chu', label: 'Trang chủ', icon: 'pi-home', workspace: 'interface', module: 'site_interface' },
  { to: '/giao-dien-hot-link', label: 'Hot Link', icon: 'pi-link', workspace: 'interface', module: 'site_interface' },
  { to: '/giao-dien-header', label: 'Header', icon: 'pi-arrow-up', workspace: 'interface', module: 'site_interface' },
  { to: '/giao-dien-footer', label: 'Footer', icon: 'pi-arrow-down', workspace: 'interface', module: 'site_interface' },
  { to: '/giao-dien-favicon', label: 'Favicon', icon: 'pi-star', workspace: 'interface', module: 'site_interface' },
  { to: '/vung-hien-thi', label: 'Vùng hiển thị', icon: 'pi-th-large', workspace: 'interface', module: 'zones' },
  // (4) Quan tri chung
  { to: '/nguoi-dung', label: 'Người dùng', icon: 'pi-users', workspace: 'admin', module: 'users' },
  { to: '/thong-bao', label: 'Thông báo', icon: 'pi-bell', workspace: 'admin', module: 'notifications' },
  { to: '/tu-khoa', label: 'Từ khoá', icon: 'pi-search', workspace: 'admin', module: 'keywords' },
  { to: '/thong-ke', label: 'Thống kê', icon: 'pi-chart-bar', workspace: 'admin', module: null },
  { to: '/cai-dat', label: 'Cài đặt', icon: 'pi-cog', workspace: 'admin', module: 'settings' },
  { to: '/nhat-ky', label: 'Nhật ký', icon: 'pi-history', workspace: 'admin', module: 'audit' },
  { to: '/roles', label: 'Quản lý quyền', icon: 'pi-shield', workspace: 'admin', module: 'roles' },
  { to: '/quy-trinh-duyet', label: 'Quy trình duyệt', icon: 'pi-list-check', workspace: 'admin', module: 'workflows' },
  { to: '/admins', label: 'Quản trị viên', icon: 'pi-user-edit', workspace: 'admin', module: 'admins' },
  { to: '/phong-ban', label: 'Phòng ban', icon: 'pi-sitemap', workspace: 'admin', module: 'departments' },
  // (5) Nen tang so (OTT): chi Super Admin thay (adminOnly, gate '*').
  { to: '/phim', label: 'Phim', icon: 'pi-video', workspace: 'ott', module: 'movies', adminOnly: true },
  { to: '/the-loai', label: 'Thể loại phim', icon: 'pi-tags', workspace: 'ott', module: 'genres', adminOnly: true },
  { to: '/dien-vien', label: 'Diễn viên', icon: 'pi-user', workspace: 'ott', module: 'actors', adminOnly: true },
  { to: '/goi-cuoc', label: 'Gói cước', icon: 'pi-credit-card', workspace: 'ott', module: 'plans', adminOnly: true },
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

/** Menu con hien khi: khong yeu cau hanh dong, hoac toan quyen, hoac co
 *  dung quyen 'module:action' (vd menu "Them..." can 'articles:create').
 *  Cha da duoc loc bang hasModulePermission truoc; con chi siet them. */
export function hasModuleAction(permissions: string[], module: string | null, action: string | null): boolean {
  if (action === null) return true;
  if (module === null) return true;
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(`${module}:${action}`);
}

export interface WorkspaceGroup {
  id: string;
  label: string;
  items: MenuItem[];
}

/** Muc con co hien voi pham vi cua user khong: wideOnly chi hien khi
 *  rong; isWide null (chua tai xong sidebar-counts hoac loi) thi hien
 *  het — fail-open, khong lam mat muc khi chua biet pham vi. */
export function isChildVisibleForScope(child: MenuChild, isWide: boolean | null): boolean {
  if (!child.wideOnly) return true;
  return isWide !== false;
}

/** Nhom menu theo workspace, chi giu workspace co it nhat 1 item hien.
 *  Muc adminOnly chi hien khi co quyen '*' (Super Admin). */
export function visibleMenu(permissions: string[]): WorkspaceGroup[] {
  const out: WorkspaceGroup[] = [];
  const isSuperAdmin = (permissions || []).includes('*');
  for (const ws of WORKSPACES) {
    const items = MENU_ITEMS.filter((m) => m.workspace === ws.id && (!m.adminOnly || isSuperAdmin) && hasModulePermission(permissions, m.module));
    if (items.length) out.push({ id: ws.id, label: ws.label, items });
  }
  return out;
}
