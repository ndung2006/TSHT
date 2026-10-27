<template>
  <div class="p-5">
    <h1 class="text-xl font-bold">Tìm kiếm: {{ q }}</h1>
    <div v-if="pending" class="mt-4 flex flex-col gap-2">
      <Skeleton width="100%" height="8rem" />
      <Skeleton width="100%" height="8rem" />
    </div>
    <template v-else-if="result">
      <RailCarousel
        v-for="g in result.groups"
        :key="g.type"
        :block="{ order: 0, type: 'HORIZONTAL_LIST', title: g.type, items: g.items }"
      />
      <p v-if="!result.groups.length" class="mt-4 text-sm text-neutral-400">
        Không tìm thấy kết quả. Thử từ khóa khác (hỗ trợ tìm không dấu).
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const config = useRuntimeConfig();
const q = computed(() => String(route.query.s ?? ''));

const { data: result, pending } = await useFetch('/search', {
  baseURL: config.public.apiBase as string,
  query: { s: q },
  watch: [q],
});
</script>
