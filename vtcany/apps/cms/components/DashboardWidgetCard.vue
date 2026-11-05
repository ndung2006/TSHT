<!-- The widget dashboard GĐ1: 1 o = 1 widget, tai doc lap, loi chi hien
  trong o + nut thu lai (khong chan widget khac). Nhan state tu
  pages/index.vue; du lieu + drill lay tu API /admin/dashboard/widgets.
  Do chi cho canh bao (trang thai error / sap het han / tre han); so 0
  that hien 0, khong co nguon hien empty.reason (khong phai 0). -->
<template>
  <div :id="id" class="surface-card flex flex-col p-5">
    <div class="mb-1 flex items-start justify-between gap-2">
      <h3 class="truncate font-semibold" :title="state.title">{{ state.title }}</h3>
      <span class="shrink-0 text-xs text-neutral-500">Tầng {{ state.tier }}</span>
    </div>
    <div class="mb-3 text-xs text-neutral-500">
      <span v-if="state.generatedAt">Cập nhật lúc {{ fmtTime(state.generatedAt) }}</span>
      <span v-if="state.periodLabel"> · {{ state.periodLabel }}</span>
    </div>

    <div v-if="state.loading" class="text-sm text-neutral-400">Đang tải…</div>
    <div v-else-if="state.error" class="flex flex-col gap-2">
      <p class="text-sm text-red-400">{{ state.error }}</p>
      <Button label="Thử lại" size="small" severity="secondary" class="self-start" @click="$emit('retry')" />
    </div>
    <div v-else-if="state.empty" class="text-sm text-neutral-400">{{ state.empty.reason }}</div>
    <div v-else-if="state.data" class="flex flex-col gap-3 text-sm">
      <!-- A1: hang cho cua toi -->
      <template v-if="state.code === 'A1'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.total) }}</div>
        <div v-for="m in state.data.byModule" :key="m.module" class="flex flex-col gap-1">
          <div class="font-medium">{{ m.label }}: {{ fmtNum(m.total) }}</div>
          <div class="flex flex-wrap gap-2">
            <NuxtLink v-for="s in m.steps" :key="s.step" :to="drillTo(s.drill)"
              class="rounded bg-white/5 px-2 py-1 text-xs hover:bg-white/10" :title="s.roleName || ''">
              {{ s.label }}: {{ fmtNum(s.count) }}
            </NuxtLink>
          </div>
        </div>
        <div v-if="state.data.items?.length" class="border-t border-neutral-800 pt-2">
          <div class="mb-1 text-xs text-neutral-500">Chờ lâu nhất</div>
          <NuxtLink v-for="it in state.data.items" :key="it.module + it.id" :to="drillTo(it.drill)"
            class="block truncate py-0.5 hover:underline" :title="it.title">
            {{ it.moduleLabel }} · {{ it.title }} ({{ it.stepLabel }}<span v-if="it.waitHours != null">, {{ it.waitHours }} giờ</span>)
          </NuxtLink>
        </div>
      </template>

      <!-- A2: bai cua toi dang bi tra -->
      <template v-else-if="state.code === 'A2'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.total) }}</div>
        <NuxtLink v-for="it in state.data.items" :key="it.module + it.id" :to="drillTo(it.drill)"
          class="block truncate py-0.5 hover:underline" :title="`${it.title} — trả bởi ${it.returnedBy}${it.reason ? ': ' + it.reason : ''}`">
          {{ it.moduleLabel }} · {{ it.title }} — trả bởi {{ it.returnedBy }} ({{ fmtDate(it.returnedAt) }})
        </NuxtLink>
      </template>

      <!-- A3: nhap chua tung gui -->
      <template v-else-if="state.code === 'A3'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.total) }}</div>
        <div v-if="state.data.items?.some((i: any) => i.over7d)" class="text-red-400">
          {{ state.data.items.filter((i: any) => i.over7d).length }} nháp quá 7 ngày chưa gửi
        </div>
        <NuxtLink v-for="it in state.data.items" :key="it.module + it.id" :to="drillTo(it.drill)"
          class="block truncate py-0.5 hover:underline" :title="it.title">
          {{ it.moduleLabel }} · {{ it.title }}<span v-if="it.over7d" class="text-red-400"> (quá 7 ngày)</span>
        </NuxtLink>
      </template>

      <!-- A4: sap xuat ban trong 24h toi -->
      <template v-else-if="state.code === 'A4'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.total) }}</div>
        <NuxtLink v-for="it in state.data.items" :key="it.module + it.id" :to="drillTo(it.drill)"
          class="block truncate py-0.5 hover:underline" :title="it.title">
          {{ it.moduleLabel }} · {{ it.title }} — {{ fmtDateTime(it.publishAt) }}
        </NuxtLink>
      </template>

      <!-- B1: pheu bao dien tu -->
      <template v-else-if="state.code === 'B1'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.inProcess) }} <span class="text-base font-normal text-neutral-400">đang trong quy trình</span></div>
        <div class="flex flex-col gap-1">
          <div v-for="s in state.data.steps" :key="s.step" class="flex justify-between gap-2">
            <NuxtLink :to="drillTo(s.drill)" class="truncate hover:underline" :title="s.label">{{ s.label }}</NuxtLink>
            <span class="shrink-0 font-medium">{{ fmtNum(s.count) }}</span>
          </div>
          <div class="flex justify-between gap-2">
            <NuxtLink :to="drillTo(state.data.returned.drill)" class="truncate hover:underline">Bị trả về, đang sửa</NuxtLink>
            <span class="shrink-0 font-medium">{{ fmtNum(state.data.returned.count) }}</span>
          </div>
          <div class="flex justify-between gap-2 border-t border-neutral-800 pt-1">
            <span>Đã xuất bản trong kỳ</span>
            <NuxtLink :to="drillTo(state.data.publishedDrill)" class="shrink-0 font-medium hover:underline">{{ fmtNum(state.data.publishedInPeriod) }}</NuxtLink>
          </div>
          <div class="flex justify-between gap-2">
            <span>Đã hạ xuất bản trong kỳ</span>
            <NuxtLink :to="drillTo(state.data.unpublishedDrill)" class="shrink-0 font-medium hover:underline">{{ fmtNum(state.data.unpublishedInPeriod) }}</NuxtLink>
          </div>
        </div>
      </template>

      <!-- B2: bao in ky toi -->
      <template v-else-if="state.code === 'B2'">
        <div class="text-xs text-neutral-500">{{ state.data.note }}</div>
        <div class="text-3xl font-bold">{{ fmtNum(state.data.issues?.length || 0) }} <span class="text-base font-normal text-neutral-400">số báo</span></div>
        <NuxtLink v-for="iss in state.data.issues" :key="iss.id" :to="drillTo(iss.drill)"
          class="block truncate py-0.5 hover:underline" :title="iss.title">
          {{ iss.issueType === 'vung_cao' ? 'Vùng cao' : 'Thường' }} {{ iss.issueNumber }} · {{ iss.publishDate }} · {{ iss.pageCount }} trang · {{ iss.stepLabel }}
        </NuxtLink>
        <div class="flex flex-wrap gap-4 border-t border-neutral-800 pt-2">
          <span>Bài báo in chờ dàn: {{ fmtNum(state.data.pendingPrintArticles) }}</span>
          <NuxtLink :to="drillTo(state.data.printDrill)" class="hover:underline">Xem chờ dàn</NuxtLink>
          <span>Đã duyệt chờ dàn: {{ fmtNum(state.data.approvedPrintArticles) }}</span>
          <NuxtLink :to="drillTo(state.data.printApprovedDrill)" class="hover:underline">Xem đã duyệt</NuxtLink>
        </div>
      </template>

      <!-- B3: EPG hom nay + ngay mai -->
      <template v-else-if="state.code === 'B3'">
        <div v-for="ch in state.data.channels" :key="ch.publicId" class="flex flex-col gap-1 border-b border-neutral-800 pb-2 last:border-0">
          <div class="flex items-center justify-between gap-2">
            <NuxtLink :to="drillTo(ch.drill)" class="truncate font-medium hover:underline">{{ ch.name }}</NuxtLink>
            <span class="shrink-0 text-xs text-neutral-500">{{ ch.audioOnly ? 'Phát thanh' : 'Truyền hình' }}</span>
          </div>
          <div class="flex flex-wrap gap-4 text-xs">
            <span>Hôm nay: <NuxtLink :to="drillTo(ch.drillToday)" class="hover:underline"><b :class="ch.today.alert && ch.today.state === 'empty' ? 'font-medium text-red-400' : ch.today.state === 'empty' ? 'font-normal text-neutral-400' : ''">{{ ch.today.state === 'ok' || ch.today.state === 'stale' ? fmtNum(ch.today.programs) : ch.today.state === 'no-source' ? '—' : ch.today.state === 'empty' ? 'Chưa có lịch' : 'Lỗi' }}</b></NuxtLink>
              <span v-if="ch.today.state === 'stale'" class="text-neutral-500"> (bản cũ, cập nhật lúc {{ fmtTime(ch.today.updatedAt) }})</span>
              <span v-if="ch.today.state === 'no-source'" class="text-neutral-500"> ({{ ch.today.reason }})</span>
              <span v-if="ch.today.state === 'error'" class="text-red-400"> ({{ ch.today.reason }})</span>
              <span v-if="ch.today.alert && ch.today.state === 'empty'" class="text-red-400"> (quá 07:30 vẫn chưa có lịch)</span>
            </span>
            <span>Ngày mai: <NuxtLink :to="drillTo(ch.drillTomorrow)" class="hover:underline"><b :class="ch.tomorrow.state === 'empty' ? 'font-normal text-neutral-400' : ''">{{ ch.tomorrow.state === 'ok' || ch.tomorrow.state === 'stale' ? fmtNum(ch.tomorrow.programs) : ch.tomorrow.state === 'no-source' ? '—' : ch.tomorrow.state === 'empty' ? 'Chưa có lịch' : 'Lỗi' }}</b></NuxtLink>
              <span v-if="ch.tomorrow.state === 'stale'" class="text-neutral-500"> (bản cũ)</span>
              <span v-if="ch.tomorrow.state === 'no-source'" class="text-neutral-500"> ({{ ch.tomorrow.reason }})</span>
              <span v-if="ch.tomorrow.state === 'error'" class="text-red-400"> ({{ ch.tomorrow.reason }})</span>
            </span>
          </div>
        </div>
      </template>

      <!-- B4: san luong theo ngay -->
      <template v-else-if="state.code === 'B4'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.total) }}</div>
        <div v-for="d in state.data.days" :key="d.date" class="flex items-center gap-2">
          <NuxtLink :to="drillTo(d.drill)" class="w-24 shrink-0 hover:underline">{{ d.label }}</NuxtLink>
          <div class="h-3 flex-1 overflow-hidden rounded bg-white/10">
            <div class="h-full bg-sky-500" :style="{ width: barPct(d.count, state.data.days) + '%' }" />
          </div>
          <span class="w-10 shrink-0 text-right font-medium">{{ fmtNum(d.count) }}</span>
        </div>
      </template>

      <!-- B5: theo chuyen muc -->
      <template v-else-if="state.code === 'B5'">
        <div class="flex flex-wrap gap-4">
          <span>Đã xuất bản: <b>{{ fmtNum(state.data.totalPublished) }}</b></span>
          <span>Đang trong quy trình: <b>{{ fmtNum(state.data.totalInProcess) }}</b></span>
        </div>
        <div v-for="c in state.data.categories" :key="c.categoryId || 'none'" class="flex items-center justify-between gap-2">
          <span class="truncate" :title="c.name">{{ c.name }}<span v-if="c.parentName" class="text-neutral-500"> ({{ c.parentName }})</span></span>
          <span class="shrink-0">
            <NuxtLink :to="drillTo(c.drillPublished)" class="hover:underline">{{ fmtNum(c.published) }}</NuxtLink>
            /
            <NuxtLink :to="drillTo(c.drillPending)" class="hover:underline">{{ fmtNum(c.inProcess) }}</NuxtLink>
          </span>
        </div>
      </template>

      <!-- B6: viec treo + thoi gian cho trung vi -->
      <template v-else-if="state.code === 'B6'">
        <div class="text-3xl font-bold">{{ fmtNum(state.data.total) }} <span class="text-base font-normal text-neutral-400">việc quá hạn</span></div>
        <NuxtLink v-for="it in state.data.items" :key="it.module + it.id" :to="drillTo(it.drill)"
          class="block truncate py-0.5 text-red-400 hover:underline" :title="it.title">
          {{ it.moduleLabel }} · {{ it.title }} — {{ it.stepLabel }}, chờ {{ it.waitHours }} giờ (ngưỡng {{ it.thresholdHours }} giờ)
        </NuxtLink>
        <div v-if="state.data.medians?.length" class="border-t border-neutral-800 pt-2">
          <div class="mb-1 text-xs text-neutral-500">Thời gian chờ trung vị theo bước</div>
          <div v-for="m in state.data.medians" :key="m.module + m.step" class="flex justify-between gap-2">
            <span class="truncate">{{ m.moduleLabel }} · {{ m.stepLabel }} ({{ m.count }} việc)</span>
            <span class="shrink-0">{{ m.medianHours == null ? '—' : m.medianHours + ' giờ' }}</span>
          </div>
        </div>
      </template>

      <!-- B7: suc khoe quy trinh duyet -->
      <template v-else-if="state.code === 'B7'">
        <div v-if="state.data.singleMemberSteps?.length">
          <div class="font-medium">Bước chỉ có 1 người duyệt được</div>
          <div v-for="s in state.data.singleMemberSteps" :key="s.module + s.stepLabel" class="py-0.5">
            {{ s.moduleLabel }} · {{ s.stepLabel }} ({{ s.roleName }})
          </div>
        </div>
        <div v-if="state.data.zeroMemberRoles?.length">
          <div class="font-medium">Role chưa có thành viên</div>
          <div v-for="z in state.data.zeroMemberRoles" :key="z.roleName" class="py-0.5">
            {{ z.roleName }}: {{ z.steps.join(', ') }}
          </div>
        </div>
        <div v-if="state.data.substitutes?.length">
          <div class="font-medium">Duyệt thay trong kỳ</div>
          <div v-for="s in state.data.substitutes" :key="s.actorName + s.actorRole" class="flex justify-between gap-2">
            <span class="truncate">{{ s.actorName }} ({{ s.actorRole }})</span>
            <span class="shrink-0 font-medium">{{ fmtNum(s.count) }} lần</span>
          </div>
        </div>
        <div v-if="state.data.exceptions?.length">
          <div class="font-medium">Ngoại lệ tin nóng trong kỳ ({{ fmtNum(state.data.exceptionCount) }})</div>
          <div v-for="e in state.data.exceptions" :key="e.module + e.id" class="truncate py-0.5" :title="e.reason || ''">
            {{ e.moduleLabel }} · {{ e.title }} — {{ e.actorName }}: {{ e.reason || '—' }}
          </div>
        </div>
        <div v-if="!state.data.singleMemberSteps?.length && !state.data.zeroMemberRoles?.length && !state.data.substitutes?.length && !state.data.exceptions?.length" class="text-neutral-400">
          Không có cảnh báo trong kỳ.
        </div>
        <NuxtLink v-if="state.drill" :to="drillTo(state.drill)" class="text-sky-400 hover:underline">Mở trang Quy trình duyệt</NuxtLink>
      </template>

      <!-- D1: trang thai kenh -->
      <template v-else-if="state.code === 'D1'">
        <div class="flex flex-wrap gap-4">
          <span>Tổng: <b>{{ fmtNum(state.data.total) }}</b></span>
          <span>Đang hiển thị: <b>{{ fmtNum(state.data.visible) }}</b></span>
          <span class="text-red-400">Đang ẩn: <b>{{ fmtNum(state.data.hidden) }}</b></span>
        </div>
        <div v-for="ch in state.data.channels" :key="ch.publicId" class="flex items-center justify-between gap-2">
          <NuxtLink :to="drillTo(ch.drill)" class="truncate hover:underline">{{ ch.name }} <span class="text-neutral-500">({{ ch.group }})</span></NuxtLink>
          <span class="shrink-0 text-xs" :class="ch.isVisible ? 'text-green-400' : 'text-red-400'">
            {{ ch.isVisible ? 'Hiển thị' : 'Đang ẩn' }}<span v-if="!ch.hlsConfigured"> · chưa có HLS</span>
          </span>
        </div>
        <NuxtLink v-if="state.drill" :to="drillTo(state.drill)" class="text-sky-400 hover:underline">Mở trang Truyền hình &amp; EPG</NuxtLink>
      </template>

      <!-- D2: xu ly media -->
      <template v-else-if="state.code === 'D2'">
        <div class="flex flex-wrap gap-4">
          <span>Chờ: <b>{{ fmtNum(state.data.counts.pending) }}</b></span>
          <span>Đã tải lên: <b>{{ fmtNum(state.data.counts.uploaded) }}</b></span>
          <span>Đang xử lý: <b>{{ fmtNum(state.data.counts.processing) }}</b></span>
          <span>Hoàn tất: <b>{{ fmtNum(state.data.counts.done) }}</b></span>
          <span class="text-red-400">Lỗi: <b>{{ fmtNum(state.data.counts.error) }}</b></span>
          <span class="text-red-400">Dead-letter: <b>{{ fmtNum(state.data.counts.deadLetter) }}</b></span>
        </div>
        <NuxtLink v-for="it in state.data.items" :key="it.id" :to="drillTo(it.drill)"
          class="block truncate py-0.5 hover:underline" :title="it.filename">
          {{ it.filename }} — {{ it.status }}<span v-if="it.attempts"> (lần {{ it.attempts }})</span><span v-if="it.error" class="text-red-400"> · {{ it.error }}</span>
        </NuxtLink>
        <NuxtLink v-if="state.drill" :to="drillTo(state.drill)" class="text-sky-400 hover:underline">Mở trang Tập tin</NuxtLink>
      </template>

      <!-- D3: luu tru (GĐ2) -->
      <template v-else-if="state.code === 'D3'">
        <div class="text-xs text-neutral-500">{{ state.data.note }}</div>
        <div v-for="r in state.data.rows" :key="r.type" class="flex items-center justify-between gap-2">
          <NuxtLink v-if="r.drill" :to="drillTo(r.drill)" class="truncate hover:underline">{{ r.label }}</NuxtLink>
          <span v-else class="truncate">{{ r.label }}</span>
          <span class="shrink-0">{{ fmtNum(r.files) }} file · <b>{{ fmtBytes(r.bytes) }}</b></span>
        </div>
        <NuxtLink v-if="state.drill" :to="drillTo(state.drill)" class="text-sky-400 hover:underline">Mở Thư viện</NuxtLink>
      </template>

      <!-- D4: nhat ky hoat dong -->
      <template v-else-if="state.code === 'D4'">
        <div class="text-xs text-neutral-500">{{ state.data.note }}</div>
        <div class="flex flex-wrap gap-2">
          <InputText v-model="d4Actor" placeholder="Lọc theo người thực hiện" class="w-48" />
          <InputText v-model="d4Action" placeholder="Lọc theo hành động" class="w-48" />
          <Button label="Lọc" size="small" @click="$emit('filter', { actor: d4Actor, action: d4Action })" />
          <Button label="Xóa lọc" size="small" severity="secondary" @click="d4Actor = ''; d4Action = ''; $emit('filter', { actor: '', action: '' })" />
        </div>
        <div v-for="e in state.data.items" :key="e.at + e.actor + e.action" class="flex flex-wrap gap-x-2 py-0.5">
          <span class="text-neutral-500">{{ fmtDateTime(e.at) }}</span>
          <span class="font-medium">{{ e.actor }}</span>
          <span>{{ e.action }}</span>
          <span class="text-neutral-500">{{ e.resource || '' }}</span>
        </div>
        <NuxtLink v-if="state.drill" :to="drillTo(state.drill)" class="text-sky-400 hover:underline">Mở trang Nhật ký</NuxtLink>
      </template>

      <!-- D5: canh bao van hanh -->
      <template v-else-if="state.code === 'D5'">
        <div v-if="state.data.epgTodayEmpty?.length">
          <div class="font-medium text-red-400">EPG hôm nay đang trống</div>
          <NuxtLink v-for="c in state.data.epgTodayEmpty" :key="c.publicId" :to="drillTo(c.drill)"
            class="block truncate py-0.5 text-red-400 hover:underline">{{ c.name }} ({{ c.group }})</NuxtLink>
        </div>
        <div v-if="state.data.issuesUnapproved?.length">
          <div class="font-medium text-red-400">Số báo 7 ngày tới chưa duyệt</div>
          <NuxtLink v-for="iss in state.data.issuesUnapproved" :key="iss.id" :to="drillTo(iss.drill)"
            class="block truncate py-0.5 text-red-400 hover:underline">
            {{ iss.issueType === 'vung_cao' ? 'Vùng cao' : 'Thường' }} {{ iss.issueNumber }} · {{ iss.publishDate }} · {{ iss.status }}
          </NuxtLink>
        </div>
        <div v-if="state.data.adsExpiring?.length">
          <div class="font-medium text-red-400">Quảng cáo sắp hết hạn (7 ngày tới)</div>
          <NuxtLink v-for="ad in state.data.adsExpiring" :key="ad.id" :to="drillTo(ad.drill)"
            class="block truncate py-0.5 text-red-400 hover:underline">
            {{ ad.name }} · {{ ad.placement }} · hết {{ fmtDate(ad.endsAt) }}
          </NuxtLink>
        </div>
        <div v-if="!state.data.epgTodayEmpty?.length && !state.data.issuesUnapproved?.length && !state.data.adsExpiring?.length" class="text-neutral-400">
          Không có cảnh báo vận hành.
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ state: any; id?: string }>();
defineEmits(['retry', 'filter']);

// Loc D4 khoi tao tu filters ma widget tra ve (neu co).
const d4Actor = ref(props.state.data?.filters?.actor || '');
const d4Action = ref(props.state.data?.filters?.action || '');

function fmtNum(n: any) {
  return typeof n === 'number' ? n.toLocaleString('vi-VN') : (n ?? '—');
}
function fmtBytes(n: any) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.max(0, Number(n) || 0);
  let u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  const s = v >= 100 || u === 0 ? Math.round(v).toLocaleString('vi-VN') : v.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
  return `${s} ${units[u]}`;
}
function fmtDate(iso: any) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtTime(iso: any) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDateTime(iso: any) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${fmtTime(iso)} ${fmtDate(iso)}`;
}
function drillTo(drill: any) {
  if (!drill?.route) return undefined;
  return { path: drill.route, query: drill.query || {} };
}
function barPct(count: number, days: any[]) {
  const max = Math.max(1, ...(days || []).map((d: any) => d.count || 0));
  return Math.round((count / max) * 100);
}
</script>
