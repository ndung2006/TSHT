<template>
  <div class="flex flex-col gap-6">
    <!-- Cau hinh nguon phat VTCAIO: nhieu domain + token key, quet kenh truoc khi kich hoat -->
    <div class="surface-card p-4">
      <div class="mb-2 flex flex-wrap items-center gap-2">
        <h2 class="font-semibold">Nguồn phát VTCAIO</h2>
        <Tag v-if="activeSource" severity="success" :value="`Đang dùng: ${activeSource.name}`" />
        <Tag v-else severity="warn" value="Chưa cấu hình — đang dùng env server" />
        <span v-if="activeSource" class="text-xs text-neutral-500">{{ activeSource.domain }}</span>
        <div class="flex-1" />
        <Button v-if="can('catalog:write')" label="Quét kênh" icon="pi pi-radar" size="small" severity="info" @click="openScan()" />
        <Button v-if="can('catalog:write')" label="Quản lý nguồn" icon="pi pi-server" size="small" outlined @click="srcDlg = true" />
      </div>
      <p class="text-xs text-neutral-500">Nhập tên miền và token key của các trang VTCAIO, quét thử kênh trước khi kích hoạt. Nguồn được kích hoạt sẽ cấp danh sách kênh, link phát và EPG cho toàn hệ thống.</p>
    </div>

    <!-- Quan ly hien thi kenh: nguon tu VTC AIO, BE quyet dinh kenh nao duoc hien thi -->
    <div class="surface-card p-4">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <h2 class="font-semibold">Quản lý kênh truyền hình</h2>
        <Tag v-if="aioError" severity="warn" value="AIO đang lỗi — danh sách có thể thiếu kênh" />
        <span class="text-xs text-neutral-500">Nguồn kênh: VTC AIO · hiển thị do BE quản lý (ẩn/hiện, nhóm, thứ tự)</span>
        <div class="flex-1" />
        <span class="p-input-icon-left">
          <i class="pi pi-search" />
          <InputText v-model="search" placeholder="Tìm kênh..." class="w-56" />
        </span>
        <Button v-if="can('catalog:write')" label="Thêm kênh / sự kiện" icon="pi pi-plus" size="small" @click="openAddCustom" />
        <Button label="Tải lại" icon="pi pi-refresh" size="small" outlined @click="loadChannels" />
      </div>

      <DataTable :value="filteredChannels" :loading="loadingChannels" size="small" paginator :rows="15">
        <Column header="Logo" style="width:5rem">
          <template #body="{ data }">
            <img v-if="data.logoUrl" :src="data.logoUrl" class="h-9 w-14 rounded bg-white object-contain" alt="" />
            <span v-else class="text-neutral-500 text-xs">—</span>
          </template>
        </Column>
        <Column header="Tên kênh">
          <template #body="{ data }">
            <div class="font-medium">{{ data.displayName || data.name }}</div>
            <div class="text-xs text-neutral-500">{{ data.key }}<span v-if="data.displayName && data.source === 'aio'"> · gốc: {{ data.name }}</span></div>
          </template>
        </Column>
        <Column header="Nguồn" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.source === 'custom' ? 'Tự thêm' : 'VTC AIO'" :severity="data.source === 'custom' ? 'info' : 'secondary'" /></template>
        </Column>
        <Column header="Danh mục (nhóm)" style="width:13rem">
          <template #body="{ data }">{{ data.groupName || 'Mặc định theo tên kênh' }}</template>
        </Column>
        <Column header="Gói cước" style="width:9rem">
          <template #body="{ data }"><Tag :value="data.planId ? planName(data.planId) : 'Miễn phí'" :severity="data.planId ? 'warn' : 'success'" /></template>
        </Column>
        <Column header="Thứ tự" style="width:6rem">
          <template #body="{ data }">{{ data.sortOrder ?? '—' }}</template>
        </Column>
        <Column header="EPG AIO" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.useAioEpg !== false ? 'Lấy' : 'Không lấy'" :severity="data.useAioEpg !== false ? 'info' : 'secondary'" /></template>
        </Column>
        <Column header="Xem lại" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.timeshiftEnabled ? 'Bật' : 'Tắt'" :severity="data.timeshiftEnabled ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Hiển thị" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.isVisible ? 'Bật' : 'Ẩn'" :severity="data.isVisible ? 'success' : 'danger'" /></template>
        </Column>
        <Column header="Thao tác" style="min-width:13rem">
          <template #body="{ data }">
            <Button icon="pi pi-pencil" size="small" text v-tooltip.top="'Cập nhật kênh'" :disabled="!can('catalog:write')" @click="openEditChannel(data)" />
            <Button :icon="data.isVisible ? 'pi pi-eye-slash' : 'pi pi-eye'" size="small" text :severity="data.isVisible ? 'warn' : 'success'"
              v-tooltip.top="data.isVisible ? 'Ẩn kênh' : 'Hiện kênh'" :disabled="!can('catalog:write')" @click="toggleVisible(data)" />
            <Button icon="pi pi-calendar" size="small" text v-tooltip.top="'Lịch phát sóng (EPG)'" @click="selectForEpg(data)" />
            <Button v-if="data.hasOverride" icon="pi pi-trash" size="small" text severity="danger"
              v-tooltip.top="data.source === 'custom' ? 'Xóa kênh tự thêm' : 'Xóa cài đặt (về mặc định AIO)'"
              :disabled="!can('catalog:write')" @click="confirmReset(data)" />
          </template>
        </Column>
      </DataTable>
    </div>

    <!-- EPG editor (giu nguyen luong cu) -->
    <div class="grid gap-6 xl:grid-cols-[20rem_1fr]">
      <div class="surface-card p-4">
        <h2 class="mb-3 font-semibold">Lịch phát sóng (EPG)</h2>
        <button v-for="ch in channels" :key="ch.key" @click="selectForEpg(ch)"
          class="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10"
          :class="selected?.key === ch.key ? 'bg-white/15 font-semibold' : ''">
          <img v-if="ch.logoUrl" :src="ch.logoUrl" class="h-6 w-6 rounded bg-white object-contain" alt="" />
          <span class="truncate">{{ ch.displayName || ch.name }}</span>
          <Tag v-if="!ch.isVisible" value="Ẩn" severity="danger" class="ml-auto" />
        </button>
        <p v-if="!channels.length" class="text-sm text-neutral-500">Chưa có kênh nào.</p>
      </div>

      <div class="surface-card p-5">
        <div v-if="!selected" class="py-16 text-center text-neutral-500">Chọn một kênh để sửa lịch phát sóng.</div>
        <div v-else class="flex flex-col gap-4">
          <div class="flex flex-wrap items-center gap-3">
            <h2 class="font-semibold">{{ selected.displayName || selected.name }}</h2>
            <Calendar v-model="date" date-format="yy-mm-dd" show-icon @date-select="loadEpg" class="w-40" />
            <span class="text-xs text-neutral-500">Nguồn: {{ source }}</span>
            <div class="flex-1" />
            <Button label="Tải file mẫu" icon="pi pi-download" size="small" outlined @click="downloadTemplate" />
            <Button v-if="can('catalog:write')" label="Nhập Excel" icon="pi pi-upload" size="small" severity="info" @click="impDlg = true" />
            <Button label="Lưu lịch" icon="pi pi-save" :loading="saving" @click="save" />
          </div>

          <DataTable :value="timeline" size="small" :loading="loading">
            <Column field="time" header="Giờ" style="width:7rem" />
            <Column field="title" header="Chương trình" />
            <Column header="Trạng thái" style="width:9rem">
              <template #body="{ data }"><Tag :value="data.status" :severity="epgSev(data.status)" /></template>
            </Column>
            <Column header="" style="width:7rem">
              <template #body="{ index }">
                <Button icon="pi pi-pencil" size="small" text @click="editRow(index)" />
                <Button icon="pi pi-trash" size="small" text severity="danger" @click="timeline.splice(index, 1)" />
              </template>
            </Column>
          </DataTable>

          <div class="flex flex-wrap items-end gap-2 rounded-lg border border-neutral-800 p-3">
            <div><label class="field-label">Giờ</label><InputText v-model="row.time" placeholder="20:00" class="w-24" /></div>
            <div class="min-w-52 flex-1"><label class="field-label">Chương trình</label><InputText v-model="row.title" class="w-full" /></div>
            <div><label class="field-label">Trạng thái</label>
              <Dropdown v-model="row.status" :options="['LIVE', 'UPCOMING', 'REPLAY']" class="w-36" />
            </div>
            <Button :label="rowIdx === -1 ? 'Thêm' : 'Cập nhật'" icon="pi pi-plus" size="small" @click="applyRow" :disabled="!row.time || !row.title.trim()" />
            <Button v-if="rowIdx !== -1" label="Hủy" size="small" text @click="resetRow" />
          </div>
        </div>
      </div>
    </div>

    <!-- Dialog cap nhat truyen hinh / su kien (mau VTCPlay) -->
    <Dialog v-model:visible="chDlg" modal :header="chEditing?.source === 'custom' && !chEditing?.key ? 'Thêm truyền hình / sự kiện' : 'Cập nhật truyền hình / sự kiện'" class="w-[95vw] max-w-6xl">
      <div class="max-h-[calc(100dvh_-_190px)] overflow-y-auto pr-2">
      <div class="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5">
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Tên (bắt buộc)</label>
            <InputText v-model="chForm.displayName" class="w-full" :placeholder="chEditing?.source === 'aio' ? chEditing.name : 'Kênh truyền hình LTV2'" />
            <p v-if="chEditing?.source === 'aio'" class="text-xs text-neutral-500 mt-1">Tên gốc từ AIO: {{ chEditing.name }} (key: {{ chEditing.key }}) — để trống ô này nếu giữ tên gốc.</p>
          </div>
          <div><label class="field-label">Mô tả</label><Textarea v-model="chForm.description" rows="4" class="w-full" /></div>
          <div><label class="field-label">Danh mục</label>
            <Dropdown v-model="chForm.groupName" :options="groupOptions" editable show-clear placeholder="Mặc định theo tên kênh" class="w-full" />
          </div>
          <div><label class="field-label">Gói cước</label>
            <Dropdown v-model="chForm.planId" :options="plans" option-label="name" option-value="id" show-clear :loading="loadingPlans" placeholder="Miễn phí" class="w-full" />
          </div>
          <div><label class="field-label">HLS</label>
            <InputText v-model="chForm.hlsUrl" class="w-full" placeholder="https://.../index.m3u8" />
            <p class="text-xs text-neutral-500 mt-1">Kênh AIO: để trống để dùng luồng trực tiếp từ VTC AIO; điền vào để ghi đè nguồn phát.</p>
          </div>
          <div><label class="field-label">DASH</label><InputText v-model="chForm.dashUrl" class="w-full" placeholder="https://.../manifest.mpd" /></div>
          <div><label class="field-label">Catchup HLS</label><InputText v-model="chForm.catchupHlsUrl" class="w-full" placeholder="https://.../catchup.m3u8" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Thứ tự hiển thị</label><InputNumber v-model="chForm.sortOrder" class="w-full" placeholder="Tự động" /></div>
            <div class="flex items-end gap-2 pb-2"><Checkbox v-model="chForm.isVisible" binary input-id="chvis" /><label for="chvis">Hiển thị kênh</label></div>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox v-model="chForm.useAioEpg" binary input-id="chepg" /><label for="chepg">Lấy EPG từ VTC AIO</label>
            <span class="text-xs text-neutral-500">(tắt = chỉ dùng lịch phát sóng nhập tay trong CMS)</span>
          </div>
          <div class="flex items-center gap-2">
            <Checkbox v-model="chForm.timeshiftEnabled" binary input-id="chts" /><label for="chts">Bật xem lại (timeshift)</label>
            <span class="text-xs text-neutral-500">(chỉ kênh AIO có bật ghi)</span>
          </div>
          <div v-if="chForm.timeshiftEnabled"><label class="field-label">Timeshift src (VD: after cho VOV1, để trống = ghi gốc)</label><InputText v-model="chForm.timeshiftSrc" class="w-full" placeholder="after" /></div>
        </div>
        <div class="flex flex-col gap-4">
          <div>
            <label class="field-label">Ảnh thumbnail (Tỉ lệ 16:9)</label>
            <ImagePicker v-model="chForm.logoUrl" ratio="16/9" fit="contain" />
          </div>
          <div>
            <label class="field-label">Ảnh banner player (Tỉ lệ 16:9)</label>
            <ImagePicker v-model="chForm.bannerUrl" ratio="16/9" />
          </div>
        </div>
      </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="chDlg = false" />
        <Button label="Lưu" icon="pi pi-check" :loading="chSaving" @click="saveChannel" :disabled="!chEditing?.key && !chForm.displayName.trim()" />
      </template>
    </Dialog>

    <!-- Dialog nhập Excel EPG -->
    <Dialog v-model:visible="impDlg" modal header="Nhập lịch từ file Excel/CSV" class="w-full max-w-md">
      <div class="flex flex-col gap-3">
        <p class="text-sm text-neutral-400">Kênh: <b class="text-neutral-200">{{ selected?.displayName || selected?.name }}</b> — Ngày: <b class="text-neutral-200">{{ dateStr() }}</b></p>
        <div><label class="field-label">File Excel (.xlsx) hoặc CSV (theo mẫu)</label>
          <input type="file" accept=".xlsx,.csv" class="w-full text-sm" @change="(e: any) => impFile = e.target.files?.[0] || null" />
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="impDlg = false" />
        <Button label="Nhập" icon="pi pi-upload" :loading="importing" @click="doImport" :disabled="!impFile" />
      </template>
    </Dialog>

    <!-- Dialog quan ly nguon phat VTCAIO -->
    <Dialog v-model:visible="srcDlg" modal header="Nguồn phát VTCAIO" class="w-full max-w-3xl" @show="loadSources">
      <div class="mb-3 flex justify-end">
        <Button v-if="can('catalog:write')" label="Thêm nguồn" icon="pi pi-plus" size="small" @click="openSrcAdd" />
      </div>
      <DataTable :value="sources" :loading="srcLoading" size="small">
        <Column field="name" header="Tên" />
        <Column field="domain" header="Tên miền" />
        <Column header="Token key" style="width:8rem">
          <template #body="{ data }"><span class="font-mono text-xs">{{ data.keyHint }}</span></template>
        </Column>
        <Column header="Trạng thái" style="width:9rem">
          <template #body="{ data }">
            <Tag v-if="data.isActive" value="Đang dùng" severity="success" />
            <Tag v-else value="Chưa dùng" severity="secondary" />
          </template>
        </Column>
        <Column header="Thao tác" style="width:12rem">
          <template #body="{ data }">
            <Button v-if="!data.isActive && can('catalog:write')" label="Kích hoạt" size="small" text @click="activateSource(data)" />
            <Button v-if="can('catalog:write')" icon="pi pi-radar" size="small" text v-tooltip.top="'Quét kênh thử'" @click="openScan(data.id)" />
            <Button v-if="can('catalog:write')" icon="pi pi-pencil" size="small" text @click="openSrcEdit(data)" />
            <Button v-if="can('catalog:write')" icon="pi pi-trash" size="small" text severity="danger" @click="removeSource(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Token key không bao giờ hiển thị đầy đủ. Nguồn được kích hoạt sẽ cấp kênh/link/EPG cho toàn hệ thống (thay cho cấu hình env server).</p>
    </Dialog>

    <!-- Dialog them/sua nguon VTCAIO -->
    <Dialog v-model:visible="srcFormDlg" modal :header="srcEditing ? 'Sửa nguồn VTCAIO' : 'Thêm nguồn VTCAIO'" class="w-full max-w-xl">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tên *</label><InputText v-model="srcForm.name" class="w-full" placeholder="vd: Luuchieu1" /></div>
        <div><label class="field-label">Tên miền *</label><InputText v-model="srcForm.domain" class="w-full" placeholder="https://luuchieu1.vtcplay.vn" /></div>
        <div>
          <label class="field-label">Token key {{ srcEditing ? '(để trống = giữ nguyên)' : '*' }}</label>
          <Password v-model="srcForm.tokenKey" class="w-full" :feedback="false" toggle-mask placeholder="Partner key của trang VTCAIO" />
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="srcFormDlg = false" />
        <Button label="Lưu" :loading="srcSaving" :disabled="!srcForm.name.trim() || !srcForm.domain.trim() || (!srcEditing && !srcForm.tokenKey.trim())" @click="saveSource" />
      </template>
    </Dialog>

    <!-- Dialog quet kenh thu -->
    <Dialog v-model:visible="scanDlg" modal header="Quét kênh từ VTCAIO" class="w-full max-w-3xl">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div><label class="field-label">Tên miền *</label><InputText v-model="scanForm.domain" class="w-full" placeholder="https://luuchieu1.vtcplay.vn" /></div>
        <div>
          <label class="field-label">Token key *</label>
          <Password v-model="scanForm.tokenKey" class="w-full" :feedback="false" toggle-mask placeholder="Để trống nếu quét nguồn đã lưu" />
        </div>
      </div>
      <div class="mt-3 flex items-center gap-2">
        <Button label="Quét kênh" icon="pi pi-radar" :loading="scanning" :disabled="!scanForm.domain.trim()" @click="doScan" />
        <span v-if="scanResult" class="text-sm text-neutral-400">Tìm thấy {{ scanResult.total }} kênh ({{ scanResult.live }} đang phát)</span>
      </div>
      <p v-if="scanError" class="mt-2 text-sm text-red-400">{{ scanError }}</p>
      <DataTable v-if="scanResult" :value="scanResult.channels" size="small" paginator :rows="15" class="mt-3">
        <Column field="name" header="Tên kênh" sortable />
        <Column field="status" header="Trạng thái" style="width:8rem" />
        <Column header="Đang phát" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.live ? 'Có' : 'Không'" :severity="data.live ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Audio" style="width:6rem">
          <template #body="{ data }"><Tag v-if="data.audioOnly" value="Radio" severity="info" /><span v-else class="text-neutral-500">—</span></template>
        </Column>
        <Column header="EPG" style="width:6rem">
          <template #body="{ data }"><Tag :value="data.hasEpg ? 'Có' : 'Không'" :severity="data.hasEpg ? 'info' : 'secondary'" /></template>
        </Column>
      </DataTable>
      <template #footer>
        <Button label="Đóng" text @click="scanDlg = false" />
        <Button v-if="scanResult && can('catalog:write')" label="Lưu nguồn này" icon="pi pi-save" outlined @click="saveScannedSource" />
      </template>
    </Dialog>

  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Truyền hình & EPG - VTC ANY CMS' });

