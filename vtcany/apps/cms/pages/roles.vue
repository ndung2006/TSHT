<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Quản lý quyền</h2>
      <p class="text-sm text-neutral-400">Tổng: {{ roles.length }} vai trò</p>
    </div>

    <div class="surface-card flex flex-wrap gap-2 p-3">
      <Button v-if="can('roles:create')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openAdd" />
      <Button v-if="can('roles:delete')" label="Xoá" icon="pi pi-trash" severity="danger" outlined
        :disabled="!selected.length" @click="confirmBulkDelete" />
      <span class="p-input-icon-left ml-auto">
        <i class="pi pi-search" />
        <InputText v-model="q" placeholder="Tìm kiếm..." class="w-64" @keyup.enter="() => {}" />
      </span>
    </div>

    <div class="surface-card p-4">
      <DataTable :value="filtered" v-model:selection="selected" :loading="loading" size="small" data-key="id">
        <Column selection-mode="multiple" style="width:3rem" />
        <Column field="name" header="Tên" />
        <Column header="Số quản trị viên" style="width:10rem">
          <template #body="{ data }">{{ data.adminCount ?? '—' }}</template>
        </Column>
        <Column header="Ngày tạo" style="width:11rem">
          <template #body="{ data }">{{ fmtDate(data.createdAt) }}</template>
        </Column>
        <Column header="" style="width:7rem">
          <template #body="{ data }">
            <Button v-if="can('roles:update')" icon="pi pi-pencil" size="small" text rounded severity="success"
              v-tooltip.top="'Sửa'" @click="openEdit(data)" />
            <Button v-if="can('roles:delete')" icon="pi pi-trash" size="small" text rounded severity="danger"
              v-tooltip.top="'Xóa'" @click="confirmDelete(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- Dialog them/sua vai tro -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Cập nhật quyền' : 'Thêm quyền'" class="w-[95vw] max-w-4xl">
      <div class="flex flex-col gap-4">
        <div>
          <label class="field-label">Tên quyền <span class="text-red-400">*</span></label>
          <InputText v-model="form.name" class="w-full" placeholder="VD: Moderators" />
        </div>
        <div>
          <label class="field-label">Mô tả</label>
          <InputText v-model="form.description" class="w-full" placeholder="Mô tả vai trò..." />
        </div>
        <div>
          <label class="field-label mb-2 block">Phân quyền</label>
          <div class="overflow-x-auto rounded border border-neutral-700">
            <table class="w-full text-sm">
              <thead>
                <tr class="bg-neutral-800/60">
                  <th class="p-2 text-left font-medium">Module</th>
                  <th v-for="a in actions" :key="a" class="p-2 text-center font-medium" style="min-width:5.5rem">
                    <label class="inline-flex cursor-pointer items-center gap-1">
                      <Checkbox :model-value="colChecked(a)" binary @change="toggleCol(a)" />
                      {{ actionLabels[a] }}
                    </label>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="m in modules" :key="m.key" class="border-t border-neutral-800">
                  <td class="p-2">
                    <label class="inline-flex cursor-pointer items-center gap-2">
                      <Checkbox :model-value="rowChecked(m)" binary @change="toggleRow(m)" />
                      {{ m.label }}
                    </label>
                  </td>
                  <td v-for="a in actions" :key="a" class="p-2 text-center">
                    <Checkbox v-if="m.actions.includes(a)" v-model="perms[m.key]" :value="a" />
                    <span v-else class="text-neutral-600">—</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="dlg = false" />
        <Button label="Lưu" severity="success" :loading="saving" :disabled="!form.name.trim()" @click="save" />
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

const roles = ref<any[]>([]);
const selected = ref<any[]>([]);
const loading = ref(false);
const q = ref('');
const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ name: '', description: '' });
const perms = ref<Record<string, string[]>>({});
const modules = ref<any[]>([]);
const actions = ref<string[]>(['view', 'create', 'update', 'publish', 'delete']);
const actionLabels = ref<Record<string, string>>({});

const filtered = computed(() => {
  const s = q.value.trim().toLowerCase();
  if (!s) return roles.value;
  return roles.value.filter((r) => (r.name || '').toLowerCase().includes(s));
});

const fmtDate = (v: any) => {
  if (!v) return '—';
  try { return new Date(v).toLocaleString('vi-VN', { hour12: false }); } catch { return '—'; }
};

async function loadCatalog() {
  try {
    const c = await api.get<any>('/admin/permissions/catalog');
    modules.value = c.modules || [];
    actions.value = Object.keys(c.actions || {});
    actionLabels.value = c.actions || {};
  } catch { /* im lặng, matrix trống */ }
}

async function load() {
  loading.value = true;
  try {
    roles.value = await api.get<any[]>('/admin/roles');
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được danh sách vai trò', life: 3000 });
  } finally {
    loading.value = false;
  }
}

function resetPerms(src?: Record<string, string[]>) {
  const p: Record<string, string[]> = {};
  for (const m of modules.value) p[m.key] = [...(src?.[m.key] || [])];
  perms.value = p;
}

function openAdd() {
  editing.value = null;
  form.value = { name: '', description: '' };
  resetPerms();
  dlg.value = true;
}

function openEdit(r: any) {
  editing.value = r;
  form.value = { name: r.name || '', description: r.description || '' };
  resetPerms(r.permissions && typeof r.permissions === 'object' ? r.permissions : {});
  dlg.value = true;
}

const rowChecked = (m: any) => m.actions.every((a: string) => perms.value[m.key]?.includes(a));
const colChecked = (a: string) =>
  modules.value.filter((m) => m.actions.includes(a)).every((m) => perms.value[m.key]?.includes(a));

function toggleRow(m: any) {
  const all = rowChecked(m);
  perms.value[m.key] = all ? [] : [...m.actions];
}

function toggleCol(a: string) {
  const all = colChecked(a);
  for (const m of modules.value) {
    if (!m.actions.includes(a)) continue;
    const cur = new Set(perms.value[m.key] || []);
    if (all) cur.delete(a); else cur.add(a);
    perms.value[m.key] = [...cur];
  }
}

async function save() {
  saving.value = true;
  try {
    const body = { name: form.value.name.trim(), description: form.value.description.trim(), permissions: perms.value };
    if (editing.value) await api.patch(`/admin/roles/${editing.value.id}`, body);
    else await api.post('/admin/roles', body);
    toast.add({ severity: 'success', summary: 'Đã lưu vai trò', life: 2500 });
    dlg.value = false;
    await load();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Không lưu được vai trò', life: 3000 });
  } finally {
    saving.value = false;
  }
}

function doDelete(ids: string[]) {
  confirm.require({
    message: `Xoá ${ids.length} vai trò đã chọn?`,
    header: 'Xác nhận xoá',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xoá',
    rejectLabel: 'Hủy',
    accept: async () => {
      try {
        for (const id of ids) await api.del(`/admin/roles/${id}`);
        toast.add({ severity: 'success', summary: 'Đã xoá', life: 2500 });
        selected.value = [];
        await load();
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Không xoá được', life: 3000 });
      }
    },
  });
}

const confirmDelete = (r: any) => doDelete([r.id]);
const confirmBulkDelete = () => doDelete(selected.value.map((r) => r.id));

onMounted(async () => {
  await loadCatalog();
  await load();
});
</script>
