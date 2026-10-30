<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} bài đã xuất bản</p>
    </div>

    <div class="surface-card p-4 flex flex-wrap gap-2">
      <InputText v-model="q" placeholder="Tìm tiêu đề bài viết..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
      <Dropdown v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
        placeholder="Tất cả trạng thái chấm" class="w-52" show-clear @change="load(1)" />
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total" lazy
        :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề bài viết" style="min-width:20rem" />
        <Column header="Tác giả" style="min-width:12rem">
          <template #body="{ data }">{{ (data.authors || []).join(', ') || '—' }}</template>
        </Column>
        <Column header="Chuyên mục" style="min-width:9rem">
          <template #body="{ data }">{{ data.categoryName || '—' }}</template>
        </Column>
        <Column header="Ngày xuất bản" style="min-width:9rem">
          <template #body="{ data }">{{ fmtTime(data.publishAt).slice(0, 10) }}</template>
        </Column>
        <Column header="Trạng thái chấm" style="min-width:11rem">
          <template #body="{ data }">{{ statusText(data) }}</template>
        </Column>
        <Column header="Tổng điểm" style="min-width:7rem">
          <template #body="{ data }">{{ data.royalty ? data.royalty.articleTotal : '—' }}</template>
        </Column>
        <Column header="Duyệt gần nhất" style="min-width:11rem">
          <template #body="{ data }">{{ data.royalty ? lastApprovalText(data.royalty) : '—' }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:20rem">
          <template #body="{ data }">
            <Button v-if="!data.royalty && can('royalties:create')" label="Chấm điểm" size="small" text @click="openScore(data)" />
            <Button v-if="data.royalty && data.royalty.status === 'draft' && can('royalties:update')" label="Sửa điểm" size="small" text @click="openScore(data)" />
            <Button v-if="data.royalty && data.royalty.status === 'draft' && can('royalties:update')" label="Gửi duyệt" size="small" text
              severity="info" @click="submitItem(data)" />
            <Button v-if="data.royalty && data.royalty.status === 'pending_review' && can('royalties:publish')" label="Duyệt" size="small" text
              severity="success" @click="approveItem(data)" />
            <Button v-if="data.royalty && data.royalty.status === 'pending_review' && can('royalties:publish')" label="Trả lại" size="small" text
              severity="warn" @click="openReturn(data)" />
            <Button v-if="data.royalty && data.royalty.status === 'approved' && can('royalties:publish')" label="Mở khóa" size="small" text
              severity="warn" @click="openUnlock(data)" />
            <Button v-if="data.royalty && can('royalties:view')" label="Xem duyệt" size="small" text @click="openReview(data)" />
            <Button v-if="data.royalty && can('royalties:view')" label="Lịch sử duyệt" size="small" text @click="openHistory(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Quy trình nhuận bút: Trưởng phòng chấm điểm theo 5 thành phần
        (Nội dung / Ảnh / Video / Audio / Khác, mỗi thành phần 0–3 điểm) + Gửi duyệt → BBT (Ban Biên tập) duyệt =
        KHÓA điểm (chuỗi 1 bước). Bài nhiều tác giả chia theo tỉ lệ %, mặc định chia đều. Điểm đã khóa chỉ sửa
        được sau khi BBT mở khóa ngoại lệ (bắt buộc lý do, có ghi log). Người đã gửi duyệt không tự duyệt được
        (tách nhiệm vụ — kể cả toàn quyền), trừ ngoại lệ tin nóng có ghi log. Chỉ tính điểm, không tính tiền.</p>
    </div>

    <!-- Cham diem -->
    <Dialog v-model:visible="dlg" modal :header="scoreTarget?.royalty ? 'Sửa điểm nhuận bút' : 'Chấm điểm nhuận bút'" class="w-full max-w-2xl">
      <div v-if="scoreTarget" class="flex flex-col gap-3">
        <p class="text-sm font-medium leading-snug">{{ scoreTarget.title }}</p>
        <p class="text-xs text-neutral-400">Tác giả: {{ (scoreTarget.authors || []).join(', ') || '—' }} · Xuất bản: {{ fmtTime(scoreTarget.publishAt) }}</p>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div v-for="c in components" :key="c.key">
            <label class="field-label">{{ c.label }} (0–3)</label>
            <InputNumber v-model="form.scores[c.key]" :min="0" :max="3" class="w-full" />
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between">
            <label class="field-label">Tỉ lệ chia theo tác giả (%)</label>
            <Button label="Chia đều" size="small" text @click="splitEvenly" />
          </div>
          <div v-if="!form.shares.length" class="text-sm text-neutral-400">Bài viết chưa có tác giả — điểm sẽ lưu ở mức bài, không chia cho ai.</div>
          <div v-for="s in form.shares" :key="s.author" class="flex items-center gap-2 mt-1">
            <span class="flex-1 text-sm">{{ s.author }}</span>
            <span class="text-xs text-neutral-400">= {{ authorPreview(s).total }} điểm</span>
            <InputNumber v-model="s.percent" :min="0" :max="100" class="w-28" suffix=" %" />
          </div>
          <p v-if="form.shares.length" class="text-xs mt-1" :class="shareTotal === 100 ? 'text-neutral-400' : 'text-red-400'">
            Tổng tỉ lệ: {{ shareTotal }}% (phải bằng 100%)
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button label="Lưu điểm" :loading="saving" :disabled="!!form.shares.length && shareTotal !== 100" @click="save" />
      </template>
    </Dialog>

    <!-- Tra lai (bat buoc ly do) -->
    <Dialog v-model:visible="returnDlg" modal header="Trả lại bản chấm" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Trả lại điểm của bài "{{ returnTarget?.title }}" về nháp. Người chấm sẽ thấy lý do này.</p>
        <Textarea v-model="returnReason" rows="3" class="w-full" placeholder="Lý do trả lại *" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="returnDlg = false" />
        <Button label="Trả lại" severity="warn" :disabled="!returnReason.trim()" @click="saveReturn" />
      </template>
    </Dialog>

    <!-- Mo khoa ngoai le (bat buoc ly do) -->
    <Dialog v-model:visible="unlockDlg" modal header="Mở khóa điểm (ngoại lệ)" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Điểm của bài "{{ unlockTarget?.title }}" đã khóa sau khi BBT duyệt. Mở khóa sẽ đưa bản chấm về
          nháp để sửa và phải gửi duyệt + duyệt lại từ đầu. Lượt mở khóa này được ghi log là ngoại lệ.</p>
        <Textarea v-model="unlockReason" rows="3" class="w-full" placeholder="Lý do mở khóa *" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="unlockDlg = false" />
        <Button label="Mở khóa" severity="warn" :disabled="!unlockReason.trim()" @click="saveUnlock" />
      </template>
    </Dialog>

    <!-- Ngoai le tin nong (tach nhiem vu) -->
    <Dialog v-model:visible="excDlg" modal header="Duyệt với ngoại lệ tin nóng" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Bạn đã xử lý bước trước của bản chấm bài "{{ excTarget?.title }}" nên quy tắc tách nhiệm vụ chặn lượt duyệt này. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
        <Textarea v-model="excReason" rows="3" class="w-full" placeholder="Lý do ngoại lệ (nếu có)" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="excDlg = false" />
        <Button label="Duyệt với ngoại lệ tin nóng" severity="warn" @click="confirmExceptionApprove" />
      </template>
    </Dialog>

    <!-- Lich su duyet -->
    <Dialog v-model:visible="histDlg" modal :header="`Lịch sử duyệt — ${histTarget?.title || ''}`" class="w-full max-w-2xl">
      <DataTable :value="histItems" size="small">
        <Column field="actionLabel" header="Hành động" style="min-width:8rem" />
        <Column field="stepLabel" header="Bước" style="min-width:12rem" />
        <Column field="actorRole" header="Vai trò" style="min-width:8rem" />
        <Column field="actorName" header="Người xử lý" style="min-width:10rem" />
        <Column header="Ngoại lệ" style="min-width:10rem">
          <template #body="{ data }">{{ data.isException ? ('Có' + (data.exceptionReason ? ' — ' + data.exceptionReason : '')) : '—' }}</template>
        </Column>
        <Column field="comment" header="Lý do / ghi chú" />
        <Column header="Thời gian" style="min-width:10rem">
          <template #body="{ data }">{{ fmtTime(data.createdAt) }}</template>
        </Column>
      </DataTable>
      <template #footer>
        <Button label="Đóng" text @click="histDlg = false" />
      </template>
    </Dialog>

    <!-- Xem duyet -->
    <Dialog v-model:visible="reviewDlg" modal :header="`Xem duyệt — ${reviewItem?.title || ''}`"
      class="w-[96vw] max-w-3xl" @hide="closeReview">
      <div v-if="reviewItem" class="flex flex-col gap-2">
        <p class="text-sm text-neutral-400">{{ statusText(reviewItem) }} · {{ reviewItem.royalty ? lastApprovalText(reviewItem.royalty) : '' }}</p>
        <div v-if="reviewSodBlocked" class="p-3 rounded-lg border border-amber-700 bg-amber-950/40 flex flex-wrap items-center gap-2">
          <p class="text-sm flex-1 min-w-52">Bạn đã xử lý bước trước của bản chấm này nên duyệt thường sẽ bị chặn theo quy tắc tách nhiệm vụ. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
          <Button label="Duyệt với ngoại lệ tin nóng" size="small" severity="warn" @click="openExceptionApprove(reviewItem)" />
        </div>
        <div class="flex gap-2">
          <Button label="Điểm" size="small" :text="reviewTab !== 0" @click="reviewTab = 0" />
          <Button label="Lịch sử duyệt" size="small" :text="reviewTab !== 1" @click="reviewTab = 1" />
        </div>
        <div v-if="reviewTab === 0 && reviewItem.royalty" class="flex flex-col gap-3 max-h-[70dvh] overflow-y-auto pr-1">
          <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div v-for="c in components" :key="c.key" class="surface-card p-3 text-center">
              <p class="text-xs text-neutral-400">{{ c.label }}</p>
              <p class="text-xl font-semibold">{{ reviewItem.royalty.scores[c.key] }}</p>
            </div>
          </div>
          <DataTable :value="reviewItem.royalty.perAuthor" size="small">
            <Column field="author" header="Tác giả" />
            <Column field="percent" header="Tỉ lệ %" style="min-width:6rem" />
            <Column field="content" header="Nội dung" />
            <Column field="image" header="Ảnh" />
            <Column field="video" header="Video" />
            <Column field="audio" header="Audio" />
            <Column field="other" header="Khác" />
            <Column field="total" header="Tổng" />
          </DataTable>
          <p class="text-sm">Tổng điểm bài: <strong>{{ reviewItem.royalty.articleTotal }}</strong></p>
        </div>
        <div v-else-if="reviewTab === 1">
          <DataTable :value="reviewHist" size="small">
            <Column field="actionLabel" header="Hành động" style="min-width:8rem" />
            <Column field="stepLabel" header="Bước" style="min-width:12rem" />
            <Column field="actorRole" header="Vai trò" style="min-width:8rem" />
            <Column field="actorName" header="Người xử lý" style="min-width:10rem" />
            <Column header="Ngoại lệ" style="min-width:10rem">
              <template #body="{ data }">{{ data.isException ? ('Có' + (data.exceptionReason ? ' — ' + data.exceptionReason : '')) : '—' }}</template>
            </Column>
            <Column field="comment" header="Lý do / ghi chú" />
            <Column header="Thời gian" style="min-width:10rem">
              <template #body="{ data }">{{ fmtTime(data.createdAt) }}</template>
            </Column>
          </DataTable>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="reviewDlg = false" />
        <Button v-if="reviewItem?.royalty && reviewItem.royalty.status === 'draft' && can('royalties:update')" label="Gửi duyệt" severity="info" @click="reviewSubmit" />
        <Button v-if="reviewItem?.royalty && reviewItem.royalty.status === 'pending_review' && can('royalties:publish')" label="Duyệt" severity="success" @click="reviewApprove" />
        <Button v-if="reviewItem?.royalty && reviewItem.royalty.status === 'pending_review' && can('royalties:publish')" label="Trả lại" severity="warn" @click="reviewReturn" />
        <Button v-if="reviewItem?.royalty && reviewItem.royalty.status === 'approved' && can('royalties:publish')" label="Mở khóa" severity="warn" @click="reviewUnlock" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Nhuận bút - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();

