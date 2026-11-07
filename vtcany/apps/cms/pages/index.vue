<!-- Dashboard CMS GĐ1 (tai lieu duyet 04/11/2026): viet lai hoan toan tu
  trang OTT cu.
  - Bo cuc + tieu de widget lay tu GET /admin/dashboard/layout (backend
    dashboard-layout.config.ts); quyen xem widget kiem tra O SERVER (403
    neu khong co trong layout), giao dien chi an theo layout tra ve.
  - Thanh loc chung: ky (Hom nay/7 ngay/30 ngay/Tuy chon) + loai hinh
    (Tat ca/Bao dien tu/Bao in/TH/PT). Loc chi ap cho tang B/D; tang A
    luon "hien tai". E1 cuoi trang, loc quyen qua visibleMenu() san co.
  - Moi widget tai doc lap (loi hien trong o + nut thu lai); moi so bam
    duoc mo danh sach da loc theo drill; do chi cho canh bao.
  - Bo the dem tong "Nhat ky" (tong in-memory khong co nghia) va 4 the
    OTT cu; D4 thay bang danh sach + loc actor/action.
  - Mobile 1 cot, tang A va D5 len dau (D5 render 2 cho nhung CHUNG 1
    state nen chi goi API 1 lan). -->
<template>
  <div class="flex flex-col gap-6">
    <!-- Thanh loc chung -->
    <div class="surface-card flex flex-wrap items-end gap-4 p-4">
      <div class="flex flex-col gap-1">
        <label class="text-xs text-neutral-400">Kỳ</label>
        <Dropdown v-model="period" :options="periodOptions" optionLabel="label" optionValue="value" class="w-44" />
      </div>
      <template v-if="period === 'custom'">
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400">Từ ngày</label>
          <input v-model="customFrom" type="date" class="rounded border border-neutral-700 bg-transparent px-2 py-2 text-sm" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-xs text-neutral-400">Đến ngày</label>
          <input v-model="customTo" type="date" class="rounded border border-neutral-700 bg-transparent px-2 py-2 text-sm" />
        </div>
      </template>
      <div class="flex flex-col gap-1">
        <label class="text-xs text-neutral-400">Loại hình</label>
        <Dropdown v-model="line" :options="lineOptions" optionLabel="label" optionValue="value" class="w-44" />
      </div>
      <span class="text-xs text-neutral-500">Tầng A luôn hiển thị số liệu hiện tại, không theo kỳ lọc. Số liệu tầng B/D theo kỳ {{ periodLabel }}.</span>
    </div>

    <!-- Tang A -->
    <section v-if="tierA.length" class="flex flex-col gap-4">
      <h2 class="font-semibold">Việc của tôi hôm nay</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DashboardWidgetCard v-for="code in tierA" :key="code" :state="widgets[code]" :id="code === 'A1' ? 'widget-A1' : undefined" @retry="loadWidget(code)" />
      </div>
      <!-- D5 len dau tren mobile (chung state voi o D5 o tang D) -->
      <div v-if="widgets['D5']" class="xl:hidden">
        <DashboardWidgetCard :state="widgets['D5']" @retry="loadWidget('D5')" @filter="onD4Filter" />
      </div>
    </section>

    <!-- Tang B -->
    <section v-if="tierB.length" class="flex flex-col gap-4">
      <h2 class="font-semibold">Tình hình tòa soạn trong kỳ</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardWidgetCard v-for="code in tierB" :key="code" :state="widgets[code]" @retry="loadWidget(code)" />
      </div>
    </section>

    <!-- Tang D (D5 an tren mobile vi da hien sau tang A) -->
    <section v-if="tierD.length" class="flex flex-col gap-4">
      <h2 class="font-semibold">Hệ thống &amp; cảnh báo vận hành</h2>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <DashboardWidgetCard v-for="code in tierD" :key="code" :state="widgets[code]"
          :class="code === 'D5' ? 'hidden xl:block' : ''" @retry="loadWidget(code)" @filter="onD4Filter" />
      </div>
    </section>

    <!-- E1: truy cap nhanh, loc quyen qua visibleMenu() -->
    <section v-if="e1Groups.length" class="flex flex-col gap-4">
      <h2 class="font-semibold">Truy cập nhanh</h2>
      <div v-for="g in e1Groups" :key="g.id" class="surface-card p-5">
        <h3 class="mb-3 font-semibold">{{ g.label }}</h3>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          <NuxtLink v-for="item in g.items" :key="item.to" :to="item.to"
            class="flex items-center gap-3 rounded-lg border border-neutral-800 p-3 hover:bg-white/5">
            <i :class="['pi', item.icon, 'text-lg text-sky-400']" />
            <span class="truncate text-sm" :title="item.label">{{ item.label }}</span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <div v-if="layoutError" class="surface-card p-5">
      <p class="text-sm text-red-400">{{ layoutError }}</p>
      <Button label="Thử lại" size="small" severity="secondary" class="mt-2" @click="init" />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Dashboard - VTC ANY CMS' });

import { visibleMenu } from '~/utils/workspaces';
import { addDaysStr } from '~/utils/vn-date';

const api = useApi();
const { permissions } = useCmsAuth();

const periodOptions = [
  { label: 'Hôm nay', value: 'today' },
  { label: '7 ngày', value: '7d' },
  { label: '30 ngày', value: '30d' },
  { label: 'Tùy chọn', value: 'custom' },
];
const lineOptions = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Báo điện tử', value: 'online' },
  { label: 'Báo in', value: 'print' },
  { label: 'Truyền hình', value: 'tv' },
  { label: 'Phát thanh', value: 'radio' },
];

