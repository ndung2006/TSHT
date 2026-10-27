<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Quản lý người dùng</h2>
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} người dùng</p>
    </div>

    <div class="surface-card flex flex-wrap gap-2 p-3">
      <Button v-if="can('user:write')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openAdd" />
      <span class="p-input-icon-left ml-auto">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm email / SĐT / tên..." class="w-64" @keyup.enter="load(1)" />
      </span>
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="users" :loading="loading" paginator :rows="meta.limit" :total-records="meta.total"
        lazy :first="(meta.page - 1) * meta.limit" @page="(e: any) => load(e.page + 1)" size="small">
        <Column field="displayName" header="Tên">
          <template #body="{ data }">{{ data.displayName || '—' }}</template>
        </Column>
        <Column field="email" header="Email">
          <template #body="{ data }">{{ data.email || '—' }}</template>
        </Column>
        <Column field="phone" header="SĐT">
          <template #body="{ data }">{{ data.phone || '—' }}</template>
        </Column>
        <Column field="provider" header="Provider">
          <template #body="{ data }">
            <Tag v-if="data.provider" :value="data.provider" severity="info" />
            <span v-else class="text-neutral-500">—</span>
          </template>
        </Column>
        <Column header="Trạng thái" style="width:8rem">
          <template #body="{ data }">
            <Tag :value="data.status === 'active' ? 'Hoạt động' : 'Đã khóa'"
              :severity="data.status === 'active' ? 'success' : 'danger'" />
          </template>
        </Column>
        <Column header="Ngày tạo" style="width:11rem">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column v-if="can('user:write')" header="" style="width:11rem">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" size="small" text rounded severity="success" v-tooltip.top="'Sửa'"
              @click="openEdit(data)" />
            <Button :icon="data.status === 'active' ? 'pi pi-lock' : 'pi pi-lock-open'" size="small" text rounded
              :severity="data.status === 'active' ? 'warn' : 'info'"
              v-tooltip.top="data.status === 'active' ? 'Khóa tài khoản' : 'Mở khóa'" @click="toggleBan(data)" />
            <Button icon="pi pi-key" size="small" text rounded severity="secondary" v-tooltip.top="'Đặt lại mật khẩu'"
              @click="openResetPw(data)" />
            <Button icon="pi pi-trash" size="small" text rounded severity="danger" v-tooltip.top="'Xóa'"
              @click="confirmDelete(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Dialog them/sua -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa người dùng' : 'Thêm người dùng'" class="w-[95vw] max-w-lg">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tên hiển thị</label><InputText v-model="form.displayName" class="w-full" /></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="field-label">Email</label><InputText v-model="form.email" class="w-full" type="email" /></div>
          <div><label class="field-label">Số điện thoại</label><InputText v-model="form.phone" class="w-full" /></div>
        </div>
        <div v-if="!editing">
          <label class="field-label">Mật khẩu (tùy chọn, ≥ 8 ký tự)</label>
          <InputText v-model="form.password" class="w-full" type="password" placeholder="Để trống nếu chưa cấp" />
          <small class="text-neutral-400">Có mật khẩu thì user đăng nhập app bằng email/SĐT + mật khẩu được.</small>
        </div>
        <div v-else>
          <label class="field-label">Trạng thái</label>
          <Dropdown v-model="form.status" :options="statusOpts" option-label="label" option-value="value" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button label="Lưu" severity="success" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </Dialog>

    <!-- Dialog dat lai mat khau -->
    <Dialog v-model:visible="pwDlg" modal header="Đặt lại mật khẩu" class="w-[95vw] max-w-md">
      <p class="mb-3 text-sm text-neutral-400">
        Đặt mật khẩu mới cho <b>{{ pwUser?.displayName || pwUser?.email || pwUser?.phone }}</b>.
        Phiên đăng nhập cũ sẽ bị vô hiệu hóa.
      </p>
      <div class="flex gap-2">
        <InputText v-model="newPw" type="text" class="w-full font-mono" placeholder="Mật khẩu mới (≥ 8 ký tự)" />
        <Button label="Tạo ngẫu nhiên" severity="secondary" @click="genPw" />
      </div>
      <p v-if="pwDone" class="mt-3 rounded bg-emerald-950 p-3 text-sm">
        Đã đặt mật khẩu mới: <b class="font-mono">{{ pwDone }}</b><br />
        <span class="text-neutral-400">Hãy gửi cho người dùng ngay — hệ thống không lưu mật khẩu dạng text.</span>
      </p>
      <template #footer>
        <Button label="Đóng" text @click="pwDlg = false" />
        <Button label="Đặt mật khẩu" severity="success" :loading="pwSaving" :disabled="newPw.length < 8" @click="doResetPw" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Người dùng - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();

