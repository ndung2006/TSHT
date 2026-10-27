<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Quản trị viên</h2>
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} quản trị viên</p>
    </div>

    <div class="surface-card flex flex-wrap gap-2 p-3">
      <Button v-if="can('admins:create')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openAdd" />
      <Button v-if="can('admins:delete')" label="Xoá" icon="pi pi-trash" severity="danger" outlined
        :disabled="!selected.length" @click="confirmBulkDelete" />
      <span class="p-input-icon-left ml-auto">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm email / tên..." class="w-64" @keyup.enter="load(1)" />
      </span>
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="admins" v-model:selection="selected" :loading="loading" paginator
        :rows="meta.limit" :total-records="meta.total" lazy :first="(meta.page - 1) * meta.limit"
        @page="(e: any) => load(e.page + 1)" size="small" data-key="id">
        <Column selection-mode="multiple" style="width:3rem" />
        <Column header="" style="width:4rem">
          <template #body="{ data }">
            <Avatar :image="data.avatarUrl || undefined" :label="!data.avatarUrl ? (data.fullName || data.email || '?').charAt(0).toUpperCase() : undefined"
              shape="circle" size="normal" />
          </template>
        </Column>
        <Column header="Tên">
          <template #body="{ data }">
            <div class="font-medium">{{ data.fullName || '—' }}</div>
            <div class="text-xs text-neutral-400">{{ data.email || data.username || '' }}</div>
          </template>
        </Column>
        <Column header="Quyền hạn" style="width:11rem">
          <template #body="{ data }">
            <Tag v-if="data.roleName" :value="data.roleName" severity="info" />
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
        <Column header="" style="width:7rem">
          <template #body="{ data }">
            <Button v-if="can('admins:update')" icon="pi pi-pencil" size="small" text rounded severity="success"
              v-tooltip.top="'Sửa'" @click="openEdit(data)" />
            <Button v-if="can('admins:delete')" icon="pi pi-trash" size="small" text rounded severity="danger"
              v-tooltip.top="'Xóa'" @click="confirmDelete(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Dialog them/sua -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Cập nhật quản trị viên' : 'Thêm quản trị viên'"
      class="w-[95vw] max-w-lg">
      <div class="flex flex-col gap-3">
        <div>
          <label class="field-label">Email <span class="text-red-400">*</span></label>
          <InputText v-model="form.email" type="email" class="w-full" :disabled="!!editing" />
        </div>
        <div>
          <label class="field-label">{{ editing ? 'Mật khẩu mới (để trống nếu không đổi)' : 'Mật khẩu' }}</label>
          <InputText v-model="form.password" type="password" class="w-full" placeholder="Tối thiểu 8 ký tự" />
        </div>
        <div>
          <label class="field-label">Tên</label>
          <InputText v-model="form.fullName" class="w-full" />
        </div>
        <div>
          <label class="field-label">Ảnh đại diện (tỉ lệ 1:1)</label>
          <ImagePicker v-model="form.avatarUrl" ratio="1/1" />
        </div>
        <div>
          <label class="field-label">Quyền hạn</label>
          <Dropdown v-model="form.roleId" :options="roles" option-label="name" option-value="id"
            placeholder="Chọn vai trò" class="w-full" show-clear />
        </div>
        <div v-if="editing" class="flex items-center gap-2">
          <Checkbox v-model="form.locked" binary input-id="lock" />
          <label for="lock" class="cursor-pointer">Khoá tài khoản</label>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="dlg = false" />
        <Button label="Lưu" severity="success" :loading="saving" :disabled="!canSave" @click="save" />
      </template>
    </Dialog>

  </div>
</template>

<script setup lang="ts">
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';

definePageMeta({ layout: 'admin' });

const api = useApi();
const { can } = useCmsAuth();
const toast = useToast();
const confirm = useConfirm();

const admins = ref<any[]>([]);
const roles = ref<any[]>([]);
const selected = ref<any[]>([]);
const loading = ref(false);
const q = ref('');
const meta = ref({ total: 0, page: 1, limit: 20 });
const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ email: '', password: '', fullName: '', avatarUrl: '', roleId: null as string | null, locked: false });

const canSave = computed(() => {
  if (!form.value.email.trim()) return false;
  if (!editing.value && form.value.password && form.value.password.length < 8) return false;
  if (editing.value && form.value.password && form.value.password.length < 8) return false;
  return true;
});

const fmtDate = (v: any) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('vi-VN', { hour12: false }); } catch { return '—'; }
};

async function load(page = 1) {
  loading.value = true;
  try {
    const res = await api.get<any>('/admin/admins', { q: q.value.trim() || undefined, page, limit: meta.value.limit });
    admins.value = res.data || [];
    meta.value = { total: res.total || 0, page: res.page || 1, limit: res.limit || 20 };
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được danh sách quản trị viên', life: 3000 });
  } finally {
    loading.value = false;
  }
}

async function loadRoles() {
  try {
    roles.value = await api.get<any[]>('/admin/roles');
  } catch { /* im lặng */ }
}

function openAdd() {
  editing.value = null;
  form.value = { email: '', password: '', fullName: '', avatarUrl: '', roleId: null, locked: false };
  dlg.value = true;
}

function openEdit(a: any) {
  editing.value = a;
  form.value = {
    email: a.email || '',
    password: '',
    fullName: a.fullName || '',
    avatarUrl: a.avatarUrl || '',
    roleId: a.roleId || null,
    locked: a.status !== 'active',
  };
  dlg.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editing.value) {
      const body: any = {
        fullName: form.value.fullName.trim(),
        avatarUrl: form.value.avatarUrl.trim(),
        roleId: form.value.roleId,
        status: form.value.locked ? 'disabled' : 'active',
      };
      if (form.value.password) body.password = form.value.password;
      await api.patch(`/admin/admins/${editing.value.id}`, body);
    } else {
      await api.post('/admin/admins', {
        email: form.value.email.trim(),
        password: form.value.password || undefined,
        fullName: form.value.fullName.trim(),
        avatarUrl: form.value.avatarUrl.trim() || undefined,
        roleId: form.value.roleId || undefined,
      });
    }
    toast.add({ severity: 'success', summary: 'Đã lưu', life: 2500 });
    dlg.value = false;
    await load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Không lưu được', life: 3000 });
  } finally {
    saving.value = false;
  }
}

function doDelete(ids: string[]) {
  confirm.require({
    message: `Xoá ${ids.length} quản trị viên đã chọn?`,
    header: 'Xác nhận xoá',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xoá',
    rejectLabel: 'Hủy',
    accept: async () => {
      try {
        for (const id of ids) await api.del(`/admin/admins/${id}`);
        toast.add({ severity: 'success', summary: 'Đã xoá', life: 2500 });
        selected.value = [];
        await load(1);
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Không xoá được', life: 3000 });
      }
    },
  });
}

const confirmDelete = (a: any) => doDelete([a.id]);
const confirmBulkDelete = () => doDelete(selected.value.map((a) => a.id));

onMounted(async () => {
  await loadRoles();
  await load(1);
});
</script>