const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const q = ref('');
const statusFilter = ref('');

const statusOptions = [
  { label: 'Chưa chấm', value: 'none' },
  { label: 'Nháp', value: 'draft' },
  { label: 'Chờ duyệt', value: 'pending_review' },
  { label: 'Đã khóa', value: 'approved' },
];
const components = [
  { key: 'content', label: 'Nội dung' },
  { key: 'image', label: 'Ảnh' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
  { key: 'other', label: 'Khác' },
] as const;

function statusText(it: any) {
  const r = it.royalty;
  if (!r) return 'Chưa chấm';
  if (r.status === 'approved') return 'Đã khóa';
  if (r.status === 'pending_review') {
    const label = r.workflowStepLabel ? ` · ${r.workflowStepLabel}` : '';
    const total = r.workflowTotalSteps ? `/${r.workflowTotalSteps}` : '';
    return `Chờ duyệt${label} (bước ${r.workflowStep || '?'}${total})`;
  }
  return 'Nháp';
}
function lastApprovalText(r: any) {
  const a = r?.lastApproval;
  if (!a) return '—';
  const role = a.actorRole ? ` · ${a.actorRole}` : '';
  const step = a.stepLabel ? ` (${a.stepLabel})` : '';
  const comment = a.comment ? ` — ${a.comment}` : '';
  return `${a.actionLabel || a.action}${step}${role} · ${fmtTime(a.createdAt)}${comment}`;
}
function fmtTime(s: string | null | undefined) {
  return s ? s.slice(0, 16).replace('T', ' ') : '';
}

async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/royalties/articles', {
      q: q.value || undefined, royaltyStatus: statusFilter.value || undefined, page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
}
function onPage(e: any) { load(Math.floor(e.first / e.rows) + 1); }

