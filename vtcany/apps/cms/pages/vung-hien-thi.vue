<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4">
      <p class="text-sm font-medium">Vùng hiển thị trang chủ (Zone/Widget Manager — gói 1A)</p>
      <p class="text-xs text-neutral-500 mt-1">
        Ghim bài đã xuất bản vào các vị trí trang chủ. Mỗi vị trí có số slot riêng theo layout thật:
        Tiêu điểm 4 slot (khối Tin nổi bật), Tin mới nhất 8 slot (khối Tin mới nhất).
        Một bài chỉ ghim ở tối đa một vị trí — bài đã ghim không hiện trong danh sách chọn của vị trí khác.
        Khi vị trí chưa đủ bài ghim, khối công khai tự lấp đầy từ bài nổi bật / bài mới nhất nên trang chủ không trống.
        Ghim/bỏ ghim không đổi trạng thái hay bước duyệt của bài viết.
      </p>
    </div>

    <div v-for="z in zones" :key="z.key" class="surface-card p-4 flex flex-col gap-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-sm font-medium">{{ z.name }} <span class="text-neutral-500 font-normal">— {{ z.description }}</span></p>
        <Tag :value="`${z.count}/${z.slotLimit} slot`" :severity="z.count >= z.slotLimit ? 'warn' : 'info'" />
      </div>

      <DataTable :value="z.items" :loading="loading" size="small">
        <Column field="sortOrder" header="#" style="width:3rem" />
        <Column header="Ảnh" style="width:7rem">
          <template #body="{ data }">
            <img v-if="data.article.coverPath" :src="resolveMedia(data.article.coverPath)" alt="" class="w-20 h-12 object-cover rounded" />
            <span v-else class="text-xs text-neutral-400">—</span>
          </template>
        </Column>
        <Column header="Tiêu đề">
          <template #body="{ data }">
            <span class="block truncate" :title="data.article.title">{{ data.article.title }}</span>
            <span class="text-xs text-neutral-500">{{ data.article.category?.name || '' }} · {{ (data.article.publishAt || '').slice(0, 10) }}</span>
          </template>
        </Column>
        <Column header="Trạng thái bài" style="width:9rem">
          <template #body="{ data }">
            <Tag :value="data.articleStatus === 'published' ? 'Đã xuất bản' : data.articleStatus" :severity="data.articleStatus === 'published' ? 'success' : 'warn'" />
          </template>
        </Column>
        <Column header="Thao tác" style="width:13rem">
          <template #body="{ data }">
            <Button v-if="can('zones:publish')" label="Lên" size="small" text @click="move(z, data, 'up')" />
            <Button v-if="can('zones:publish')" label="Xuống" size="small" text @click="move(z, data, 'down')" />
            <Button v-if="can('zones:publish')" label="Bỏ ghim" size="small" text severity="danger" @click="unpin(z, data)" />
          </template>
        </Column>
      </DataTable>
      <p v-if="!z.items?.length && !loading" class="text-sm text-neutral-500">Chưa ghim bài nào — khối công khai đang lấp đầy từ bài nổi bật / bài mới nhất.</p>

      <div v-if="can('zones:publish')" class="flex flex-col gap-2">
        <div class="flex gap-2">
          <InputText v-model="pickQ[z.key]" placeholder="Tìm bài đã xuất bản để ghim…" class="flex-1" @keyup.enter="loadCandidates(z)" />
          <Button label="Tìm" size="small" @click="loadCandidates(z)" />
        </div>
        <div v-if="candidates[z.key]?.length" class="flex flex-col gap-1">
          <div v-for="c in candidates[z.key]" :key="c.publicId" class="flex items-center gap-2 text-sm border rounded px-2 py-1">
            <span class="flex-1 truncate" :title="c.title">{{ c.title }}</span>
            <span class="text-xs text-neutral-500">{{ c.category?.name || '' }}</span>
            <Button label="Ghim" size="small" :disabled="z.count >= z.slotLimit" @click="pin(z, c)" />
          </div>
        </div>
        <p v-else-if="candidatesSearched[z.key]" class="text-xs text-neutral-500">Không tìm thấy bài đã xuất bản nào chưa ghim.</p>
        <p v-if="z.count >= z.slotLimit" class="text-xs text-amber-600">Vị trí đã đủ slot — bỏ ghim một bài rồi mới ghim thêm được.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Vùng hiển thị - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const zones = ref<any[]>([]);
const loading = ref(false);
const pickQ = ref<Record<string, string>>({});
const candidates = ref<Record<string, any[]>>({});
const candidatesSearched = ref<Record<string, boolean>>({});

// URL thu vien tra ve la tuong doi (/images/...) thuoc ve backend, khong
// phai origin CMS: chi dung resolveMedia khi HIEN THI (giong tin bai,
// phan phoi). Gia tri luu trong DB giu nguyen duong dan tuong doi.
function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}

async function load() {
  loading.value = true;
  try { zones.value = await api.get<any[]>('/admin/zones') || []; }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không tải được vùng hiển thị' }); }
  loading.value = false;
}

async function loadCandidates(z: any) {
  try {
    candidates.value[z.key] = await api.get<any[]>('/admin/zones/candidates', { q: pickQ.value[z.key] || undefined, limit: 20 }) || [];
    candidatesSearched.value[z.key] = true;
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không tải được danh sách bài' }); }
}

async function pin(z: any, c: any) {
  try {
    await api.post(`/admin/zones/${z.key}/pin`, { articlePublicId: c.publicId });
    candidates.value[z.key] = (candidates.value[z.key] || []).filter((x: any) => x.publicId !== c.publicId);
    await load();
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không ghim được bài' }); }
}

async function unpin(z: any, row: any) {
  try { await api.del(`/admin/zones/${z.key}/pin/${row.articlePublicId}`); await load(); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không bỏ ghim được' }); }
}

async function move(z: any, row: any, direction: 'up' | 'down') {
  try { await api.post(`/admin/zones/${z.key}/move`, { articlePublicId: row.articlePublicId, direction }); await load(); }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || 'Không đổi thứ tự được' }); }
}

onMounted(load);
</script>
