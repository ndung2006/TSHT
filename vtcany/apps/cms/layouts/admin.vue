<template>
  <div class="flex min-h-screen">
    <!-- Drawer mobile: lop mo dong drawer khi bam ra ngoai -->
    <div v-if="sidebarOpen" class="fixed inset-0 z-30 bg-black/50 md:hidden" @click="sidebarOpen = false" />
    <aside :class="asideClass">
      <div class="flex items-center justify-between">
        <NuxtLink to="/" class="flex items-center gap-2 px-2 py-3">
          <img src="/icons/vtc-tsht/logo-vtc-tsht-transparent.svg" alt="VTC TSHT" width="130" height="50" />
        </NuxtLink>
        <span class="md:hidden"><Button icon="pi pi-times" text rounded aria-label="Đóng menu" @click="sidebarOpen = false" /></span>
      </div>
      <nav class="mt-2 flex flex-col text-sm">
        <div class="flex flex-col">
          <NuxtLink to="/"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/10"
            :class="{ '!bg-white/15 font-semibold': route.path === '/' && !route.query.focus }">
            <i class="pi pi-home" />
            Tổng quan
          </NuxtLink>
          <NuxtLink to="/?focus=A1"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/10"
            :class="{ '!bg-white/15 font-semibold': route.path === '/' && route.query.focus === 'A1' }">
            <i class="pi pi-inbox" />
            <span class="truncate">Chờ tôi duyệt<template v-if="myQueueCount !== null"> ({{ myQueueCount }})</template></span>
          </NuxtLink>
        </div>
        <template v-for="g in groups" :key="g.id">
          <button type="button"
            class="mt-3 flex w-full items-center gap-2 px-3 text-left text-[11px] font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-300"
            :aria-expanded="!isCollapsed(g.id)" @click="toggleGroup(g.id)">
            <i :class="['pi', isCollapsed(g.id) ? 'pi-chevron-right' : 'pi-chevron-down']" />
            {{ g.label }}
          </button>
          <template v-if="!isCollapsed(g.id)">
            <template v-for="m in g.items" :key="m.to">
              <template v-if="m.children?.length">
                <div class="flex items-center gap-1 rounded-lg hover:bg-white/10"
                  :class="{ '!bg-white/15': route.path === m.to }">
                  <NuxtLink :to="m.to" class="flex flex-1 items-center gap-3 px-3 py-2.5"
                    active-class="font-semibold">
                    <i :class="['pi', m.icon]" />
                    {{ m.label }}
                  </NuxtLink>
                  <button type="button" class="px-2 py-2.5 text-neutral-400 hover:text-neutral-100"
                    :aria-expanded="isParentOpen(m)" :aria-label="isParentOpen(m) ? 'Thu gọn' : 'Mở rộng'"
                    @click="toggleParent(m)">
                    <i :class="['pi', isParentOpen(m) ? 'pi-chevron-down' : 'pi-chevron-right']" />
                  </button>
                </div>
                <template v-if="isParentOpen(m)">
                  <NuxtLink v-for="c in visibleChildren(m)" :key="c.to" :to="c.to"
                    class="flex items-center gap-3 rounded-lg py-2 pl-11 pr-3 hover:bg-white/10"
                    :class="{ '!bg-white/15 font-semibold': isChildActive(m, c) }">
                    <span class="truncate">{{ c.label }}<template v-if="countFor(m, c) !== null"> (<span :title="countTitle(m, c)">{{ countFor(m, c).value }}</span>)</template></span>
                  </NuxtLink>
                </template>
              </template>
              <NuxtLink v-else :to="m.to"
                class="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/10"
                active-class="!bg-white/15 font-semibold">
                <i :class="['pi', m.icon]" />
                {{ m.label }}
                <span v-if="m.to === '/binh-luan' && commentsPending !== null"
                  class="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white"
                  title="Bình luận chờ duyệt">{{ commentsPending }}</span>
              </NuxtLink>
            </template>
          </template>
        </template>
      </nav>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-6 py-3">
        <div class="flex items-center gap-2">
          <span class="md:hidden"><Button icon="pi pi-bars" text rounded aria-label="Mở menu" @click="sidebarOpen = true" /></span>
          <span class="hidden md:inline-block"><Button :icon="sidebarHidden ? 'pi pi-angle-double-right' : 'pi pi-angle-double-left'" text rounded
            :aria-label="sidebarHidden ? 'Hiện sidebar' : 'Thu gọn sidebar'" @click="toggleSidebar" /></span>
          <h1 class="text-base font-semibold">{{ pageTitle }}</h1>
        </div>
        <div class="flex items-center gap-3">
          <Button :icon="dark ? 'pi pi-sun' : 'pi pi-moon'" text rounded @click="toggleDark" aria-label="Đổi giao diện" />
          <span class="text-sm text-neutral-400">{{ displayName }}</span>
          <Tag :value="role || 'admin'" severity="info" />
          <Button label="Đổi mật khẩu" icon="pi pi-key" size="small" severity="secondary" outlined @click="openPw" />
          <Button label="Bảo mật 2FA" icon="pi pi-shield" size="small" severity="secondary" outlined @click="open2fa" />
          <Button label="Đăng xuất" icon="pi pi-sign-out" size="small" severity="danger" outlined @click="logout" />
        </div>
      </header>
      <main class="flex-1 p-6">
        <slot />
      </main>
    </div>
    <Toast />
    <ConfirmDialog />
    <Dialog v-model:visible="pwDlg" modal header="Đổi mật khẩu" class="w-full max-w-md">
      <div class="flex flex-col gap-3">
        <div>
          <label class="field-label">Mật khẩu hiện tại</label>
          <Password v-model="pwForm.current" class="w-full" input-class="w-full" toggle-mask :feedback="false"
            placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div>
          <label class="field-label">Mật khẩu mới (ít nhất 10 ký tự)</label>
          <Password v-model="pwForm.next" class="w-full" input-class="w-full" toggle-mask :feedback="false"
            placeholder="••••••••" autocomplete="new-password" />
        </div>
        <div>
          <label class="field-label">Nhập lại mật khẩu mới</label>
          <Password v-model="pwForm.confirm" class="w-full" input-class="w-full" toggle-mask :feedback="false"
            placeholder="••••••••" autocomplete="new-password" @keyup.enter="submitPw" />
        </div>
      </div>
      <template #footer>
        <Button label="Huỷ" severity="secondary" outlined @click="pwDlg = false" />
        <Button label="Đổi mật khẩu" icon="pi pi-check" :loading="pwBusy" @click="submitPw" />
      </template>
    </Dialog>

    <!-- Bao mat 2FA (Goi 2D-2): tu phuc vu, opt-in tung tai khoan -->
    <Dialog v-model:visible="faDlg" modal header="Xác thực 2 lớp (2FA)" class="w-full max-w-md">
      <div class="flex flex-col gap-3">
        <p class="text-sm">Trạng thái: <Tag :value="faEnabled ? 'Đã bật' : 'Chưa bật'" :severity="faEnabled ? 'success' : 'secondary'" /></p>
        <template v-if="!faEnabled">
          <p class="text-sm text-neutral-400">Dùng ứng dụng Authenticator (Google/Microsoft Authenticator, 1Password...) quét hoặc nhập khóa dưới đây, rồi nhập mã 6 số để bật. Chưa xác nhận thì 2FA chưa có hiệu lực.</p>
          <Button v-if="!faSetup" label="Tạo khóa 2FA" icon="pi pi-qrcode" :loading="faBusy" @click="start2fa" />
          <template v-if="faSetup">
            <div>
              <label class="field-label">Khóa bí mật (nhập vào app)</label>
              <InputText :model-value="faSetup.secret" class="w-full" readonly @focus="($event.target as HTMLInputElement).select()" />
            </div>
            <p class="text-xs text-neutral-500 break-all">{{ faSetup.otpauthUrl }}</p>
            <div>
              <label class="field-label">Mã 6 số từ app</label>
              <InputText v-model="faCode" class="w-full" placeholder="123456" inputmode="numeric" maxlength="6" @keyup.enter="enable2fa" />
            </div>
          </template>
        </template>
        <template v-else>
          <p class="text-sm text-neutral-400">Để tắt 2FA, nhập mã 6 số hiện tại từ ứng dụng Authenticator.</p>
          <div>
            <label class="field-label">Mã 6 số từ app</label>
            <InputText v-model="faCode" class="w-full" placeholder="123456" inputmode="numeric" maxlength="6" @keyup.enter="disable2fa" />
          </div>
        </template>
      </div>
      <template #footer>
        <Button label="Đóng" severity="secondary" outlined @click="faDlg = false" />
        <Button v-if="!faEnabled && faSetup" label="Bật 2FA" icon="pi pi-check" :loading="faBusy" @click="enable2fa" />
        <Button v-if="faEnabled" label="Tắt 2FA" icon="pi pi-times" severity="danger" :loading="faBusy" @click="disable2fa" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { visibleMenu, hasModuleAction, hasModulePermission, isChildVisibleForScope } from '~/utils/workspaces';