const api = useApi();
const toast = useToast();
const confirm = useConfirm();
const { can } = useCmsAuth();

// ---------- Quan ly hien thi kenh ----------
const channels = ref<any[]>([]);
const loadingChannels = ref(false);
const aioError = ref(false);
const search = ref('');
const plans = ref<any[]>([]);
const loadingPlans = ref(false);
const groupOptions = ['Kênh VTV', 'KÊNH ĐỊA PHƯƠNG', 'RADIO', 'ANTV-Truyền hình CAND', 'QPVN'];

const filteredChannels = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return channels.value;
  return channels.value.filter((c) => `${c.displayName || ''} ${c.name} ${c.key}`.toLowerCase().includes(q));
});
function planName(id: any): string { return plans.value.find((p) => p.id === id)?.name || 'Có gói'; }

async function loadChannels() {
  loadingChannels.value = true;
  try {
    const r = await api.get<any>('/admin/channels');
    channels.value = r.data || [];
    aioError.value = !!r.meta?.aioError;
    for (const c of channels.value) if (c.groupName && !groupOptions.includes(c.groupName)) groupOptions.push(c.groupName);
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được danh sách kênh', life: 3000 }); }
  finally { loadingChannels.value = false; }
}
async function loadPlans() {
  loadingPlans.value = true;
  try { const r = await api.get<any>('/admin/catalog/plans', { page: 1, limit: 100 }); plans.value = r.data || []; } catch { plans.value = []; }
  finally { loadingPlans.value = false; }
}

const chDlg = ref(false);
const chEditing = ref<any>(null);
const chSaving = ref(false);
const emptyChForm = () => ({ displayName: '', description: '', groupName: null as any, planId: null as any, hlsUrl: '', dashUrl: '', catchupHlsUrl: '', logoUrl: '', bannerUrl: '', sortOrder: null as number | null, isVisible: true, useAioEpg: true, timeshiftEnabled: false, timeshiftSrc: '' });
const chForm = ref(emptyChForm());

function fillChForm(c: any) {
  chForm.value = {
    displayName: c.displayName || '', description: c.description || '',
    groupName: c.groupName ?? null, planId: c.planId ?? null,
    hlsUrl: c.hlsUrl || '', dashUrl: c.dashUrl || '', catchupHlsUrl: c.catchupHlsUrl || '',
    logoUrl: c.logoUrl || '', bannerUrl: c.bannerUrl || '',
    sortOrder: c.sortOrder ?? null, isVisible: c.isVisible !== false, useAioEpg: c.useAioEpg !== false,
    timeshiftEnabled: c.timeshiftEnabled === true, timeshiftSrc: c.timeshiftSrc || '',
  };
}
function openEditChannel(c: any) { chEditing.value = c; fillChForm(c); chDlg.value = true; loadPlans(); }
function openAddCustom() {
  chEditing.value = { source: 'custom', hasOverride: false, key: '' };
  chForm.value = emptyChForm();
  chDlg.value = true; loadPlans();
}
async function saveChannel() {
  const f = chForm.value;
  const isNewCustom = chEditing.value?.source === 'custom' && !chEditing.value?.key;
  const key = isNewCustom ? f.displayName.trim() : chEditing.value.key;
  if (!key) { toast.add({ severity: 'warn', summary: 'Thiếu tên kênh', life: 2500 }); return; }
  chSaving.value = true;
  try {
    await api.put(`/admin/channels/${encodeURIComponent(key)}`, {
        displayName: f.displayName.trim() || null, description: f.description || null,
        groupName: f.groupName || null, planId: f.planId || null,
        hlsUrl: f.hlsUrl.trim() || null, dashUrl: f.dashUrl.trim() || null, catchupHlsUrl: f.catchupHlsUrl.trim() || null,
        logoUrl: f.logoUrl.trim() || null, bannerUrl: f.bannerUrl.trim() || null,
        sortOrder: f.sortOrder, isVisible: f.isVisible, useAioEpg: f.useAioEpg, isCustom: chEditing.value?.source === 'custom',
        timeshiftEnabled: f.timeshiftEnabled, timeshiftSrc: f.timeshiftSrc.trim() || null,
    });
    toast.add({ severity: 'success', summary: 'Đã lưu cài đặt kênh', life: 2500 });
    chDlg.value = false;
    loadChannels();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || e?.message, life: 3000 });
  } finally { chSaving.value = false; }
}
async function toggleVisible(c: any) {
  try {
    await api.put(`/admin/channels/${encodeURIComponent(c.key)}`, { isVisible: !c.isVisible });
    toast.add({ severity: 'success', summary: c.isVisible ? `Đã ẩn kênh ${c.displayName || c.name}` : `Đã hiện kênh ${c.displayName || c.name}`, life: 2500 });
    loadChannels();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || e?.message, life: 3000 });
  }
}
function confirmReset(c: any) {
  confirm.require({
    message: c.source === 'custom' ? `Xóa kênh tự thêm "${c.displayName || c.name}"?` : `Xóa mọi cài đặt riêng của kênh "${c.name}" và quay về mặc định AIO?`,
    header: 'Xác nhận', icon: 'pi pi-exclamation-triangle', acceptLabel: 'Xóa', rejectLabel: 'Hủy',
    accept: async () => {
      try {
        await api.del(`/admin/channels/${encodeURIComponent(c.key)}`);
        toast.add({ severity: 'success', summary: 'Đã xóa cài đặt kênh', life: 2500 });
        loadChannels();
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || e?.message, life: 3000 });
      }
    },
  });
}

