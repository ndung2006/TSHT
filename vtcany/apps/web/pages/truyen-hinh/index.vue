<template>
  <div class="flex flex-col gap-5 p-5 lg:flex-row">
    <!-- Cột chính: player + tab nhóm kênh + lưới kênh -->
    <div class="min-w-0 flex-1">
      <div class="overflow-hidden rounded-xl bg-black">
        <div v-if="current && (replaySrc || epg?.channel.hls_url)" class="aspect-video">
          <VideoPlayer :key="current.public_id + '-' + playerKey + (replaySrc ? '-replay' : '')" :src="replaySrc || epg?.channel.hls_url" autoplay :background="radioBg" />
        </div>
        <div v-else class="flex aspect-video flex-col items-center justify-center gap-3 bg-black">
          <span class="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800">
            <i v-if="epgLoading" class="pi pi-spin pi-spinner text-2xl text-neutral-400" />
            <i v-else class="pi pi-play text-2xl text-neutral-500" />
          </span>
          <p v-if="epgLoading" class="text-sm text-neutral-400">Đang tải luồng phát...</p>
          <p v-else-if="current" class="text-sm text-neutral-400">Kênh chưa có luồng phát.</p>
          <p v-else class="text-sm text-neutral-500">Chọn một kênh bên dưới để xem</p>
        </div>
      </div>
      <h2 v-if="current" class="mt-3 flex items-center gap-2 text-lg font-bold">
        {{ current.name }}
        <span v-if="replaySrc" class="flex items-center gap-2 rounded bg-neutral-800 px-2 py-0.5 text-xs font-medium text-neutral-300">
          Đang xem lại: {{ replayTitle }}
          <button class="rounded bg-red-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-red-500"
            @click="stopReplay()">
            Về live
          </button>
        </span>
      </h2>

      <!-- Tab nhóm kênh -->
      <div class="mt-4 flex gap-1 overflow-x-auto">
        <button
          v-for="g in groups"
          :key="g.name"
          class="whitespace-nowrap px-3 py-2 text-sm font-bold uppercase"
          :class="g.name === activeGroup ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'"
          @click="activeGroup = g.name"
        >
          {{ g.name }}
        </button>
      </div>

      <!-- Lưới card kênh nền trắng -->
      <div v-if="pending" class="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        <Skeleton v-for="i in 10" :key="i" height="5rem" class="!rounded-xl" />
      </div>
      <div v-else class="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        <button
          v-for="c in activeChannels"
          :key="c.public_id"
          class="flex h-20 items-center justify-center rounded-xl bg-white p-2 transition hover:ring-2 hover:ring-cyan-400"
          :class="current?.public_id === c.public_id ? 'ring-2 ring-cyan-400' : ''"
          @click="pick(c)"
        >
          <img v-if="c.logo" :src="c.logo" :alt="c.name" class="max-h-full max-w-full object-contain" />
          <span v-else class="px-1 text-center text-sm font-bold text-neutral-800">{{ c.name }}</span>
        </button>
      </div>
      <p v-if="!pending && !activeChannels.length" class="mt-2 text-sm text-neutral-400">Đang cập nhật kênh.</p>
    </div>

    <!-- Cột phải: date picker + lịch phát sóng -->
    <aside class="w-full shrink-0 rounded-xl bg-neutral-900 p-4 lg:w-[30%]">
      <Carousel :value="dates" :num-visible="3" :num-scroll="3" :show-indicators="false">
        <template #item="{ data }">
          <button
            class="mx-1 w-full rounded-lg bg-neutral-800 px-2 py-2 text-sm text-white hover:bg-neutral-700"
            :class="data.iso === activeDate ? '!bg-neutral-700 font-semibold text-cyan-300 ring-1 ring-cyan-400' : ''"
            @click="activeDate = data.iso"
          >
            {{ data.label }}
          </button>
        </template>
      </Carousel>

      <h3 class="mb-2 mt-4 flex items-center gap-2 text-sm font-bold uppercase text-neutral-300">
        Lịch phát sóng
        <span
          v-if="epg?.epg_source === 'aio-stale'"
          class="rounded bg-amber-600/20 px-1.5 py-0.5 text-[10px] font-semibold normal-case text-amber-400"
          title="Lịch AIO đang chập chờn, đây là bản tốt nhất đã lưu trong ngày"
        >
          Lịch cũ
        </span>
      </h3>
      <ul
        v-if="(epg?.timeline ?? []).length"
        ref="epgListEl"
        class="flex max-h-[60vh] flex-col gap-1 overflow-y-auto"
      >
        <li
          v-for="it in epg?.timeline ?? []"
          :key="it.time + it.title"
          class="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-neutral-800"
          :class="[
            it.status === 'LIVE' && !isReplaying(it) ? 'bg-neutral-800/80' : '',
            isReplaying(it) ? 'bg-amber-600/20 ring-1 ring-amber-500/60' : '',
          ]"
        >
          <span class="w-12 shrink-0 text-neutral-400">{{ it.time }}</span>
          <span class="min-w-0 flex-1 truncate">{{ it.title }}</span>
          <span
            v-if="it.status === 'LIVE'"
            class="flex shrink-0 items-center gap-1 rounded bg-red-600 px-2 py-0.5 text-xs font-semibold"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
          </span>
          <span
            v-if="isReplaying(it)"
            class="shrink-0 rounded bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white"
          >
            Đang xem
          </span>
          <button
            v-else-if="it.replay_url"
            class="shrink-0 rounded bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600"
            @click="playReplay(it)"
          >
            Xem lại
          </button>
        </li>
      </ul>
      <p v-else class="py-8 text-center text-sm text-neutral-500">
        {{ current ? 'Chưa có lịch ngày này.' : 'Chọn một kênh để xem lịch phát sóng.' }}
      </p>
    </aside>

    <Dialog v-model:visible="showLogin" modal header="Thông báo" :style="{ width: '22rem' }">
      <p class="text-sm">Vui lòng đăng nhập để xem nội dung!</p>
      <template #footer>
        <Button label="Hủy" severity="secondary" @click="showLogin = false" />
        <Button label="Đăng nhập" @click="navigateTo('/dang-nhap')" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