const { user, role, logout, dark, toggleDark, permissions } = useCmsAuth();
const api = useApi();
const toast = useToast();
const route = useRoute();

// Đổi mật khẩu admin: API ghi Postgres (bền qua restart) + thu hồi refresh token,
// nên đổi xong đăng xuất để đăng nhập lại bằng mật khẩu mới.
const pwDlg = ref(false);
const pwBusy = ref(false);
const pwForm = reactive({ current: '', next: '', confirm: '' });
function openPw() {
  pwForm.current = '';
  pwForm.next = '';
  pwForm.confirm = '';
  pwDlg.value = true;
}
async function submitPw() {
  if (!pwForm.current || !pwForm.next) {
    toast.add({ severity: 'warn', summary: 'Thiếu thông tin', detail: 'Nhập mật khẩu hiện tại và mật khẩu mới', life: 3000 });
    return;
  }
  if (pwForm.next.length < 10) {
    toast.add({ severity: 'warn', summary: 'Mật khẩu yếu', detail: 'Mật khẩu mới phải có ít nhất 10 ký tự', life: 3000 });
    return;
  }
  if (pwForm.next !== pwForm.confirm) {
    toast.add({ severity: 'warn', summary: 'Chưa khớp', detail: 'Mật khẩu nhập lại không khớp', life: 3000 });
    return;
  }
  pwBusy.value = true;
  try {
    await api.post('/auth/admin/change-password', { currentPassword: pwForm.current, newPassword: pwForm.next });
    pwDlg.value = false;
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã đổi mật khẩu. Đăng nhập lại bằng mật khẩu mới.', life: 4000 });
    logout();
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || e?.message || '';
    const detail = msg === 'current password incorrect' ? 'Mật khẩu hiện tại không đúng'
      : msg === 'password unchanged' ? 'Mật khẩu mới phải khác mật khẩu hiện tại'
      : msg === 'weak password' ? 'Mật khẩu mới phải có ít nhất 10 ký tự'
      : 'Đổi mật khẩu thất bại';
    toast.add({ severity: 'error', summary: 'Lỗi', detail, life: 3000 });
  } finally {
    pwBusy.value = false;
  }
}