// ---------- EPG ----------
const selected = ref<any>(null);
const date = ref(new Date());
const timeline = ref<any[]>([]);
const source = ref('');
const loading = ref(false);
const saving = ref(false);
const row = ref({ time: '', title: '', status: 'UPCOMING' });
const rowIdx = ref(-1);
const impDlg = ref(false);
const impFile = ref<File | null>(null);
const importing = ref(false);

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}
function slugOf(ch: any) { return ch?.key || ''; }
function dateStr() {
  const d = date.value;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function epgSev(s: string) {
  return { LIVE: 'danger', UPCOMING: 'info', REPLAY: 'secondary' }[s] || 'info';
}
function selectForEpg(ch: any) { selected.value = ch; loadEpg(); }
function resetRow() { row.value = { time: '', title: '', status: 'UPCOMING' }; rowIdx.value = -1; }
function editRow(i: number) { row.value = { ...timeline.value[i] }; rowIdx.value = i; }
function applyRow() {
  if (rowIdx.value === -1) timeline.value.push({ ...row.value });
  else timeline.value[rowIdx.value] = { ...row.value };
  timeline.value.sort((a, b) => a.time.localeCompare(b.time));
  resetRow();
}
async function loadEpg() {
  if (!selected.value) return;
  loading.value = true;
  try {
    const r = await api.get<any>(`/channels/${encodeURIComponent(slugOf(selected.value))}/schedule`, { date: dateStr() });
    timeline.value = (r.timeline || []).map((t: any) => ({ time: t.time, title: t.title, status: t.status }));
    source.value = r.source || '';
  } catch {
    timeline.value = [];
    toast.add({ severity: 'warn', summary: 'Chú ý', detail: 'Chưa có lịch, tạo mới bên dưới', life: 3000 });
  } finally { loading.value = false; }
}
async function save() {
  saving.value = true;
  try {
    await api.post(`/channels/${encodeURIComponent(slugOf(selected.value))}/epg`, { timeline: timeline.value }, { date: dateStr() });
    toast.add({ severity: 'success', summary: 'Xong', detail: `Đã lưu lịch ngày ${dateStr()}`, life: 3000 });
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || 'Lưu thất bại', life: 3000 }); }
  finally { saving.value = false; }
}

