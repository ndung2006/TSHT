<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <p class="text-sm font-medium">{{ title }}</p>
      <p class="text-xs text-neutral-500 mt-1">
        Tick "Đưa vào kho {{ blockLabel }}" trong form bài viết chỉ đưa bài vào kho; thứ tự hiển thị trên trang chủ
        chỉ quyết định ở đây. Lưu một lần cả danh sách và thứ tự — trang chủ cập nhật ngay.
        <span v-if="block === 'noi-bat'">Bài ở vị trí 1 là "Bài chính" (tin lớn ở giữa trang chủ).</span>
        <span v-if="block === 'tieu-diem'">Một bài được ở cả hai khối; trong cùng một khối mỗi bài chỉ xuất hiện một lần.</span>
      </p>
      <div class="flex items-center gap-2 mt-3 flex-wrap">
        <span class="text-sm">Đã chọn <b>{{ items.length }}/{{ maxSlots }}</b> vị trí</span>
        <span class="text-xs text-neutral-500">·</span>
        <label class="text-sm" for="max-slots">Số vị trí tối đa</label>
        <InputNumber input-id="max-slots" v-model="maxSlots" :min="1" :max="20" size="small" :disabled="!can('zones:publish')" class="w-20" />
        <Button label="Lưu" icon="pi pi-save" size="small" :disabled="!can('zones:publish') || !dirty || saving" :loading="saving" @click="save" />
        <span v-if="dirty" class="text-xs text-amber-600">Có thay đổi chưa lưu</span>
      </div>
    </div>

    <div class="grid md:grid-cols-2 gap-4 items-start">
      <!-- Cot trai: kho -->
      <div class="surface-card p-4 flex flex-col gap-3">
        <p class="text-sm font-medium">Kho — bài đã xuất bản trong kho {{ blockLabel }}</p>
        <div class="flex gap-2">
          <InputText v-model="poolQ" placeholder="Tìm theo tiêu đề…" class="flex-1" @keyup.enter="reloadPool" />
          <Button label="Tìm" size="small" @click="reloadPool" />
        </div>
        <div ref="poolBox" class="flex flex-col gap-1 overflow-y-auto" style="max-height: 560px" @scroll="onPoolScroll">
          <div v-for="c in pool" :key="c.publicId" class="flex items-center gap-2 text-sm border rounded px-2 py-1">
            <span class="flex-1 min-w-0">
              <span class="block truncate" :title="c.title">{{ c.title }}</span>
              <span class="text-xs text-neutral-500">{{ c.category?.name || '' }} · {{ (c.publishAt || '').slice(0, 10) }}</span>
            </span>
            <Button label="+" size="small" :disabled="!canAdd" @click="addItem(c)" />
          </div>
          <p v-if="!pool.length && !poolLoading" class="text-sm text-neutral-500">Kho trống — tick "Đưa vào kho {{ blockLabel }}" trong form bài viết để thêm bài.</p>
          <p v-if="poolLoading" class="text-sm text-neutral-500">Đang tải…</p>
          <Button v-if="poolHasMore && !poolLoading" label="Tải thêm" size="small" text @click="loadPoolMore" />
        </div>
        <p v-if="items.length >= maxSlots" class="text-xs text-amber-600">Đã đủ vị trí — gỡ bớt một bài rồi mới thêm được.</p>
      </div>

      <!-- Cot phai: dang hien thi -->
      <div class="surface-card p-4 flex flex-col gap-3">
        <p class="text-sm font-medium">Đang hiển thị — {{ items.length }}/{{ maxSlots }}</p>
        <DataTable :value="items" :loading="loading" size="small" dataKey="articlePublicId" @row-reorder="onRowReorder">
          <Column rowReorder :reorderableColumn="false" style="width:2.5rem" />
          <Column header="#" style="width:4.5rem">
            <template #body="{ index }">
              <span>{{ index + 1 }}</span>
              <Tag v-if="block === 'noi-bat' && index === 0" value="Bài chính" severity="info" class="ml-1" />
            </template>
          </Column>
          <Column header="Tiêu đề">
            <template #body="{ data }">
              <span class="block truncate" :title="data.article.title">{{ data.article.title }}</span>
              <span class="text-xs text-neutral-500">{{ data.article.category?.name || '' }} · {{ (data.article.publishAt || '').slice(0, 10) }}</span>
              <span v-if="data.articleStatus !== 'published'" class="block text-xs text-amber-600">Đã hạ xuất bản — trang chủ để trống vị trí này</span>
              <span v-if="block === 'tieu-diem' && data.articlePublicId === mainArticlePublicId" class="block text-xs text-sky-600">Đang là bài chính của Tin nổi bật — trang chủ bỏ link trùng này</span>
            </template>
          </Column>
          <Column header="Thao tác" style="width:9.5rem">
            <template #body="{ data, index }">
              <Button v-if="can('zones:publish')" label="Lên" size="small" text :disabled="index === 0" @click="move(index, -1)" />
              <Button v-if="can('zones:publish')" label="Xuống" size="small" text :disabled="index === items.length - 1" @click="move(index, 1)" />
              <Button v-if="can('zones:publish')" label="−" size="small" text severity="danger" @click="removeItem(index)" />
            </template>
          </Column>
        </DataTable>
        <p v-if="!items.length && !loading" class="text-sm text-neutral-500">Chưa chọn bài nào — trang chủ hiện khối trống.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });

import { onBeforeRouteLeave } from 'vue-router';
import { useConfirm } from 'primevue/useconfirm';

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();
const route = useRoute();