// 2FA tu phuc vu (Goi 2D-2): trang thai doc tu server moi lan mo hop thoai.
const faDlg = ref(false);
const faBusy = ref(false);
const faEnabled = ref(false);
const faSetup = ref<{ secret: string; otpauthUrl: string } | null>(null);
const faCode = ref('');
async function open2fa() {
  faSetup.value = null;
  faCode.value = '';
  faDlg.value = true;
  try {
    const r = await api.get<any>('/auth/admin/2fa');
    faEnabled.value = !!r.enabled;
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không đọc được trạng thái 2FA', life: 3000 });
  }
}
async function start2fa() {
  faBusy.value = true;
  try {
    faSetup.value = await api.post<any>('/auth/admin/2fa/setup', {});
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Tạo khóa 2FA thất bại', life: 3000 });
  } finally { faBusy.value = false; }
}
async function enable2fa() {
  if (!/^\d{6}$/.test(faCode.value.trim())) {
    toast.add({ severity: 'warn', summary: 'Mã chưa đúng định dạng', detail: 'Nhập đúng 6 chữ số từ ứng dụng Authenticator', life: 3000 });
    return;
  }
  faBusy.value = true;
  try {
    await api.post('/auth/admin/2fa/enable', { code: faCode.value.trim() });
    faEnabled.value = true;
    faSetup.value = null;
    faCode.value = '';
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã bật 2FA. Lần đăng nhập sau sẽ hỏi mã.', life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Mã không đúng hoặc đã hết hạn — kiểm tra lại giờ trên điện thoại', life: 3000 });
  } finally { faBusy.value = false; }
}
async function disable2fa() {
  if (!/^\d{6}$/.test(faCode.value.trim())) {
    toast.add({ severity: 'warn', summary: 'Mã chưa đúng định dạng', detail: 'Nhập đúng 6 chữ số từ ứng dụng Authenticator', life: 3000 });
    return;
  }
  faBusy.value = true;
  try {
    await api.post('/auth/admin/2fa/disable', { code: faCode.value.trim() });
    faEnabled.value = false;
    faCode.value = '';
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã tắt 2FA cho tài khoản này.', life: 4000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Mã không đúng — chưa tắt 2FA', life: 3000 });
  } finally { faBusy.value = false; }
}

