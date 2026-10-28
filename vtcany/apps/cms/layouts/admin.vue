<template>
  <div class="flex min-h-screen">
    <aside class="w-60 shrink-0 bg-admin p-4 text-neutral-200">
      <NuxtLink to="/" class="flex items-center gap-2 px-2 py-3">
        <img src="/logo.svg" alt="VTC ANY" width="120" height="50" />
      </NuxtLink>
      <nav class="mt-2 flex flex-col text-sm">
        <template v-for="g in groups" :key="g.label">
          <p class="mt-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">{{ g.label }}</p>
          <NuxtLink v-for="m in g.items" :key="m.to" :to="m.to"
            class="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/10"
            active-class="!bg-white/15 font-semibold">
            <i :class="['pi', m.icon]" />
            {{ m.label }}
          </NuxtLink>
        </template>
      </nav>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex items-center justify-between border-b border-neutral-800 bg-neutral-900 px-6 py-3">
        <h1 class="text-base font-semibold">{{ pageTitle }}</h1>
        <div class="flex items-center gap-3">
          <Button :icon="dark ? 'pi pi-sun' : 'pi pi-moon'" text rounded @click="toggleDark" aria-label="Đổi giao diện" />
          <span class="text-sm text-neutral-400">{{ displayName }}</span>
          <Tag :value="role || 'admin'" severity="info" />
          <Button label="Đổi mật khẩu" icon="pi pi-key" size="small" severity="secondary" outlined @click="openPw" />
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
  </div>
</template>

<script setup lang="ts">
const { user, role, logout, dark, toggleDark } = useCmsAuth();
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

const groups = [
  {
    label: 'Nội dung',
    items: [
      { to: '/phim', label: 'Phim', icon: 'pi-video' },
      { to: '/videos', label: 'Videos', icon: 'pi-play' },
      { to: '/short', label: 'Short', icon: 'pi-bolt' },
      { to: '/tap-tin', label: 'Tập tin', icon: 'pi-folder-open' },
      { to: '/thu-vien', label: 'Thư viện', icon: 'pi-images' },
      { to: '/the-loai', label: 'Thể loại', icon: 'pi-tags' },
      { to: '/dien-vien', label: 'Diễn viên', icon: 'pi-user' },
      { to: '/danh-sach-phat', label: 'Danh sách phát', icon: 'pi-list' },
      { to: '/bai-viet', label: 'Bài viết', icon: 'pi-file-edit' },
      { to: '/bao-in', label: 'Báo in', icon: 'pi-book' },
      { to: '/tin-bai', label: 'Tin bài', icon: 'pi-newspaper' },
      { to: '/su-kien', label: 'Sự kiện', icon: 'pi-calendar' },
      { to: '/danh-muc', label: 'Danh mục', icon: 'pi-folder' },
      { to: '/truyen-hinh', label: 'Truyền hình & EPG', icon: 'pi-tv' },
    ],
  },
  {
    label: 'Hiển thị',
    items: [
      { to: '/banner', label: 'Banner', icon: 'pi-flag' },
      { to: '/giao-dien', label: 'Giao diện', icon: 'pi-images' },
    ],
  },
  {
    label: 'Người dùng',
    items: [
      { to: '/nguoi-dung', label: 'Người dùng', icon: 'pi-users' },
      { to: '/thong-bao', label: 'Thông báo', icon: 'pi-bell' },
      { to: '/tu-khoa', label: 'Từ khoá', icon: 'pi-search' },
    ],
  },
  {
    label: 'Thống kê',
    items: [
      { to: '/thong-ke', label: 'Thống kê', icon: 'pi-chart-bar' },
    ],
  },
  {
    label: 'Quản trị',
    items: [
      { to: '/goi-cuoc', label: 'Gói cước', icon: 'pi-credit-card' },
      { to: '/livestream', label: 'Livestream', icon: 'pi-broadcast-tower' },
      { to: '/cai-dat', label: 'Cài đặt', icon: 'pi-cog' },
      { to: '/nhat-ky', label: 'Nhật ký', icon: 'pi-history' },
      { to: '/roles', label: 'Quản lý quyền', icon: 'pi-shield' },
      { to: '/admins', label: 'Quản trị viên', icon: 'pi-user-edit' },
      { to: '/phong-ban', label: 'Phòng ban', icon: 'pi-sitemap' },
    ],
  },
];

const titles: Record<string, string> = {
  '/': 'Dashboard',
  '/phim': 'Quản lý Phim',
  '/videos': 'Quản lý Videos',
  '/short': 'Quản lý Short',
  '/tap-tin': 'Thư viện Tập tin',
  '/thu-vien': 'Thư viện media',
  '/the-loai': 'Quản lý Thể loại',
  '/dien-vien': 'Quản lý Diễn viên',
  '/danh-sach-phat': 'Quản lý Danh sách phát',
  '/bai-viet': 'Quản lý Bài viết',
  '/bao-in': 'Báo in',
  '/tin-bai': 'Tin bài',
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
  '/admins': 'Quản trị viên',
  '/phong-ban': 'Phòng ban',
};
const pageTitle = computed(() => titles[route.path] || 'VTC ANY CMS');
const displayName = computed(() => user.value?.email || user.value?.username || 'Admin');
</script>
