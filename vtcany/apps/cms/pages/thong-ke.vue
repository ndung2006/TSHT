<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-2 gap-4 xl:grid-cols-6">
      <div v-for="s in stats" :key="s.label" class="surface-card p-5">
        <div class="flex items-center justify-between">
          <span class="text-sm text-neutral-400">{{ s.label }}</span>
          <i :class="['pi', s.icon, 'text-xl text-neutral-500']" />
        </div>
        <div class="mt-2 text-3xl font-bold">{{ s.value }}</div>
      </div>
    </div>

    <div class="surface-card p-5">
      <h2 class="mb-4 font-semibold">Đăng ký mới 7 ngày qua</h2>
      <div v-if="regs.length" class="flex h-48 items-end gap-3">
        <div v-for="(v, i) in regs" :key="i" class="flex flex-1 flex-col items-center gap-2">
          <span class="text-xs text-neutral-400">{{ v }}</span>
          <div class="w-full rounded-t bg-sky-500/80 transition-all hover:bg-sky-400"
            :style="{ height: barH(v) }" :title="`Ngày -${6 - i}: ${v}`" />
          <span class="text-xs text-neutral-500">{{ dayLabel(i) }}</span>
        </div>
      </div>
      <p v-else class="text-sm text-neutral-500">Chưa có dữ liệu.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Thống kê - VTC ANY CMS' });

const api = useApi();
const stats = ref([
  { label: 'Người dùng', icon: 'pi-users', value: '—' },
  { label: 'Phim', icon: 'pi-video', value: '—' },
  { label: 'Tập phim', icon: 'pi-list', value: '—' },
  { label: 'Kênh', icon: 'pi-tv', value: '—' },
  { label: 'Video', icon: 'pi-play', value: '—' },
  { label: 'Short', icon: 'pi-bolt', value: '—' },
]);
const regs = ref<number[]>([]);

function barH(v: number) {
  const max = Math.max(...regs.value, 1);
  return `${Math.max(6, Math.round((v / max) * 150))}px`;
}
function dayLabel(i: number) {
  const d = new Date();
  d.setDate(d.getDate() - (6 - i));
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

onMounted(async () => {
  try {
    const r = await api.get<any>('/admin/catalog/analytics/summary');
    stats.value[0].value = r.users ?? '—';
    stats.value[1].value = r.movies ?? '—';
    stats.value[2].value = r.episodes ?? '—';
    stats.value[3].value = r.channels ?? '—';
    stats.value[4].value = r.videos ?? '—';
    stats.value[5].value = r.shorts ?? '—';
    regs.value = Array.isArray(r.registrations7d) ? r.registrations7d : [];
  } catch { /* giữ placeholder */ }
});
</script>
