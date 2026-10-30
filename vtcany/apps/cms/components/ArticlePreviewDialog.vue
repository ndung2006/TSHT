<template>
  <!-- Preview bai viet dang modal: hien bai nhu khi xuat ban (dang modal
       preview noi dung, khong copy layout cua CMS tham chieu). Thu tu
       dung trang bai cong khai: dong chuyen muc -> tieu de -> sapo ->
       anh cover (chi khi cover khong nam trong body) -> body. -->
  <Dialog v-model:visible="localVisible" modal :header="title ? `Preview — ${title}` : 'Preview bài viết'"
    class="w-[96vw] max-w-[96vw]">
    <div class="flex flex-col gap-3 max-h-[75dvh] overflow-y-auto pr-1">
      <p class="text-sm text-neutral-400">{{ categoryName || '—' }}</p>
      <h1 class="text-2xl font-bold leading-snug">{{ title }}</h1>
      <p v-if="sapo" class="text-sm text-neutral-300 leading-relaxed font-semibold">{{ sapo }}</p>
      <img v-if="coverPath && !coverInBody" :src="resolveMedia(coverPath)" :alt="title" class="w-full max-h-96 object-cover rounded-lg" />
      <div v-if="body" class="text-sm leading-relaxed" v-html="body" />
      <p v-else class="text-sm text-neutral-400">Chưa có nội dung.</p>
    </div>
    <template #footer>
      <Button label="Đóng" text @click="localVisible = false" />
    </template>
  </Dialog>
</template>

<script setup lang="ts">
const props = defineProps<{
  visible: boolean;
  title: string;
  sapo?: string;
  coverPath?: string | null;
  body?: string;
  categoryName?: string;
}>();
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>();
const localVisible = computed({
  get: () => props.visible,
  set: (v: boolean) => emit('update:visible', v),
});
// URL media dang tuong doi (/images/...) thuoc ve backend: hien thi phai
// ghep voi origin cua apiBase (giong cac trang CMS khac), neu khong
// trinh duyet hieu thanh cms origin -> 404.
function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}
function pathnameOf(u: string): string {
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    return new URL(u, base).pathname;
  } catch { return u; }
}
// Luat hero cua trang bai cong khai: anh bia chi hien khi file bia
// khong xuat hien trong body (so khop pathname cua cover voi cac <img>
// trong body, chap ca URL tuong doi va tuyet doi). Moi truong khong co
// DOMParser (SSR) thi mac dinh hien bia.
const coverInBody = computed(() => {
  const cover = props.coverPath;
  const html = props.body;
  if (!cover || !html) return false;
  if (typeof DOMParser === 'undefined') return false;
  const coverPath = pathnameOf(cover);
  if (!coverPath) return false;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let found = false;
    doc.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src && pathnameOf(src) === coverPath) found = true;
    });
    return found;
  } catch { return false; }
});
</script>