async function downloadTemplate() {
  try {
    const base = (useRuntimeConfig().public.apiBase as string).replace(/\/$/, '');
    const blob = await $fetch<Blob>(`${base}/admin/catalog/epg/template?format=xlsx`, {
      headers: authHeaders(),
      responseType: 'blob',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'epg-template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được file mẫu', life: 3000 });
  }
}
async function doImport() {
  if (!selected.value || !impFile.value) return;
  importing.value = true;
  try {
    const base = (useRuntimeConfig().public.apiBase as string).replace(/\/$/, '');
    const fd = new FormData();
    fd.append('file', impFile.value);
    const r = await $fetch<any>(`${base}/admin/catalog/channels/${encodeURIComponent(slugOf(selected.value))}/epg/import`, {
      method: 'POST',
      query: { date: dateStr() },
      body: fd,
      headers: authHeaders(),
    });
    toast.add({ severity: 'success', summary: 'Xong', detail: `Đã nhập ${r.imported ?? 0} dòng lịch ngày ${dateStr()}`, life: 4000 });
    impDlg.value = false;
    impFile.value = null;
    loadEpg();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Nhập thất bại', life: 3000 });
  } finally { importing.value = false; }
}

onMounted(() => { loadChannels(); loadPlans(); loadSources(); });