// --- Cham diem ---
const dlg = ref(false);
const saving = ref(false);
const scoreTarget = ref<any>(null);
const form = ref<{ scores: Record<string, number>; shares: { author: string; percent: number }[] }>({
  scores: { content: 0, image: 0, video: 0, audio: 0, other: 0 }, shares: [],
});
const shareTotal = computed(() => form.value.shares.reduce((s, x) => s + (Number(x.percent) || 0), 0));

function equalShares(authors: string[]) {
  const names = (authors || []).filter(Boolean);
  if (!names.length) return [];
  const base = Math.floor(100 / names.length);
  const out = names.map((author) => ({ author, percent: base }));
  out[0].percent += 100 - base * names.length;
  return out;
}
function openScore(it: any) {
  scoreTarget.value = it;
  if (it.royalty) {
    form.value = {
      scores: { ...it.royalty.scores },
      shares: (it.royalty.shares || []).map((s: any) => ({ ...s })),
    };
  } else {
    form.value = {
      scores: { content: 0, image: 0, video: 0, audio: 0, other: 0 },
      shares: equalShares(it.authors || []),
    };
  }
  dlg.value = true;
}
function splitEvenly() {
  if (scoreTarget.value) form.value.shares = equalShares(scoreTarget.value.authors || []);
}
function round2(n: number) { return Math.round((n + Number.EPSILON) * 100) / 100; }
function authorPreview(s: { author: string; percent: number }) {
  let total = 0;
  for (const c of components) total += round2(((form.value.scores[c.key] || 0) * (Number(s.percent) || 0)) / 100);
  return { total: round2(total) };
}
async function save() {
  if (!scoreTarget.value) return;
  saving.value = true;
  try {
    const payload = { scores: { ...form.value.scores }, shares: form.value.shares };
    const pid = scoreTarget.value.articlePublicId;
    if (scoreTarget.value.royalty) await api.patch(`/admin/royalties/articles/${pid}`, payload);
    else await api.post(`/admin/royalties/articles/${pid}`, payload);
    toast.add({ severity: 'success', summary: 'Đã lưu điểm (nháp)', life: 2500 });
    dlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  } finally { saving.value = false; }
}