useHead({ title: 'Truyền hình - VTC ANY' });

const config = useRuntimeConfig();
const route = useRoute();
const router = useRouter();
const { loggedIn, token } = useAuth();

interface Channel {
  public_id: string;
  name: string;
  logo: string | null;
  audio_only: boolean;
  banner_url: string | null;
}

const { data: groupsData, pending } = await useFetch('/channels', {
  baseURL: config.public.apiBase as string,
});
const groups = computed(() =>
  (
    (groupsData.value as unknown as { groups: Array<{ name: string; channels: Channel[] }> } | null)?.groups ?? []
  ).filter((g) => g.channels.length > 0),
);

const activeGroup = ref<string | undefined>(undefined);
watch(
  groups,
  (g) => {
    if (!activeGroup.value && g.length) activeGroup.value = g[0].name;
  },
  { immediate: true },
);
const activeChannels = computed(() => groups.value.find((g) => g.name === activeGroup.value)?.channels ?? []);

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const todayIso = isoOf(new Date());
const dates = computed(() => {
  const out: Array<{ iso: string; label: string }> = [];
  for (let delta = -3; delta <= 3; delta++) {
    const d = new Date();
    d.setDate(d.getDate() + delta);
    const iso = isoOf(d);
    out.push({
      iso,
      label: iso === todayIso ? 'Hôm nay' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return out;
});
const activeDate = ref(todayIso);

const current = ref<Channel | null>(null);
// Background co dinh cho kenh radio: chi khi kenh audio-only va admin da up
// anh banner trong CMS > Truyen hinh > Kenh ("Anh banner player 16:9").
const radioBg = computed(() =>
  current.value?.audio_only && current.value?.banner_url ? current.value.banner_url : undefined,
);
const epg = ref<{
  channel: { hls_url: string | null; hls_exp?: number | null };
  epg_source?: string;
  timeline: Array<{ time: string; title: string; status: string; replay_url?: string | null }>;
} | null>(null);
// Khi xem lai (VOD timeshift), player phat URL nay thay vi live.
const replaySrc = ref<string | null>(null);
const replayTitle = ref<string | null>(null);
const showLogin = ref(false);
// true trong luc cho API epg tra ve — de khong hien nham "Kenh chua co luong phat".
const epgLoading = ref(false);
const epgListEl = ref<HTMLElement | null>(null);
// Cuon panel lich de hien: 3 chuong trinh da phat -> LIVE -> cac chuong trinh sap phat.
function scrollEpgToLive() {
  const ul = epgListEl.value;
  if (!ul) return;
  const tl = epg.value?.timeline ?? [];
  const liveIdx = tl.findIndex((t) => t.status === 'LIVE');
  if (liveIdx < 0) return;
  const items = ul.querySelectorAll('li');
  const target = items[Math.max(0, liveIdx - 3)] as HTMLElement | undefined;
  if (!target) return;
  const ulRect = ul.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  ul.scrollTop += tRect.top - ulRect.top;
}
// Tang moi khi link xoay duoc cap moi de VideoPlayer remount voi src moi.
const playerKey = ref(0);
// Link xoay chi co hieu luc 4h — tu xin lai truoc 10 phut de xem lien tuc khong dut.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
function clearRefresh() {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}
async function fetchEpg(c: Channel) {
  return await $fetch(`/channels/${c.public_id}/epg`, {
    baseURL: config.public.apiBase as string,
    query: { date: activeDate.value },
    ...(token.value ? { headers: { Authorization: `Bearer ${token.value}` } } : {}),
  }) as typeof epg.value;
}
function scheduleRefresh() {
  clearRefresh();
  const exp = epg.value?.channel?.hls_exp;
  const url = epg.value?.channel?.hls_url;
  if (!exp || !url) return;
  const wait = exp - Date.now() - 10 * 60_000;
  if (wait <= 0) return;
  refreshTimer = setTimeout(async () => {
    const c = current.value;
    if (!c) return;
    try {
      const fresh = await fetchEpg(c);
      // Chi remount player khi van dang xem dung kenh va co link moi.
      if (current.value?.public_id === c.public_id && fresh?.channel?.hls_url) {
        if (fresh.channel.hls_url !== epg.value?.channel?.hls_url) {
          epg.value = fresh;
          playerKey.value++;
        }
        scheduleRefresh();
      }
    } catch {
      // Xin lai that bai: giu player cu phat den het han, khong lam gian doan.
    }
  }, Math.min(wait, 2_147_483_647));
}

async function pick(c: Channel) {
  const needLogin = config.public.requireLoginTv as boolean;
  if (needLogin && !loggedIn.value) {
    showLogin.value = true;
    return;
  }
  clearRefresh();
  current.value = c;
  replaySrc.value = null;
  replayTitle.value = null;
  replayItemUrl.value = null;
  // Dong bo URL de share/reload giu dung kenh dang xem.
  router.replace({ query: { kenh: c.public_id } });
  epg.value = null;
  epgLoading.value = true;
  try {
    epg.value = await fetchEpg(c);
  } finally {
    epgLoading.value = false;
  }
  scheduleRefresh();
  await nextTick();
  scrollEpgToLive();
}

// Xem lai chuong trinh da phat (VOD timeshift): dung refresh live, phat playlist replay.
const replayItemUrl = ref<string | null>(null);
function isReplaying(it: { replay_url?: string | null }) {
  return !!replayItemUrl.value && !!it.replay_url && it.replay_url === replayItemUrl.value;
}
function playReplay(it: { title: string; replay_url?: string | null }) {
  if (!it.replay_url || !current.value) return;
  clearRefresh();
  replayTitle.value = it.title;
  replayItemUrl.value = it.replay_url;
  replaySrc.value = `${config.public.apiBase as string}${it.replay_url}`;
  playerKey.value++;
}
// Thoat che do xem lai, quay ve truc tiep.
function stopReplay() {
  replaySrc.value = null;
  replayTitle.value = null;
  replayItemUrl.value = null;
  playerKey.value++;
  if (current.value) pick(current.value);
}

watch(activeDate, () => {
  if (current.value) pick(current.value);
});
// Deep-link tu trang chu: /truyen-hinh?kenh=<public_id> -> tu dong chon + phat ngay.
// Theo doi ca query (paste URL khi trang da mo / DOI query tu ChannelStrip khi da co current)
// lan lan groups (lan dau tai xong).
watch(
  [groups, () => route.query.kenh],
  ([g, q]) => {
    if (typeof q !== 'string' || !q) return;
    if (current.value?.public_id === q) return;
    const hit = g.flatMap((gr) => gr.channels).find((ch) => ch.public_id === q);
    if (hit) void pick(hit);
  },
  { immediate: true },
);
onUnmounted(() => clearRefresh());
</script>