const groups = computed(() => visibleMenu(permissions.value));

// Accordion muc cha (Tin bai / Bai bao in / Tuong thuat): tu mo khi dang
// o trang cua cha (ke ca link con kem query); dong/mo thu cong duoc ton
// trong ngay ca khi dang o trang do. Chi luu trong phien (khong
// localStorage nhu trang thai thu/gap nhom).
const openParents = ref<string[]>([]);
const closedParents = ref<string[]>([]);
function isParentOpen(m: any) {
  if (closedParents.value.includes(m.to)) return false;
  if (openParents.value.includes(m.to)) return true;
  return route.path === m.to;
}
function toggleParent(m: any) {
  if (isParentOpen(m)) {
    closedParents.value = [...closedParents.value, m.to];
    openParents.value = openParents.value.filter((x) => x !== m.to);
  } else {
    openParents.value = [...openParents.value, m.to];
    closedParents.value = closedParents.value.filter((x) => x !== m.to);
  }
}
function visibleChildren(m: any) {
  return (m.children || []).filter((c: any) => hasModuleAction(permissions.value, m.module, c.action) && isChildVisibleForScope(c, scopeIsWide.value));
}
// Muc con sang khi path khop muc cha VA moi tham so query trong link
// con deu khop query hien tai (khong chi status nhu dot 1): bao quat
// ?new=1, ?mine=1, ?status=draft&returned=1, ?mine=1&status=draft...
// Link con khong co query (vd 'Danh sach so bao' -> /bao-in) thi chi
// can path khop (moi muc con deu sang khi dang o trang cha khong loc).
function childQuery(to: string): Record<string, string> {
  const i = to.indexOf('?');
  if (i < 0) return {};
  const out: Record<string, string> = {};
  for (const part of to.slice(i + 1).split('&')) {
    const [k, v] = part.split('=');
    // src la metadata chip (vd src=menu cua muc Bi tra ve), khong phai
    // loc — bo qua khi so khop de drill B1 (khong co src) van sang
    // dung muc con nhu truoc.
    if (k && k !== 'src') out[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return out;
}
function isChildActive(m: any, c: any) {
  if (route.path !== m.to) return false;
  const q = childQuery(c.to);
  return Object.entries(q).every(([k, v]) => String((route.query as any)[k] ?? '') === v);
}

// Dem so cho menu con accordion dot 2: 1 lan goi duy nhat
// GET /admin/sidebar-counts (thay news/counts + list limit=1 dot 1).
// Sidebar hien ngay, so tai sau: truoc khi goi xong thi khong render
// so (null); loi thi an so, khong hien 0 (fail-open). Tai lai moi lan
// chuyen trang de so khong loi thoi sau khi tao/duyet bai.
const sidebarCounts = ref<any>(null);
const myQueueCount = computed(() => {
  const v = sidebarCounts.value?.myQueue?.value;
  return typeof v === 'number' ? v : null;
});
// Pham vi rong/hep lay tu GET /admin/sidebar-counts (scope top-level
// do backend tinh tu role that qua quan he role): 'wide' -> rong,
// 'mine' -> hep, chua co/khong co -> null (fail-open, hien het).
// KHONG dung cms_role: login tra 'admin' cho moi tai khoan nen khong
// phan biet duoc PV/TP/T.PP o frontend.
const scopeIsWide = computed(() => {
  const s = sidebarCounts.value?.scope;
  return s === 'wide' ? true : s === 'mine' ? false : null;
});
// Anh xa muc cha -> muc trong response sidebar-counts.
const countSection: Record<string, string> = {
  '/tin-bai': 'news',
  '/bai-bao-in': 'printArticle',
  '/bao-in': 'epaper',
  '/tuong-thuat': 'liveblog',
};
function countFor(m: any, c: any): { value: number; scope: string } | null {
  if (!c.countKey) return null;
  const cell = sidebarCounts.value?.[countSection[m.to]]?.[c.countKey];
  return cell && typeof cell.value === 'number' ? cell : null;
}
function countTitle(m: any, c: any): string {
  const cell = countFor(m, c);
  if (!cell) return '';
  return cell.scope === 'wide' ? 'Tính tất cả trong tòa soạn' : 'Chỉ tính trong phạm vi của bạn';
}
async function loadCounts() {
  try {
    const r = await api.get<any>('/admin/sidebar-counts', {});
    if (r) sidebarCounts.value = r;
  } catch { /* fail-open: giu so cu / an so */ }
  loadCommentsPending();
}
// Badge "Binh luan" (Dot 1 §4.1): khong dung duoc so commentsPending tu A1
// (A1 la viec cua backend, chua co trong worktree nay) nen goi rieng
// GET /admin/comments?status=pending&limit=1 lay total — cung truy van dem
// nhu hang kiem duyet loc pending nen so badge = so dong danh sach.
// Chi goi khi co bat ky quyen comments:* nao; loi/403 thi an badge (null),
// khong hien 0. Tai lai moi lan chuyen trang (cung loadCounts).
const commentsPending = ref<number | null>(null);
async function loadCommentsPending() {
  if (!hasModulePermission(permissions.value, 'comments')) { commentsPending.value = null; return; }
  try {
    const r = await api.get<any>('/admin/comments', { status: 'pending', limit: 1 });
    commentsPending.value = typeof r?.total === 'number' ? r.total : null;
  } catch { commentsPending.value = null; }
}
onMounted(loadCounts);
watch(() => route.path, () => { loadCounts(); openGroupForRoute(); sidebarOpen.value = false; });

// Sidebar: tung nhom workspace dong/mo duoc bang mui ten (giong mau
// tham chieu: '>' la dang thu, 'V' la dang mo). Mac dinh mo het nhu
// hien tai; trang thai thu/gap luu localStorage de tai lai trang van giu.
const collapsedGroups = ref<string[]>([]);
function isCollapsed(id: string) {
  return collapsedGroups.value.includes(id);
}
function toggleGroup(id: string) {
  collapsedGroups.value = isCollapsed(id)
    ? collapsedGroups.value.filter((x) => x !== id)
    : [...collapsedGroups.value, id];
}
onMounted(() => {
  try {
    const raw = localStorage.getItem('cms_sidebar_collapsed');
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) collapsedGroups.value = parsed.filter((x) => typeof x === 'string');
  } catch { /* bo qua du lieu hong, giu mac dinh mo het */ }
  try {
    sidebarHidden.value = localStorage.getItem('cms_sidebar_hidden') === '1';
  } catch { /* bo qua */ }
  openGroupForRoute();
});
watch(collapsedGroups, (v) => {
  try { localStorage.setItem('cms_sidebar_collapsed', JSON.stringify(v)); } catch { /* bo qua */ }
});

// Sidebar dot 2: doi route -> tu mo nhom workspace dang thu ma chua
// route hien tai (tinh ca muc con accordion); khong dong nhom khac,
// khong ghi de lua chon thu/gap cua user cho cac nhom khac.
function openGroupForRoute() {
  const g = groups.value.find((grp) => grp.items.some((m) => m.to === route.path));
  if (g && isCollapsed(g.id)) toggleGroup(g.id);
}

// Drawer mobile + thu gon sidebar toan cuc (dot 2). Truoc day aside
// co dinh w-60, chi thu/gap tung nhom/cha. Drawer: tren mobile aside
// an, bam nut menu thi hien dang drawer co dinh + lop mo; chon muc
// (doi route) tu dong dong drawer. Nut thu gon chi tren desktop:
// an han aside, bam lai thi hien; trang thai luu localStorage.
const sidebarOpen = ref(false);
const sidebarHidden = ref(false);
const asideClass = computed(() => {
  const base = 'w-60 shrink-0 bg-admin p-4 text-neutral-200';
  if (sidebarHidden.value && !sidebarOpen.value) return `${base} hidden`;
  if (sidebarOpen.value) return `${base} fixed inset-y-0 left-0 z-40 shadow-xl md:static md:z-auto md:shadow-none`;
  return `${base} hidden md:block`;
});
function toggleSidebar() {
  sidebarHidden.value = !sidebarHidden.value;
  try { localStorage.setItem('cms_sidebar_hidden', sidebarHidden.value ? '1' : '0'); } catch { /* bo qua */ }
}

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/phim': 'Quản lý Phim',
  '/videos': 'Quản lý Videos',
  '/short': 'Quản lý Short',
  '/tap-tin': 'Thư viện Tập tin',
  '/thu-vien': 'Thư viện media',
  '/the-loai': 'Quản lý Thể loại phim',
  '/dien-vien': 'Quản lý Diễn viên',
  '/danh-sach-phat': 'Quản lý Danh sách phát',
  '/bai-viet': 'Quản lý Bài viết',
  '/bao-in': 'Báo in',
  '/tin-bai': 'Tin bài',
  '/binh-luan': 'Bình luận',
  '/su-kien-toa-soan': 'Sự kiện tòa soạn',
  '/tuong-thuat': 'Tường thuật trực tiếp',
  '/quang-cao-toa-soan': 'Quảng cáo tòa soạn',
  '/nhuan-but': 'Nhuận bút',
  '/thong-ke-nhuan-but': 'Thống kê nhuận bút',
  '/su-kien': 'Quản lý Sự kiện',
  '/danh-muc': 'Quản lý Danh mục',
  '/truyen-hinh': 'Truyền hình & EPG',
  '/banner': 'Quản lý Banner',
  '/giao-dien': 'Giao diện (Block / Rail)',
  '/nguoi-dung': 'Người dùng',
  '/thong-bao': 'Thông báo',
  '/tu-khoa': 'Từ khoá tìm kiếm & Từ cấm',
  '/thong-ke': 'Thống kê',
  '/goi-cuoc': 'Gói cước',
  '/livestream': 'Livestream',
  '/cai-dat': 'Cài đặt hệ thống',
  '/nhat-ky': 'Nhật ký hoạt động',
  '/roles': 'Quản lý quyền',
  '/quy-trinh-duyet': 'Quy trình duyệt',
  '/admins': 'Quản trị viên',
  '/phong-ban': 'Phòng ban',
};
const pageTitle = computed(() => titles[route.path] || 'VTC ANY CMS');
const displayName = computed(() => user.value?.email || user.value?.username || 'Admin');
</script>