const users = ref<any[]>([]);
const meta = ref({ page: 1, limit: 20, total: 0 });
const q = ref('');
const loading = ref(false);

function fmtDate(v: any) {
  if (!v) return '';
  return new Date(typeof v === 'number' ? v : String(v)).toLocaleString('vi-VN');
}

async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/users', { page, limit: 20, q: q.value.trim() || undefined });
    users.value = r.data || [];
    meta.value = { page: r.meta?.page || 1, limit: r.meta?.limit || 20, total: r.meta?.total ?? users.value.length };
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được người dùng', life: 3000 });
  } finally {
    loading.value = false;
  }
}

const statusOpts = [
  { label: 'Hoạt động', value: 'active' },
  { label: 'Đã khóa', value: 'banned' },
];

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ displayName: '', email: '', phone: '', password: '', status: 'active' });
const canSave = computed(() => (form.value.email.trim() || form.value.phone.trim()) && (!form.value.password || form.value.password.length >= 8));

function openAdd() {
  editing.value = null;
  form.value = { displayName: '', email: '', phone: '', password: '', status: 'active' };
  dlg.value = true;
}
function openEdit(u: any) {
  editing.value = u;
  form.value = { displayName: u.displayName || '', email: u.email || '', phone: u.phone || '', password: '', status: u.status || 'active' };
  dlg.value = true;
}

async function save() {
  saving.value = true;
  try {
    const body: any = {
      displayName: form.value.displayName.trim() || undefined,
      email: form.value.email.trim() || undefined,
      phone: form.value.phone.trim() || undefined,
    };
    if (!editing.value && form.value.password) body.password = form.value.password;
    if (editing.value) body.status = form.value.status;
    if (editing.value) await api.patch(`/admin/users/${editing.value.id}`, body);
    else await api.post('/admin/users', body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu người dùng', life: 3000 });
    dlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    const msg = e?.response?.data?.error?.message || 'Lưu thất bại';
    const detail = msg.includes('da ton tai') ? 'Email hoặc SĐT đã tồn tại' : msg.includes('it nhat 8') ? 'Mật khẩu phải ≥ 8 ký tự' : msg;
    toast.add({ severity: 'error', summary: 'Lỗi', detail, life: 4000 });
  } finally {
    saving.value = false;
  }
}

function toggleBan(u: any) {
  const to = u.status === 'active' ? 'banned' : 'active';
  confirm.require({
    message: `${to === 'banned' ? 'Khóa' : 'Mở khóa'} tài khoản "${u.displayName || u.email || u.phone}"?`,
    header: 'Xác nhận', icon: 'pi pi-exclamation-triangle', acceptLabel: 'Đồng ý', rejectLabel: 'Hủy',
    accept: async () => {
      try {
        await api.patch(`/admin/users/${u.id}`, { status: to });
        u.status = to;
        toast.add({ severity: 'success', summary: 'Xong', detail: to === 'banned' ? 'Đã khóa tài khoản' : 'Đã mở khóa', life: 3000 });
      } catch {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Thao tác thất bại', life: 3000 });
      }
    },
  });
}

function confirmDelete(u: any) {
  confirm.require({
    message: `Xóa người dùng "${u.displayName || u.email || u.phone}"? Dữ liệu liên quan sẽ bị xóa theo.`,
    header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/users/${u.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa người dùng', life: 3000 });
        load(meta.value.page);
      } catch {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 });
      }
    },
  });
}

// ---- Dat lai mat khau ----
const pwDlg = ref(false);
const pwUser = ref<any>(null);
const newPw = ref('');
const pwSaving = ref(false);
const pwDone = ref('');
function openResetPw(u: any) {
  pwUser.value = u;
  newPw.value = '';
  pwDone.value = '';
  pwDlg.value = true;
}
function genPw() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = new Uint32Array(10);
  crypto.getRandomValues(buf);
  for (const n of buf) s += chars[n % chars.length];
  newPw.value = s;
}
async function doResetPw() {
  if (newPw.value.length < 8) return;
  pwSaving.value = true;
  try {
    await api.post(`/admin/users/${pwUser.value.id}/reset-password`, { newPassword: newPw.value });
    pwDone.value = newPw.value;
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã đặt mật khẩu mới', life: 3000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Thất bại', life: 3000 });
  } finally {
    pwSaving.value = false;
  }
}

onMounted(() => load(1));
</script>
