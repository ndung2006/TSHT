<template>
  <section v-if="channels.length" class="mt-8">
    <h2 class="mb-3 text-lg font-bold">{{ title }}</h2>
    <div class="flex gap-3 overflow-x-auto pb-2">
      <NuxtLink
        v-for="c in channels"
        :key="c.public_id"
        :to="`/truyen-hinh?kenh=${c.public_id}`"
        class="flex h-20 w-32 shrink-0 items-center justify-center rounded-xl bg-white p-2 transition hover:ring-2 hover:ring-cyan-400"
        :title="c.name"
      >
        <img v-if="c.logo" :src="c.logo" :alt="c.name" class="max-h-full max-w-full object-contain" loading="lazy" />
        <span v-else class="px-2 text-center text-xs font-semibold text-neutral-700">{{ c.name }}</span>
      </NuxtLink>
    </div>
  </section>
</template>

<script setup lang="ts">
// Dải "Kênh truyền hình" trên trang chủ — giống vtcplay.vn.
defineProps<{ title: string }>();

const config = useRuntimeConfig();

interface Channel {
  public_id: string;
  name: string;
  logo: string | null;
}

const { data } = await useFetch('/channels', {
  baseURL: config.public.apiBase as string,
});

const channels = computed<Channel[]>(() => {
  const groups =
    (data.value as unknown as { groups: Array<{ channels: Channel[] }> } | null)?.groups ?? [];
  return groups.flatMap((g) => g.channels ?? []);
});
</script>
