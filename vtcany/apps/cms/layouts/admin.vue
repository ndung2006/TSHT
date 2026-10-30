<template>
  <div class="flex min-h-screen">
    <aside class="w-60 shrink-0 bg-admin p-4 text-neutral-200">
      <NuxtLink to="/" class="flex items-center gap-2 px-2 py-3">
        <img src="/icons/vtc-tsht/logo-vtc-tsht-transparent.svg" alt="VTC TSHT" width="130" height="50" />
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
import { visibleMenu } from '~/utils/workspaces';

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
  '/admins': 'Quản trị viên',
  '/phong-ban': 'Phòng ban',
};
const pageTitle = computed(() => titles[route.path] || 'VTC ANY CMS');
const displayName = computed(() => user.value?.email || user.value?.username || 'Admin');
</script>