const BLOCKS: Record<string, { label: string; title: string }> = {
  'noi-bat': { label: 'Tin nổi bật', title: 'Sắp xếp Tin nổi bật' },
  'tieu-diem': { label: 'Tin tiêu điểm', title: 'Sắp xếp Tin tiêu điểm' },
};
const block = computed(() => (route.query.block === 'tieu-diem' ? 'tieu-diem' : 'noi-bat'));
const blockLabel = computed(() => BLOCKS[block.value].label);
const title = computed(() => BLOCKS[block.value].title);
useHead({ title: computed(() => `${title.value} - VTC ANY CMS`) });

const loading = ref(false);
const saving = ref(false);
const items = ref<any[]>([]);
const version = ref(0);
const maxSlots = ref(4);
// (c) Bai chinh (vi tri 1 khoi Noi bat) de ghi chu o khoi Tieu diem.
const mainArticlePublicId = ref<string | null>(null);

const pool = ref<any[]>([]);
const poolQ = ref('');
const poolPage = ref(1);
const poolTotal = ref(0);
const poolLoading = ref(false);
const poolHasMore = computed(() => pool.value.length < poolTotal.value);
const POOL_LIMIT = 20;

const savedSnapshot = ref('');
const dirty = computed(() => savedSnapshot.value !== JSON.stringify({ items: items.value.map((x: any) => x.articlePublicId), maxSlots: maxSlots.value }));
const canAdd = computed(() => can('zones:publish') && items.value.length < maxSlots.value);

function snapshot() {
  savedSnapshot.value = JSON.stringify({ items: items.value.map((x: any) => x.articlePublicId), maxSlots: maxSlots.value });
}

async function load() {
  loading.value = true;
  try {
    const d: any = await api.get(`/admin/home-slots/${block.value}`);
    items.value = d.items || [];
    version.value = d.version ?? 0;
    maxSlots.value = d.maxSlots ?? (block.value === 'noi-bat' ? 4 : 3);
    if (block.value === 'tieu-diem') {
      try {
        const nb: any = await api.get('/admin/home-slots/noi-bat');
        mainArticlePublicId.value = nb.items?.[0]?.articlePublicId || null;
      } catch { mainArticlePublicId.value = null; }
    } else {
      mainArticlePublicId.value = null;
    }
    snapshot();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không tải được danh sách' });
  }
  loading.value = false;
  await reloadPool();
}

async function loadPoolPage(page: number) {
  poolLoading.value = true;
  try {
    const d: any = await api.get(`/admin/home-slots/${block.value}/pool`, { q: poolQ.value || undefined, page, limit: POOL_LIMIT });
    if (page === 1) pool.value = d.items || [];
    else pool.value = [...pool.value, ...(d.items || [])];
    poolPage.value = d.page || page;
    poolTotal.value = d.total || 0;
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không tải được kho' });
  }
  poolLoading.value = false;
}
async function reloadPool() { await loadPoolPage(1); }
async function loadPoolMore() {
  if (poolHasMore.value && !poolLoading.value) await loadPoolPage(poolPage.value + 1);
}
function onPoolScroll(e: any) {
  const el = e.target;
  if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 120) loadPoolMore();
}

function addItem(c: any) {
  if (!canAdd.value) return;
  items.value = [...items.value, { articlePublicId: c.publicId, sortOrder: items.value.length, article: c, articleStatus: 'published' }];
  pool.value = pool.value.filter((x: any) => x.publicId !== c.publicId);
  poolTotal.value = Math.max(0, poolTotal.value - 1);
}
function removeItem(index: number) {
  items.value.splice(index, 1);
  items.value = [...items.value];
  reloadPool();
}
function move(index: number, dir: number) {
  const j = index + dir;
  if (j < 0 || j >= items.value.length) return;
  const arr = [...items.value];
  const tmp = arr[index];
  arr[index] = arr[j];
  arr[j] = tmp;
  items.value = arr;
}
function onRowReorder(e: any) {
  // DataTable row-reorder tra ve mang da sap lai (e.value).
  if (Array.isArray(e?.value)) items.value = e.value;
}

async function save() {
  if (!dirty.value) return;
  saving.value = true;
  try {
    const d: any = await api.put(`/admin/home-slots/${block.value}`, {
      items: items.value.map((x: any) => x.articlePublicId),
      version: version.value,
      maxSlots: maxSlots.value,
    });
    items.value = d.items || [];
    version.value = d.version ?? 0;
    maxSlots.value = d.maxSlots ?? maxSlots.value;
    snapshot();
    toast.add({ severity: 'success', summary: 'Đã lưu', detail: 'Trang chủ đã cập nhật theo thứ tự mới' });
  } catch (e: any) {
    const status = e?.response?.status ?? e?.status;
    if (status === 409) {
      toast.add({ severity: 'warn', summary: 'Xung đột', detail: 'Danh sách đã bị thay đổi bởi người khác — đã tải lại bản mới nhất, hãy kiểm tra rồi lưu lại' });
      await load();
    } else {
      toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không lưu được' });
    }
  }
  saving.value = false;
}

// Canh bao khi roi trang ma co thay doi chua luu (ca doi khoi qua sidebar).
onBeforeRouteLeave((_to, _from, next) => {
  if (!dirty.value) return next();
  confirm.require({
    message: 'Có thay đổi chưa lưu ở danh sách này. Rời trang mà không lưu?',
    header: 'Chưa lưu thay đổi',
    icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Rời trang',
    rejectLabel: 'Ở lại',
    accept: () => next(),
    reject: () => next(false),
  });
});

watch(block, () => { load(); });
onMounted(load);
</script>