// --- Quy trinh duyet ---
async function submitItem(it: any) {
  try {
    await api.post(`/admin/royalties/articles/${it.articlePublicId}/submit`);
    toast.add({ severity: 'success', summary: 'Đã gửi duyệt', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Gửi duyệt thất bại', life: 3000 });
  }
}
async function approveItem(it: any) {
  // Kiem tra SoD chu dong: trung nguoi xu ly buoc truoc thi mo thang dialog ngoai le.
  const prevActor = it.royalty?.lastApproval?.actorId || null;
  const me = currentUserId();
  if (prevActor && me && prevActor === me) { openExceptionApprove(it); return; }
  try {
    const r = await api.post<any>(`/admin/royalties/articles/${it.articlePublicId}/approve`);
    toast.add({ severity: 'success', summary: r?.royalty?.status === 'approved' ? 'Đã duyệt và khóa điểm' : 'Đã duyệt', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    const msg = e?.data?.message || e?.response?.data?.message || e?.message || '';
    if (String(msg).includes('tach nhiem vu')) { openExceptionApprove(it); return; }
    toast.add({ severity: 'error', summary: 'Lỗi', detail: msg || 'Duyệt thất bại', life: 3000 });
  }
}
const excDlg = ref(false);
const excTarget = ref<any>(null);
const excReason = ref('');
function openExceptionApprove(it: any) {
  excTarget.value = it;
  excReason.value = '';
  excDlg.value = true;
}
async function confirmExceptionApprove() {
  if (!excTarget.value) return;
  try {
    await api.post<any>(`/admin/royalties/articles/${excTarget.value.articlePublicId}/approve`, { breakingNews: true, breakingNewsReason: excReason.value.trim() || undefined });
    toast.add({ severity: 'success', summary: 'Đã duyệt và khóa điểm (ngoại lệ tin nóng)', life: 2500 });
    excDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Duyệt thất bại', life: 3000 });
  }
}
const returnDlg = ref(false);
const returnTarget = ref<any>(null);
const returnReason = ref('');
function openReturn(it: any) {
  returnTarget.value = it;
  returnReason.value = '';
  returnDlg.value = true;
}
async function saveReturn() {
  if (!returnTarget.value) return;
  try {
    await api.post(`/admin/royalties/articles/${returnTarget.value.articlePublicId}/return`, { reason: returnReason.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã trả lại bản chấm', life: 2500 });
    returnDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Trả lại thất bại', life: 3000 });
  }
}
const unlockDlg = ref(false);
const unlockTarget = ref<any>(null);
const unlockReason = ref('');
function openUnlock(it: any) {
  unlockTarget.value = it;
  unlockReason.value = '';
  unlockDlg.value = true;
}
async function saveUnlock() {
  if (!unlockTarget.value) return;
  try {
    await api.post(`/admin/royalties/articles/${unlockTarget.value.articlePublicId}/unlock`, { reason: unlockReason.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã mở khóa điểm (về nháp)', life: 2500 });
    unlockDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.data?.message || e?.response?.data?.message || e?.message || 'Mở khóa thất bại', life: 3000 });
  }
}
const histDlg = ref(false);
const histTarget = ref<any>(null);
const histItems = ref<any[]>([]);
async function openHistory(it: any) {
  histTarget.value = it;
  histItems.value = [];
  histDlg.value = true;
  try {
    const r = await api.get<any>(`/admin/royalties/articles/${it.articlePublicId}/approvals`);
    histItems.value = r.data || [];
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được lịch sử duyệt', life: 3000 });
  }
}

// --- Xem duyet ---
const reviewDlg = ref(false);
const reviewItem = ref<any>(null);
const reviewTab = ref(0);
const reviewHist = ref<any[]>([]);
/** Id nguoi dung hien tai, decode tu JWT sub (khong can secret, khong goi backend). */
function currentUserId(): string | null {
  try {
    const t = localStorage.getItem('cms_token') || sessionStorage.getItem('cms_token');
    if (!t) return null;
    let part = t.split('.')[1] || '';
    if (!part) return null;
    part = part.replace(/-/g, '+').replace(/_/g, '/');
    part += '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(atob(part))?.sub || null;
  } catch { return null; }
}
const reviewPrevActorId = computed(() => {
  if (reviewHist.value.length) return reviewHist.value[reviewHist.value.length - 1]?.actorId || null;
  return reviewItem.value?.royalty?.lastApproval?.actorId || null;
});
const reviewSodBlocked = computed(() => {
  if (!reviewItem.value?.royalty || reviewItem.value.royalty.status !== 'pending_review') return false;
  const prev = reviewPrevActorId.value;
  const me = currentUserId();
  return !!(prev && me && prev === me);
});
async function openReview(it: any) {
  reviewItem.value = it;
  reviewTab.value = 0;
  reviewHist.value = [];
  reviewDlg.value = true;
  try {
    const r = await api.get<any>(`/admin/royalties/articles/${it.articlePublicId}/approvals`);
    reviewHist.value = r.data || [];
  } catch { /* tab lich su hien trong; canh bao SoD dung lastApproval */ }
}
function closeReview() { reviewItem.value = null; reviewHist.value = []; reviewTab.value = 0; }
async function refreshReview() {
  if (!reviewItem.value) return;
  const pid = reviewItem.value.articlePublicId;
  await load(meta.value.page);
  const fresh = items.value.find((x: any) => x.articlePublicId === pid);
  if (fresh) {
    reviewItem.value = fresh;
    try { const r = await api.get<any>(`/admin/royalties/articles/${pid}/approvals`); reviewHist.value = r.data || []; } catch {}
  } else {
    reviewDlg.value = false;
  }
}
async function reviewSubmit() {
  if (!reviewItem.value) return;
  await submitItem(reviewItem.value);
  await refreshReview();
}
async function reviewApprove() {
  if (!reviewItem.value) return;
  if (reviewSodBlocked.value) { openExceptionApprove(reviewItem.value); return; }
  await approveItem(reviewItem.value);
  await refreshReview();
}
function reviewReturn() {
  if (reviewItem.value) openReturn(reviewItem.value);
}
function reviewUnlock() {
  if (reviewItem.value) openUnlock(reviewItem.value);
}
watch(excDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && excTarget.value?.articlePublicId === reviewItem.value.articlePublicId) await refreshReview();
});
watch(returnDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && returnTarget.value?.articlePublicId === reviewItem.value.articlePublicId) await refreshReview();
});
watch(unlockDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && unlockTarget.value?.articlePublicId === reviewItem.value.articlePublicId) await refreshReview();
});

load(1);
</script>
