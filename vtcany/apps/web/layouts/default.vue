<template>
  <div class="min-h-screen bg-neutral-950 text-neutral-100">
    <aside class="fixed left-0 top-0 flex h-screen w-60 flex-col border-r border-neutral-800 bg-neutral-900">
      <NuxtLink to="/" class="flex items-center px-5 py-4" @click="onLogoClick">
        <img src="/icons/vtc-any/logo-vtc-any-transparent.svg" alt="VTC ANY" width="156" height="66" />
      </NuxtLink>

      <nav class="flex flex-col gap-1 px-3 text-sm">
        <NuxtLink
          v-for="item in menu"
          :key="item.to"
          :to="item.to"
          class="rounded-lg px-3 py-2 hover:bg-neutral-800"
          active-class="bg-neutral-800 font-semibold"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <form class="flex gap-2 px-3 pt-4" @submit.prevent="goSearch">
        <InputText v-model="q" placeholder="Tìm kiếm" class="w-full !bg-neutral-800" />
        <Button type="submit" icon="pi pi-search" aria-label="Tìm kiếm" />
      </form>

      <div class="mx-3 mt-4 rounded-lg border border-neutral-700 p-3 text-center text-xs text-neutral-300">
        <i class="pi pi-qrcode !text-4xl text-neutral-400" />
        <p class="mt-2">Quét mã QR để tải ứng dụng</p>
      </div>

      <div class="mt-auto px-5 pb-4 text-[11px] leading-5 text-neutral-400">
        <p class="font-semibold text-neutral-300">CÔNG TY VTC DỊCH VỤ TRUYỀN HÌNH SỐ</p>
        <p>65 Lạc Trung, phường Vĩnh Tuy, Hà Nội</p>
        <p>Email: vtc.digital@vtc.vn</p>
        <p class="mt-1 text-neutral-500">GCN ĐKKD: 0100110006-026 do Sở KH&ĐT TP Hà Nội cấp</p>
      </div>
    </aside>

    <main class="ml-60 min-h-screen">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
const q = ref('');
const route = useRoute();

const menu = [
  { label: 'Trang chủ', to: '/' },
  { label: 'Phim', to: '/phim' },
  { label: 'Short', to: '/short' },
  { label: 'Video', to: '/video' },
  { label: 'Giải trí', to: '/giai-tri' },
  { label: 'Truyền hình', to: '/truyen-hinh' },
];

function goSearch() {
  navigateTo(`/tim-kiem?s=${encodeURIComponent(q.value.trim())}`);
}

// Bam logo: ve trang chu; neu dang o san trang chu thi cuon len dau trang.
function onLogoClick() {
  if (route.path === '/') window.scrollTo({ top: 0, behavior: 'smooth' });
}
</script>