// ---- Nguon phat VTCAIO: nhieu domain + token key, quet kenh truoc khi kich hoat ----
const sources = ref<any[]>([]);
const srcLoading = ref(false);
const srcDlg = ref(false);
const srcFormDlg = ref(false);
const srcEditing = ref<any>(null);
const srcSaving = ref(false);
const srcForm = ref({ name: '', domain: '', tokenKey: '' });
const activeSource = computed(() => sources.value.find((s) => s.isActive) || null);

async function loadSources() {
  srcLoading.value = true;
  try {
    const r = await api.get<any>('/admin/tv/aio-sources');
    sources.value = r.data || [];
  } catch { /* bo qua — hien thi fallback env */ }
  finally { srcLoading.value = false; }
}
function openSrcAdd() {
  srcEditing.value = null;
  srcForm.value = { name: '', domain: '', tokenKey: '' };
  srcFormDlg.value = true;
}
function openSrcEdit(s: any) {
  srcEditing.value = s;
  srcForm.value = { name: s.name || '', domain: s.domain || '', tokenKey: '' };
  srcFormDlg.value = true;
}
async function saveSource() {
  srcSaving.value = true;
  try {
    const body: any = { name: srcForm.value.name.trim(), domain: srcForm.value.domain.trim() };
    if (srcForm.value.tokenKey.trim()) body.tokenKey = srcForm.value.tokenKey.trim();
    if (srcEditing.value) await api.patch(`/admin/tv/aio-sources/${srcEditing.value.id}`, body);
    else await api.post('/admin/tv/aio-sources', { ...body, tokenKey: body.tokenKey || '' });
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu nguồn VTCAIO', life: 3000 });
    srcFormDlg.value = false;
    loadSources();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Lưu thất bại', life: 3000 });
  } finally { srcSaving.value = false; }
}
async function activateSource(s: any) {
  try {
    await api.post(`/admin/tv/aio-sources/${s.id}/activate`, {});
    toast.add({ severity: 'success', summary: 'Xong', detail: `Đã kích hoạt nguồn "${s.name}" — hệ thống sẽ lấy kênh/link/EPG từ ${s.domain}`, life: 4000 });
    loadSources();
    loadChannels();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Kích hoạt thất bại', life: 3000 });
  }
}
function removeSource(s: any) {
  confirm.require({
    message: `Xóa nguồn "${s.name}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/tv/aio-sources/${s.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa', life: 3000 });
        loadSources();
      } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 }); }
    },
  });
}

// ---- Quet kenh thu ----
const scanDlg = ref(false);
const scanning = ref(false);
const scanError = ref('');
const scanResult = ref<any>(null);
const scanForm = ref({ domain: '', tokenKey: '', sourceId: '' });

function openScan(sourceId?: string) {
  scanError.value = '';
  scanResult.value = null;
  if (sourceId) {
    const s = sources.value.find((x) => x.id === sourceId);
    scanForm.value = { domain: s?.domain || '', tokenKey: '', sourceId };
  } else if (activeSource.value) {
    scanForm.value = { domain: activeSource.value.domain, tokenKey: '', sourceId: activeSource.value.id };
  } else {
    scanForm.value = { domain: 'https://luuchieu1.vtcplay.vn', tokenKey: '', sourceId: '' };
  }
  scanDlg.value = true;
}
async function doScan() {
  scanning.value = true;
  scanError.value = '';
  scanResult.value = null;
  try {
    const body: any = scanForm.value.tokenKey.trim()
      ? { domain: scanForm.value.domain.trim(), tokenKey: scanForm.value.tokenKey.trim() }
      : scanForm.value.sourceId
        ? { sourceId: scanForm.value.sourceId }
        : { domain: scanForm.value.domain.trim(), tokenKey: '' };
    const r = await api.post<any>('/admin/tv/aio-sources/scan', body);
    scanResult.value = r;
    if (!r?.channels?.length) scanError.value = 'Không tìm thấy kênh nào — kiểm tra lại token key.';
  } catch (e: any) {
    scanError.value = e?.response?.data?.error?.message || 'Quét kênh thất bại';
  } finally { scanning.value = false; }
}
async function saveScannedSource() {
  if (!scanResult.value) return;
  srcEditing.value = null;
  srcForm.value = {
    name: new URL(scanForm.value.domain).hostname.replace(/^www\./, ''),
    domain: scanForm.value.domain.trim(),
    tokenKey: scanForm.value.tokenKey.trim(),
  };
  scanDlg.value = false;
  srcFormDlg.value = true;
}
</script>
