<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold">Quy trình duyệt</h2>
      <p class="text-sm text-neutral-400">Cấu hình bước duyệt theo từng phân hệ — đổi tên, gán Role, hướng trả bài, duyệt khẩn.</p>
    </div>

    <div v-if="!can('workflows:view')" class="surface-card p-4">
      <p class="text-sm">Bạn không có quyền xem quy trình duyệt.</p>
    </div>
    <div v-else class="flex flex-col gap-4">
      <div class="surface-card flex flex-wrap items-center gap-3 p-3">
        <label class="field-label">Phân hệ</label>
        <Dropdown v-model="selectedKey" :options="definitions" option-label="label" option-value="moduleKey" class="w-72" @change="selectDef" />
        <span v-if="current" class="text-xs text-neutral-400">Nguồn: {{ current.source === 'db' ? 'Đã lưu trong DB' : 'Mặc định (chưa lưu DB)' }} · Đang chờ duyệt: {{ current.inFlight ?? '—' }} hồ sơ</span>
        <Button v-if="can('workflows:update')" label="Lưu" severity="success" :loading="saving" :disabled="!dirty" class="ml-auto" @click="askSave" />
      </div>

      <div v-if="current" class="surface-card flex flex-col gap-3 p-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label class="field-label">Tên hiển thị phân hệ</label><InputText v-model="form.label" class="w-full" /></div>
          <div><label class="field-label">Vai trò người tạo (VD: KTV, PV)</label>
            <Dropdown v-model="form.authorRole" :options="roles" option-label="name" option-value="name" show-clear placeholder="Không có" class="w-full" />
          </div>
          <div><label class="field-label">Nhãn người tạo</label><InputText v-model="form.authorLabel" class="w-full" /></div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <InputSwitch v-model="form.enabled" :disabled="selectedKey !== 'video'" />
          <span class="text-sm">Bật quy trình duyệt cho phân hệ này</span>
          <span v-if="selectedKey !== 'video'" class="text-xs text-neutral-400">(Luồng duyệt lõi luôn bật — chỉ Video/Truyền hình/Phát thanh mới có công tắc tắt; khi tắt thì video xuất bản bằng nút hiển thị như hiện tại, không qua bước duyệt.)</span>
          <span v-else class="text-xs text-neutral-400">(Khi tắt: video xuất bản bằng nút hiển thị như hiện tại, không qua bước duyệt. Khi bật: chỉ vai trò duyệt bước cuối (mặc định TBT) hoặc toàn quyền mới xuất bản được.)</span>
        </div>
      </div>

      <div v-if="current" class="surface-card p-4">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-semibold">Các bước duyệt (theo thứ tự)</h3>
          <Button label="Thêm bước" icon="pi pi-plus" severity="secondary" size="small" @click="addStep" />
        </div>
        <DataTable :value="form.steps" size="small" data-key="key">
          <Column header="#" style="width:3rem"><template #body="{ index }">{{ index + 1 }}</template></Column>
          <Column header="Tên hiển thị bước"><template #body="{ data }"><InputText v-model="data.label" class="w-full" placeholder="VD: T.PP — Trưởng/Phó phòng" /></template></Column>
          <Column header="Role được duyệt" style="min-width:14rem"><template #body="{ data }"><MultiSelect v-model="data.roleNames" :options="roles" option-label="name" option-value="name" placeholder="Chọn Role..." display="chip" class="w-full" @change="data.roleName = (data.roleNames?.length ? data.roleNames[0] : '')" /></template></Column>
          <Column header="Trả lại về" style="min-width:12rem"><template #body="{ data }"><Dropdown v-model="data.returnTo" :options="returnOptions" option-label="label" option-value="value" class="w-full" /></template></Column>
          <Column header="Duyệt khẩn" style="width:6rem"><template #body="{ data }"><Checkbox v-model="data.allowEmergency" binary /></template></Column>
          <Column header="Key" style="width:8rem"><template #body="{ data }"><span class="text-xs text-neutral-400">{{ data.key }}</span></template></Column>
          <Column header="" style="width:8rem"><template #body="{ data, index }">
            <Button icon="pi pi-chevron-up" size="small" text :disabled="index === 0" @click="moveStep(index, -1)" />
            <Button icon="pi pi-chevron-down" size="small" text :disabled="index === form.steps.length - 1" @click="moveStep(index, 1)" />
            <Button icon="pi pi-trash" size="small" text severity="danger" @click="removeStep(index)" />
          </template></Column>
        </DataTable>
        <p class="mt-2 text-xs text-neutral-400">Key của bước không đổi khi sửa tên — hồ sơ đang chạy dở được remap theo key. Sửa tên, Role, hướng trả, duyệt khẩn áp dụng ngay; thêm/xóa/đổi thứ tự sẽ hiện cảnh báo số hồ sơ đang chạy dở trước khi lưu. Thay đổi chỉ lưu khi bấm Lưu.</p>
      </div>
    </div>

    <Dialog v-model:visible="confirmDlg" modal header="Lưu thay đổi cấu trúc bước" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Bạn đã thêm, xóa hoặc đổi thứ tự bước. Hiện có <b>{{ inFlightCount }} hồ sơ</b> đang chờ duyệt ở phân hệ này.</p>
        <p class="text-sm">Khi lưu, hệ thống sẽ tự động cập nhật bước của các hồ sơ đó theo key: bước giữ nguyên key thì nhận vị trí mới, hồ sơ đang đứng ở bước bị xóa sẽ về nháp kèm ghi chú hệ thống trong lịch sử duyệt.</p>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="confirmDlg = false" />
        <Button label="Lưu và cập nhật hồ sơ" severity="warn" :loading="saving" @click="doSave" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { useToast } from 'primevue/usetoast';

