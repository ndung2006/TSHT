<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <div v-for="s in stats" :key="s.label" class="surface-card p-5">
        <div class="flex items-center justify-between">
          <span class="text-sm text-neutral-400">{{ s.label }}</span>
          <i :class="['pi', s.icon, 'text-xl text-neutral-500']" />
        </div>
        <div class="mt-2 text-3xl font-bold">{{ s.value }}</div>
      </div>
    </div>

    <div class="surface-card p-5">
      <h2 class="mb-3 font-semibold">Quản lý nhanh</h2>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        <NuxtLink v-for="q in quickLinks" :key="q.to" :to="q.to"
          class="flex items-center gap-3 rounded-lg border border-neutral-800 p-3 hover:bg-white/5">
          <i :class="['pi', q.icon, 'text-lg text-sky-400']" />
          <span class="text-sm">{{ q.label }}</span>
        </NuxtLink>
      </div>
    </div>

    <div class="grid gap-6 xl:grid-cols-2">
      <div class="surface-card p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold">Videos mới nhất</h2>
          <NuxtLink to="/videos" class="text-sm text-sky-400 hover:underline">Xem tất cả</NuxtLink>
        </div>
        <DataTable :value="videos" size="small" :loading="loading">
          <Column field="title" header="Tiêu đề" />
          <Column field="channel" header="Kênh" />
          <Column field="status" header="Trạng thái">
            <template #body="{ data }"><Tag :value="data.status" :severity="statusSev(data.status)" /></template>
          </Column>
        </DataTable>
      </div>
      <div class="surface-card p-5">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="font-semibold">Nhật ký mới nhất</h2>
          <NuxtLink to="/nhat-ky" class="text-sm text-sky-400 hover:underline">Xem tất cả</NuxtLink>
        </div>
        <DataTable :value="audits" size="small" :loading="loading">
          <Column field="actor" header="Người thực hiện" />
          <Column field="action" header="Hành động" />
          <Column field="resource" header="Tài nguyên" />
          <Column header="Thời gian">
            <template #body="{ data }">{{ fmtTime(data.at) }}</template>
          </Column>
        </DataTable>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Dashboard - VTC ANY CMS' });

const api = useApi();
const loading = ref(true);
const stats = ref([
  { label: 'Tổng videos', icon: 'pi-play', value: '—' },
  { label: 'Danh mục', icon: 'pi-folder', value: '—' },
  { label: 'Layout blocks', icon: 'pi-images', value: '—' },
  { label: 'Nhật ký', icon: 'pi-history', value: '—' },
]);
const videos = ref<any[]>([]);
const audits = ref<any[]>([]);
const quickLinks = [
  { to: '/phim', label: 'Phim', icon: 'pi-video' },
  { to: '/short', label: 'Short', icon: 'pi-bolt' },
  { to: '/tap-tin', label: 'Tập tin', icon: 'pi-folder-open' },
  { to: '/the-loai', label: 'Thể loại', icon: 'pi-tags' },
  { to: '/dien-vien', label: 'Diễn viên', icon: 'pi-user' },
  { to: '/danh-sach-phat', label: 'Danh sách phát', icon: 'pi-list' },
  { to: '/bai-viet', label: 'Bài viết', icon: 'pi-file-edit' },
  { to: '/su-kien', label: 'Sự kiện', icon: 'pi-calendar' },
  { to: '/livestream', label: 'Livestream', icon: 'pi-broadcast-tower' },
  { to: '/thong-bao', label: 'Thông báo', icon: 'pi-bell' },
  { to: '/tu-khoa', label: 'Từ khoá', icon: 'pi-search' },
  { to: '/goi-cuoc', label: 'Gói cước', icon: 'pi-credit-card' },
  { to: '/thong-ke', label: 'Thống kê', icon: 'pi-chart-bar' },
  { to: '/cai-dat', label: 'Cài đặt', icon: 'pi-cog' },
];

function statusSev(s: string) {
  return { draft: 'secondary', pending: 'warn', published: 'success', rejected: 'danger' }[s] || 'info';
}
function fmtTime(at: number) {
  return at ? new Date(at).toLocaleString('vi-VN') : '';
}

onMounted(async () => {
  try {
    const [v, c, b, a] = await Promise.all([
      api.get<any>('/videos', { page: 1, limit: 5 }),
      api.get<any>('/admin/categories'),
      api.get<any>('/admin/layout-blocks'),
      api.get<any[]>('/audit-logs', { limit: 5 }),
    ]);
    videos.value = v.data || [];
    audits.value = Array.isArray(a) ? a : [];
    stats.value[0].value = v.meta?.total ?? (v.data || []).length;
    stats.value[1].value = (c.data || []).length;
    stats.value[2].value = (b.data || []).length;
    stats.value[3].value = audits.value.length;
  } catch { /* giữ placeholder khi API lỗi */ }
  finally { loading.value = false; }
});
</script>