const period = ref('7d');
const line = ref('all');
const customFrom = ref('');
const customTo = ref('');

// Ngay VN (Asia/Ho_Chi_Minh) dang YYYY-MM-DD, khong phu thuoc mui gio
// trinh duyet (nguoi dung co the o mui gio khac khi di cong tac).
const vnFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' });
function vnDateStr(d: Date) { return vnFmt.format(d); }

const range = computed(() => {
  // Hop dong `to` CMS<->backend (chuan ngay VN §12): `to` = ngay cuoi,
  // BAO HAM. Backend rangeOf da coi `to` la bao ham (vnDayRange(q.to).to
  // = het ngay q.to) nen CMS gui dung ngay cuoi, KHONG cong them 1 ngay
  // nhu truoc (gui ngay mai / customTo+1 lam ky dai hon 1 ngay).
  // Cong/tru ngay bang addDaysStr (so hoc lich UTC tren chuoi YYYY-MM-DD,
  // khong dung getDate/setDate local cua trinh duyet).
  const today = vnDateStr(new Date());
  if (period.value === 'today') return { from: today, to: today };
  if (period.value === '30d') return { from: addDaysStr(today, -29), to: today };
  if (period.value === 'custom' && customFrom.value && customTo.value) {
    const from = customFrom.value <= customTo.value ? customFrom.value : customTo.value;
    const to = customFrom.value <= customTo.value ? customTo.value : customFrom.value;
    return { from, to };
  }
  return { from: addDaysStr(today, -6), to: today };
});
const periodLabel = computed(() => {
  if (period.value === 'today') return 'Hôm nay';
  if (period.value === '30d') return '30 ngày qua';
  if (period.value === 'custom' && customFrom.value && customTo.value) {
    const fmt = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
    return `${fmt(range.value.from)} – ${fmt(customFrom.value <= customTo.value ? customTo.value : customFrom.value)}`;
  }
  return '7 ngày qua';
});

const layoutCodes = ref<string[]>([]);
const meta = ref<Record<string, { title: string; tier: string }>>({});
const widgets = ref<Record<string, any>>({});
const layoutError = ref('');

const tierA = computed(() => layoutCodes.value.filter((c) => meta.value[c]?.tier === 'A'));
const tierB = computed(() => layoutCodes.value.filter((c) => meta.value[c]?.tier === 'B'));
const tierD = computed(() => layoutCodes.value.filter((c) => meta.value[c]?.tier === 'D'));
const e1Groups = computed(() => visibleMenu(permissions.value || []));

function widgetParams(code: string, extra: Record<string, any> = {}) {
  // Tang A luon hien tai (khong nhan from/to/line); tang B/D nhan loc.
  if (meta.value[code]?.tier === 'A') return { ...extra };
  return { from: range.value.from, to: range.value.to, line: line.value, ...extra };
}

async function loadWidget(code: string, extra: Record<string, any> = {}) {
  const w = widgets.value[code];
  if (!w) return;
  w.loading = true;
  w.error = '';
  try {
    const r = await api.get<any>(`/admin/dashboard/widgets/${code}`, widgetParams(code, extra));
    w.data = r.data ?? null;
    w.empty = r.empty ?? null;
    w.drill = r.drill ?? null;
    w.generatedAt = r.generatedAt || null;
    w.periodLabel = meta.value[code]?.tier === 'A' ? 'Hiện tại' : periodLabel.value;
  } catch (e: any) {
    w.error = e?.data?.message || e?.message || 'Không tải được widget';
    w.data = null;
  } finally {
    w.loading = false;
  }
}

async function loadNonAWidgets() {
  await Promise.all(layoutCodes.value.filter((c) => meta.value[c]?.tier !== 'A').map((c) => loadWidget(c)));
}

function onD4Filter(f: { actor: string; action: string }) {
  loadWidget('D4', { actor: f.actor, action: f.action });
}

async function init() {
  layoutError.value = '';
  try {
    const r = await api.get<any>('/admin/dashboard/layout');
    layoutCodes.value = r.layout || [];
    meta.value = r.meta || {};
    for (const code of layoutCodes.value) {
      widgets.value[code] = {
        code, title: meta.value[code]?.title || code, tier: meta.value[code]?.tier || '',
        loading: true, error: '', data: null, empty: null, drill: null, generatedAt: null, periodLabel: '',
      };
    }
    // Moi widget tai doc lap: 1 widget loi khong chan widget khac.
    await Promise.all(layoutCodes.value.map((c) => loadWidget(c)));
  } catch (e: any) {
    layoutError.value = e?.data?.message || e?.message || 'Không tải được bố cục dashboard';
  }
}

// Doi ky/loai hinh chi tai lai tang B/D (tang A luon hien tai, giu nguyen).
watch([period, line, customFrom, customTo], () => {
  if (layoutCodes.value.length) loadNonAWidgets();
});

onMounted(async () => {
  await init();
  scrollToFocusWidget();
});
// Sidebar dot 2 phuong an (a): bam "Cho toi duyet" -> /?focus=A1, cuon
// toi card A1. A1 co trong moi layout ke ca fallback nen ai cung toi
// duoc; khong lam trang gop that o dot nay. Param focus giu nguyen
// tren URL de muc ghim giu trang thai sang.
const route = useRoute();
function scrollToFocusWidget() {
  if (route.query.focus !== 'A1') return;
  const go = () => document.getElementById('widget-A1')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  nextTick(() => {
    if (!document.getElementById('widget-A1')) setTimeout(go, 500);
    else go();
  });
}
watch(() => route.query.focus, scrollToFocusWidget);
</script>