definePageMeta({ layout: 'admin' });

const api = useApi();
const { can } = useCmsAuth();
const toast = useToast();

const definitions = ref<any[]>([]);
const roles = ref<any[]>([]);
const selectedKey = ref('epaper');
const current = ref<any>(null);
const form = ref<any>({ label: '', authorRole: null, authorLabel: '', enabled: true, steps: [] });
const saving = ref(false);
const confirmDlg = ref(false);
const inFlightCount = ref(0);
const returnOptions = [
  { label: 'Về thẳng người tạo (nháp)', value: 'creator' },
  { label: 'Về bước liền trước', value: 'previous' },
];

// Form luon o dang chuan hoa giong snapshot() nen so sanh JSON la du de
// biet co thay doi chua luu hay khong (khong can watch deep).
const dirty = computed(() => {
  if (!current.value) return false;
  return JSON.stringify(form.value) !== JSON.stringify(snapshot(current.value));
});

function snapshot(d: any) {
  return {
    label: d.label || '',
    authorRole: d.authorRole ?? null,
    authorLabel: d.authorLabel ?? '',
    enabled: !!d.enabled,
    steps: (d.steps || []).map((s: any) => ({ key: s.key, label: s.label, roleName: s.roleName, roleNames: (s.roleNames?.length ? [...s.roleNames] : (s.roleName ? [s.roleName] : [])), returnTo: s.returnTo || 'creator', allowEmergency: !!s.allowEmergency })),
  };
}

function selectDef() {
  const d = definitions.value.find((x) => x.moduleKey === selectedKey.value);
  if (!d) return;
  current.value = d;
  form.value = snapshot(d);
}

async function loadAll() {
  try {
    definitions.value = await api.get<any[]>('/admin/workflows');
    roles.value = await api.get<any[]>('/admin/workflows/meta/roles');
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được quy trình duyệt', life: 3000 });
    return;
  }
  selectDef();
}

function addStep() {
  form.value.steps.push({ key: 'step-' + Math.random().toString(36).slice(2, 8), label: '', roleName: '', roleNames: [], returnTo: 'creator', allowEmergency: false });
}
function removeStep(i: number) {
  form.value.steps.splice(i, 1);
}
function moveStep(i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= form.value.steps.length) return;
  const [s] = form.value.steps.splice(i, 1);
  form.value.steps.splice(j, 0, s);
}

function errMsg(e: any, fallback: string) {
  return e?.data?.error?.message || e?.data?.message || e?.message || fallback;
}

async function askSave() {
  if (!form.value.label.trim()) { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Thiếu tên hiển thị phân hệ', life: 3000 }); return; }
  if (!form.value.steps.length) { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Quy trình phải có ít nhất 1 bước duyệt', life: 3000 }); return; }
  for (const s of form.value.steps) {
    if (!s.label.trim()) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `Bước ${s.key} thiếu tên hiển thị`, life: 3000 }); return; }
    // roleName chinh luon dong bo tu roleNames[0] (xem cot MultiSelect).
    s.roleName = (s.roleNames?.length ? s.roleNames[0] : s.roleName) || '';
    if (!s.roleName) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `Bước ${s.key} chưa chọn Role được duyệt`, life: 3000 }); return; }
  }
  const oldKeys = (current.value.steps || []).map((s: any) => s.key).join('|');
  const newKeys = form.value.steps.map((s: any) => s.key).join('|');
  if (oldKeys !== newKeys) {
    try {
      const r = await api.get<any>(`/admin/workflows/${selectedKey.value}/in-flight`);
      inFlightCount.value = r?.count ?? 0;
    } catch {
      inFlightCount.value = 0;
    }
    confirmDlg.value = true;
    return;
  }
  await doSave();
}

async function doSave() {
  saving.value = true;
  try {
    const r = await api.put<any>(`/admin/workflows/${selectedKey.value}`, form.value);
    toast.add({ severity: 'success', summary: `Đã lưu${r?.structureChanged ? ` (${r?.remapped ?? 0} hồ sơ đổi bước, ${r?.resetToDraft ?? 0} hồ sơ về nháp)` : ''}`, life: 4000 });
    confirmDlg.value = false;
    await loadAll();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Lưu thất bại'), life: 4000 });
  } finally {
    saving.value = false;
  }
}

onMounted(loadAll);
</script>
