<template>
  <div class="flex flex-col gap-4">
    <div class="surface-card p-4 flex flex-wrap items-end gap-2">
      <div>
        <label class="field-label">Từ ngày</label>
        <InputText v-model="from" type="date" class="w-44" />
      </div>
      <div>
        <label class="field-label">Đến ngày</label>
        <InputText v-model="to" type="date" class="w-44" />
      </div>
      <Button label="Xem thống kê" size="small" :loading="loading" @click="load" />
      <Button label="Xuất Excel" size="small" icon="pi pi-file-excel" severity="success" @click="exportExcel" />
      <p class="text-xs text-neutral-500 w-full">Kỳ lọc theo ngày XUẤT BẢN của bài viết. Để trống = toàn bộ.
        Thống kê điểm chỉ tính các bản chấm ĐÃ KHÓA (BBT đã duyệt). File Excel xuất ra đúng mẫu
        "Thống kê nhuận bút" của tòa soạn: 1 dòng / bài × tác giả.</p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="surface-card p-4">
        <p class="text-xs text-neutral-400">Bài đã khóa điểm</p>
        <p class="text-2xl font-semibold">{{ data.totals.lockedArticles }}</p>
      </div>
      <div class="surface-card p-4">
        <p class="text-xs text-neutral-400">Bài đã xuất bản trong kỳ</p>
        <p class="text-2xl font-semibold">{{ data.totals.publishedArticles }}</p>
      </div>
      <div class="surface-card p-4">
        <p class="text-xs text-neutral-400">Số tác giả có điểm</p>
        <p class="text-2xl font-semibold">{{ data.totals.authors }}</p>
      </div>
      <div class="surface-card p-4">
        <p class="text-xs text-neutral-400">Tổng điểm đã khóa</p>
        <p class="text-2xl font-semibold">{{ data.totals.totalPoints }}</p>
      </div>
    </div>

    <div class="surface-card p-4">
      <h3 class="text-sm font-semibold mb-2">Điểm theo tác giả (đã khóa)</h3>
      <DataTable :value="data.byAuthor" :loading="loading" size="small" sort-field="total" :sort-order="-1">
        <Column field="author" header="Tác giả" style="min-width:14rem" />
        <Column field="articles" header="Số bài" />
        <Column field="content" header="Nội dung" />
        <Column field="image" header="Ảnh" />
        <Column field="video" header="Video" />
        <Column field="audio" header="Audio" />
        <Column field="other" header="Khác" />
        <Column field="total" header="Tổng điểm" />
        <template #empty><p class="text-sm text-neutral-400">Chưa có điểm đã khóa trong kỳ.</p></template>
      </DataTable>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Top bài theo lượt xem</h3>
        <DataTable :value="data.topViewed" size="small">
          <Column field="title" header="Bài viết" />
          <Column field="views" header="Lượt xem" style="min-width:7rem" />
          <template #empty><p class="text-sm text-neutral-400">Chưa có lượt xem trong kỳ.</p></template>
        </DataTable>
      </div>
      <div class="surface-card p-4">
        <h3 class="text-sm font-semibold mb-2">Bài xuất bản theo ngày</h3>
        <DataTable :value="data.articlesByDay" size="small" paginator :rows="10">
          <Column field="day" header="Ngày" />
          <Column field="count" header="Số bài" />
          <template #empty><p class="text-sm text-neutral-400">Chưa có bài xuất bản trong kỳ.</p></template>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Thống kê nhuận bút - VTC ANY CMS' });

const api = useApi();
const toast = useToast();

const from = ref('');
const to = ref('');
const loading = ref(false);
const data = ref<any>({
  totals: { lockedArticles: 0, publishedArticles: 0, authors: 0, totalPoints: 0 },
  byAuthor: [], articlesByDay: [], topViewed: [],
});

async function load() {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/royalties/dashboard', {
      from: from.value || undefined, to: to.value || undefined,
    });
    data.value = {
      totals: r.totals || data.value.totals,
      byAuthor: r.byAuthor || [], articlesByDay: r.articlesByDay || [], topViewed: r.topViewed || [],
    };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Không tải được thống kê', life: 3000 });
  } finally { loading.value = false; }
}

function exportExcel() {
  // Route admin co JWT: tai qua fetch kem Bearer token (mau bao-in.vue downloadPdf).
  const base = (useRuntimeConfig().public.apiBase as string).replace(/\/$/, '');
  const token = localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token') || '';
  if (!token) { toast.add({ severity: 'warn', summary: 'Hết phiên đăng nhập', life: 2500 }); return; }
  const qs = new URLSearchParams();
  if (from.value) qs.set('from', from.value);
  if (to.value) qs.set('to', to.value);
  const suffix = [from.value, to.value].filter(Boolean).join('_');
  fetch(`${base}/admin/royalties/export${qs.toString() ? `?${qs}` : ''}`, { headers: { Authorization: `Bearer ${token}` } })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `thong-ke-nhuan-but${suffix ? `-${suffix}` : ''}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch((e) => toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.message || 'Xuất Excel thất bại', life: 3000 }));
}

load();
</script>
