<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} quảng cáo</p>
      <div class="flex gap-2">
        <Button v-if="can('newsroom_ads:create')" label="Thêm quảng cáo" icon="pi pi-plus" @click="openAdd" />
      </div>
    </div>

    <div class="surface-card p-4 flex flex-wrap gap-2">
      <InputText v-model="q" placeholder="Tìm tên / vị trí..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
      <Dropdown v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
        placeholder="Tất cả trạng thái" class="w-48" show-clear @change="load(1)" />
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total" lazy
        :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="name" header="Tên quảng cáo" />
        <Column header="Vị trí" style="min-width:9rem">
          <template #body="{ data }">{{ placementLabel(data.placement) }}</template>
        </Column>
        <Column header="Loại" style="min-width:7rem">
          <template #body="{ data }">{{ data.type === 'html' ? 'HTML/JS' : 'Ảnh' }}</template>
        </Column>
        <Column header="Lịch chạy" style="min-width:12rem">
          <template #body="{ data }">{{ runTimeText(data) }}</template>
        </Column>
        <Column header="Trạng thái" style="min-width:10rem">
          <template #body="{ data }">{{ statusText(data) }}</template>
        </Column>
        <Column header="Sửa đổi gần nhất" style="min-width:13rem">
          <template #body="{ data }">{{ lastEditText(data) }}</template>
        </Column>
        <Column header="Duyệt gần nhất" style="min-width:11rem">
          <template #body="{ data }">{{ lastApprovalText(data) }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:20rem">
          <template #body="{ data }">
            <Button v-if="can('newsroom_ads:update')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('newsroom_ads:update') && data.status === 'draft'" label="Gửi duyệt" size="small" text
              severity="info" @click="submitItem(data)" />
            <Button v-if="can('newsroom_ads:publish') && data.status === 'pending_review'" label="Duyệt" size="small" text
              severity="success" @click="approveItem(data)" />
            <Button v-if="can('newsroom_ads:publish') && data.status === 'pending_review'" label="Trả lại" size="small" text
              severity="warn" @click="openReturn(data)" />
            <Button v-if="can('newsroom_ads:publish') && ((data.status === 'draft' && isFullAdmin) || data.status === 'unpublished')" label="Xuất bản" size="small" text
              severity="success" @click="publishItem(data)" />
            <Button v-if="can('newsroom_ads:publish') && data.status === 'published'" label="Gỡ xuống" size="small" text
              severity="warn" @click="unpublishItem(data)" />
            <Button v-if="can('newsroom_ads:delete') && (data.status === 'draft' || data.status === 'unpublished')" label="Xóa" size="small" text
              severity="danger" @click="removeItem(data)" />
            <Button v-if="can('newsroom_ads:view')" label="Xem duyệt" size="small" text @click="openReview(data)" />
            <Button v-if="can('newsroom_ads:view')" label="Lịch sử duyệt" size="small" text @click="openHistory(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Quy trình duyệt quảng cáo tòa soạn: QL-QC tạo + Gửi duyệt → TBT (Tổng Biên tập)
        duyệt = xuất bản (chuỗi 1 bước). Bước nộp chỉ cần quyền Cập nhật; bước duyệt chỉ Role TBT hoặc tài khoản
        toàn quyền mới duyệt được, và người đã gửi duyệt không tự duyệt được (tách nhiệm vụ — kể cả toàn quyền),
        trừ ngoại lệ tin nóng có ghi log. Quảng cáo loại HTML/JS chỉ hiển thị trong iframe sandbox ở phía portal.
        Trang này khác "Banner" (banner catalog) cùng workspace.</p>
    </div>

    <!-- Form quang cao -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa quảng cáo' : 'Thêm quảng cáo'" class="w-full max-w-3xl">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tên quảng cáo *</label><InputText v-model="form.name" class="w-full" /></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label class="field-label">Vị trí hiển thị (theo danh mục vị trí)</label>
            <Dropdown v-model="form.placement" :options="PLACEMENTS" option-label="label" option-value="value" filter
              placeholder="Chọn vị trí hiển thị" class="w-full" />
          </div>
          <div><label class="field-label">Loại quảng cáo</label>
            <Dropdown v-model="form.type" :options="typeOptions" option-label="label" option-value="value" class="w-full" />
          </div>
        </div>
        <div v-if="form.type === 'image'"><label class="field-label">Ảnh quảng cáo *</label><ImagePicker v-model="form.imagePath" ratio="16/9" /></div>
        <div v-if="form.type === 'image'"><label class="field-label">Link đích (http/https)</label><InputText v-model="form.linkUrl" class="w-full" placeholder="https://..." /></div>
        <div v-if="form.type === 'html'"><label class="field-label">Mã HTML/JS * (chỉ chạy trong iframe sandbox khi hiển thị)</label>
          <Textarea v-model="form.htmlContent" rows="8" class="w-full font-mono text-xs" placeholder="<div>...</div> hoặc mã nhúng của đối tác" />
        </div>
        <div><label class="field-label">Thứ tự hiển thị trong cùng vị trí (nhỏ trước)</label>
          <InputNumber v-model="form.sortOrder" class="w-full" />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label class="field-label">Chạy từ (giờ Việt Nam, để trống = ngay)</label><InputText v-model="startsAtText" type="datetime-local" class="w-full" /></div>
          <div><label class="field-label">Chạy đến (giờ Việt Nam, để trống = không hạn)</label><InputText v-model="endsAtText" type="datetime-local" class="w-full" /></div>
        </div>
        <div><label class="field-label">Hẹn giờ xuất bản (giờ Việt Nam, để trống = ngay khi duyệt/xuất bản)</label>
          <InputText v-model="publishAtText" type="datetime-local" class="w-full" />
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Tạo'" :loading="saving" @click="save" :disabled="!form.name.trim()" />
      </template>
    </Dialog>

    <!-- Tra lai (bat buoc ly do) -->
    <Dialog v-model:visible="returnDlg" modal header="Trả lại quảng cáo" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Trả lại quảng cáo "{{ returnTarget?.name }}" về nháp. Người tạo sẽ thấy lý do này.</p>
        <Textarea v-model="returnReason" rows="3" class="w-full" placeholder="Lý do trả lại *" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="returnDlg = false" />
        <Button label="Trả lại" severity="warn" :disabled="!returnReason.trim()" @click="saveReturn" />
      </template>
    </Dialog>

    <!-- Ngoai le tin nong (tach nhiem vu) -->
    <Dialog v-model:visible="excDlg" modal header="Duyệt với ngoại lệ tin nóng" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Bạn đã xử lý bước trước của quảng cáo "{{ excTarget?.name }}" nên quy tắc tách nhiệm vụ chặn lượt duyệt này. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
        <Textarea v-model="excReason" rows="3" class="w-full" placeholder="Lý do ngoại lệ (nếu có)" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="excDlg = false" />
        <Button label="Duyệt với ngoại lệ tin nóng" severity="warn" @click="confirmExceptionApprove" />
      </template>
    </Dialog>

    <!-- Lich su duyet -->
    <Dialog v-model:visible="histDlg" modal :header="`Lịch sử duyệt — ${histTarget?.name || ''}`" class="w-full max-w-2xl">
      <DataTable :value="histItems" size="small">
        <Column field="actionLabel" header="Hành động" style="min-width:8rem" />
        <Column field="stepLabel" header="Bước" style="min-width:12rem" />
        <Column field="actorRole" header="Vai trò" style="min-width:8rem" />
        <Column field="actorName" header="Người xử lý" style="min-width:10rem" />
        <Column header="Ngoại lệ" style="min-width:10rem">
          <template #body="{ data }">{{ data.isException ? ('Tin nóng' + (data.exceptionReason ? ' — ' + data.exceptionReason : '')) : '—' }}</template>
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
    <Dialog v-model:visible="reviewDlg" modal :header="`Xem duyệt — ${reviewItem?.name || ''}`"
      class="w-[96vw] max-w-[96vw]" @hide="closeReview">
      <div v-if="reviewItem" class="flex flex-col gap-2">
        <p class="text-sm text-neutral-400">{{ placementLabel(reviewItem.placement) }} · {{ reviewItem.type === 'html' ? 'HTML/JS' : 'Ảnh' }} · {{ statusText(reviewItem) }} · {{ lastApprovalText(reviewItem) }}</p>
        <div v-if="reviewSodBlocked" class="p-3 rounded-lg border border-amber-700 bg-amber-950/40 flex flex-wrap items-center gap-2">
          <p class="text-sm flex-1 min-w-52">Bạn đã xử lý bước trước của quảng cáo này nên duyệt thường sẽ bị chặn theo quy tắc tách nhiệm vụ. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
          <Button label="Duyệt với ngoại lệ tin nóng" size="small" severity="warn" @click="openExceptionApprove(reviewItem)" />
        </div>
        <div class="flex gap-2">
          <Button label="Nội dung" size="small" :text="reviewTab !== 0" @click="reviewTab = 0" />
          <Button label="Lịch sử duyệt" size="small" :text="reviewTab !== 1" @click="reviewTab = 1" />
        </div>
        <div v-if="reviewTab === 0" class="flex flex-col gap-3 max-h-[70dvh] overflow-y-auto pr-1">
          <h2 class="text-xl font-semibold leading-snug">{{ reviewItem.name }}</h2>
          <template v-if="reviewItem.type === 'image'">
            <img v-if="reviewItem.imagePath" :src="resolveMedia(reviewItem.imagePath)" :alt="reviewItem.name" class="w-full max-h-96 object-contain rounded-lg" />
            <p class="text-xs text-neutral-400">Link đích: {{ reviewItem.linkUrl || '—' }}</p>
          </template>
          <template v-else>
            <p class="text-xs text-amber-400">Mã HTML/JS của đối tác — xem thử trong iframe sandbox (không truy cập được trang CMS). Chỉ duyệt khi rõ nguồn gốc mã.</p>
            <!-- Sandbox: khong allow-same-origin/allow-top-navigation — ma quang cao chay co lap. -->
            <iframe v-if="reviewItem.htmlContent" :srcdoc="reviewItem.htmlContent" sandbox="allow-scripts allow-popups"
              class="w-full h-64 rounded-lg border border-neutral-700 bg-white" title="Xem thử quảng cáo HTML" />
            <details>
              <summary class="text-xs text-neutral-400 cursor-pointer">Xem mã nguồn</summary>
              <pre class="text-xs whitespace-pre-wrap break-all max-h-64 overflow-y-auto">{{ reviewItem.htmlContent }}</pre>
            </details>
          </template>
          <p class="text-xs text-neutral-400">Lịch chạy: {{ runTimeText(reviewItem) }}</p>
        </div>
        <div v-else>
          <DataTable :value="reviewHist" size="small">
            <Column field="actionLabel" header="Hành động" style="min-width:8rem" />
            <Column field="stepLabel" header="Bước" style="min-width:12rem" />
            <Column field="actorRole" header="Vai trò" style="min-width:8rem" />
            <Column field="actorName" header="Người xử lý" style="min-width:10rem" />
            <Column header="Ngoại lệ" style="min-width:10rem">
              <template #body="{ data }">{{ data.isException ? ('Tin nóng' + (data.exceptionReason ? ' — ' + data.exceptionReason : '')) : '—' }}</template>
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
        <Button v-if="reviewItem && can('newsroom_ads:update') && reviewItem.status === 'draft'" label="Gửi duyệt" severity="info" @click="reviewSubmit" />
        <Button v-if="reviewItem && can('newsroom_ads:publish') && reviewItem.status === 'pending_review'" label="Duyệt" severity="success" @click="reviewApprove" />
        <Button v-if="reviewItem && can('newsroom_ads:publish') && reviewItem.status === 'pending_review'" label="Trả lại" severity="warn" @click="reviewReturn" />
        <Button v-if="reviewItem && can('newsroom_ads:publish') && ((reviewItem.status === 'draft' && isFullAdmin) || reviewItem.status === 'unpublished')" label="Xuất bản" severity="success" @click="reviewPublish" />
        <Button v-if="reviewItem && can('newsroom_ads:publish') && reviewItem.status === 'published'" label="Gỡ xuống" severity="warn" @click="reviewUnpublish" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Quảng cáo tòa soạn - VTC ANY CMS' });

const { can, permissions } = useCmsAuth();
const api = useApi();
const toast = useToast();

const isFullAdmin = computed(() => permissions.value.includes('*'));

const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const q = ref('');
const statusFilter = ref('');

const statusOptions = [
  { label: 'Nháp', value: 'draft' },
  { label: 'Chờ duyệt', value: 'pending_review' },
  { label: 'Đã xuất bản', value: 'published' },
  { label: 'Hạ xuất bản', value: 'unpublished' },
];
const typeOptions = [
  { label: 'Ảnh + link', value: 'image' },
  { label: 'Mã HTML/JS', value: 'html' },
];
// Danh muc khoa placement — bo vi tri day du theo Bao Dien Bien (dieu phoi
// vien chot 30/10/2026, thiet ke: tsht-2b-2c-draft/thiet-ke-2b-bo-vi-tri-
// quang-cao.md). Khoa la bat bien khi da co quang cao dung; them vi tri moi
// = them 1 dong o day + Nguoi 1 dung slot portal tuong ung. Backend giu
// placement la khoa chuoi tu do nen khong can migration/API moi. 5 khoa cu
// (cuoi danh sach) giu nguyen vi portal da co slot va quang cao da xuat ban
// dang dung.
const PLACEMENTS: { value: string; label: string }[] = [
  // Web · Trang chu (theo Bao Dien Bien)
  { value: 'web_home_under_menu', label: 'Web · Trang chủ · Ngang dưới thanh menu (1200×146)' },
  { value: 'web_home_under_focus', label: 'Web · Trang chủ · Bên dưới khối "Tâm điểm" (1200×146)' },
  { value: 'web_home_media_right', label: 'Web · Trang chủ · Bên phải mục "Đa Phương Tiện" (301×238)' },
  { value: 'web_home_under_media', label: 'Web · Trang chủ · Ngang dưới mục "Đa Phương Tiện" (1200×430)' },
  { value: 'web_home_weather_right', label: 'Web · Trang chủ · Bên phải khối chuyên mục có mục thời tiết (301×180)' },
  { value: 'web_home_below_weather_1', label: 'Web · Trang chủ · #1 bên phải khối chuyên mục dưới thời tiết (301×228)' },
  { value: 'web_home_below_weather_2', label: 'Web · Trang chủ · #2 bên phải khối chuyên mục dưới thời tiết (301×300)' },
  { value: 'web_home_focus_right', label: 'Web · Trang chủ · Bên phải trang tại khối "Tâm điểm", trên link Facebook (263×210)' },
  // App · Trang chu
  { value: 'app_home_mid_1', label: 'App · Trang chủ · Giữa trang · Vị trí 1' },
  { value: 'app_home_mid_2', label: 'App · Trang chủ · Giữa trang · Vị trí 2' },
  { value: 'app_home_mid_3', label: 'App · Trang chủ · Giữa trang · Vị trí 3' },
  { value: 'app_home_mid_4', label: 'App · Trang chủ · Giữa trang · Vị trí 4' },
  { value: 'app_home_bottom_1', label: 'App · Trang chủ · Khối dưới · Vị trí 1' },
  { value: 'app_home_bottom_2', label: 'App · Trang chủ · Khối dưới · Vị trí 2' },
  { value: 'app_home_bottom_3', label: 'App · Trang chủ · Khối dưới · Vị trí 3' },
  { value: 'app_home_bottom_4', label: 'App · Trang chủ · Khối dưới · Vị trí 4' },
  { value: 'app_home_footer_1', label: 'App · Trang chủ · Chân trang · Vị trí 1' },
  { value: 'app_home_footer_2', label: 'App · Trang chủ · Chân trang · Vị trí 2' },
  // App · Popup
  { value: 'app_popup_home', label: 'App · Popup · Trang chủ' },
  { value: 'app_popup_list', label: 'App · Popup · Trang danh sách tin' },
  { value: 'app_popup_article', label: 'App · Popup · Trang xem chi tiết' },
  // Khoa cu — portal da co slot, giu nguyen
  { value: 'home_top', label: 'Khóa cũ · Đầu trang chủ (home_top)' },
  { value: 'home_sidebar', label: 'Khóa cũ · Cột bên trang chủ (home_sidebar)' },
  { value: 'article_top', label: 'Khóa cũ · Trên bài viết (article_top)' },
  { value: 'article_sidebar', label: 'Khóa cũ · Cột bên bài viết (article_sidebar)' },
  { value: 'article_inbody', label: 'Khóa cũ · Giữa thân bài viết (article_inbody)' },
];
function placementLabel(key: string | null | undefined): string {
  if (!key) return '—';
  return PLACEMENTS.find((p) => p.value === key)?.label || key;
}

function statusText(it: any) {
  if (it.status === 'published' && it.publishAt && new Date(it.publishAt).getTime() > Date.now()) return 'Chờ xuất bản';
  if (it.status === 'published') return 'Đã xuất bản';
  if (it.status === 'unpublished') return 'Hạ xuất bản';
  if (it.status === 'pending_review') {
    const label = it.workflowStepLabel ? ` · ${it.workflowStepLabel}` : '';
    const total = it.workflowTotalSteps ? `/${it.workflowTotalSteps}` : '';
    return `Chờ duyệt${label} (bước ${it.workflowStep || '?'}${total})`;
  }
  return 'Nháp';
}
function lastApprovalText(it: any) {
  const a = it.lastApproval;
  if (!a) return '—';
  const role = a.actorRole ? ` · ${a.actorRole}` : '';
  const step = a.stepLabel ? ` (${a.stepLabel})` : '';
  const comment = a.comment ? ` — ${a.comment}` : '';
  return `${a.actionLabel || a.action}${step}${role} · ${fmtTime(a.createdAt)}${comment}`;
}
function fmtTime(s: string | null | undefined) {
  return s ? s.slice(0, 16).replace('T', ' ') : '';
}
function lastEditText(it: any) {
  const who = it.updatedBy || '?';
  const role = it.updatedByRole ? ` · ${it.updatedByRole}` : '';
  return `${who}${role} · ${fmtTime(it.updatedAt)}`;
}
function runTimeText(it: any) {
  const s = it.startsAt ? fmtTime(it.startsAt) : '';
  const e = it.endsAt ? fmtTime(it.endsAt) : '';
  if (s && e) return `${s} → ${e}`;
  if (s) return `Từ ${s}`;
  if (e) return `Đến ${e}`;
  return 'Không hạn';
}

async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/ads', {
      q: q.value || undefined, status: statusFilter.value || undefined, page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
}
function onPage(e: any) { load(Math.floor(e.first / e.rows) + 1); }

/** URL media dang tuong doi (/images/...) phai resolve qua origin backend (giong tin-bai.vue). */
function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}

/** ISO -> gia tri datetime-local theo gio Viet Nam (Asia/Ho_Chi_Minh). */
function isoToLocalInput(iso: string | null | undefined) {
  if (!iso) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  } catch { return iso.slice(0, 16); }
}
/** datetime-local (hieu la gio Viet Nam) -> ISO UTC. */
function localInputToIso(v: string) {
  if (!v) return null;
  const d = new Date(`${v}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const form = ref({ name: '', placement: '', type: 'image', imagePath: '', linkUrl: '', htmlContent: '', sortOrder: 0 });
const startsAtText = ref('');
const endsAtText = ref('');
const publishAtText = ref('');

function openAdd() {
  editing.value = null;
  form.value = { name: '', placement: '', type: 'image', imagePath: '', linkUrl: '', htmlContent: '', sortOrder: 0 };
  startsAtText.value = '';
  endsAtText.value = '';
  publishAtText.value = '';
  dlg.value = true;
}
function openEdit(it: any) {
  editing.value = it;
  form.value = {
    name: it.name || '', placement: it.placement || '', type: it.type || 'image',
    imagePath: it.imagePath || '', linkUrl: it.linkUrl || '', htmlContent: it.htmlContent || '',
    sortOrder: it.sortOrder || 0,
  };
  startsAtText.value = isoToLocalInput(it.startsAt);
  endsAtText.value = isoToLocalInput(it.endsAt);
  publishAtText.value = isoToLocalInput(it.publishAt);
  dlg.value = true;
}
async function save() {
  saving.value = true;
  try {
    const payload: any = {
      name: form.value.name.trim(),
      placement: form.value.placement || '',
      type: form.value.type,
      imagePath: form.value.type === 'image' ? (form.value.imagePath || null) : null,
      linkUrl: form.value.type === 'image' ? (form.value.linkUrl.trim() || null) : null,
      htmlContent: form.value.type === 'html' ? form.value.htmlContent : '',
      sortOrder: form.value.sortOrder || 0,
      startsAt: localInputToIso(startsAtText.value),
      endsAt: localInputToIso(endsAtText.value),
      publishAt: localInputToIso(publishAtText.value),
    };
    if (editing.value) await api.patch(`/admin/ads/${editing.value.publicId}`, payload);
    else await api.post('/admin/ads', payload);
    toast.add({ severity: 'success', summary: editing.value ? 'Đã lưu quảng cáo' : 'Đã tạo quảng cáo (nháp)', life: 2500 });
    dlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  } finally { saving.value = false; }
}
async function publishItem(it: any) {
  try {
    await api.post(`/admin/ads/${it.publicId}/publish`, {});
    toast.add({ severity: 'success', summary: 'Đã xuất bản', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xuất bản thất bại', life: 3000 });
  }
}
async function unpublishItem(it: any) {
  try {
    await api.post(`/admin/ads/${it.publicId}/unpublish`, {});
    toast.add({ severity: 'success', summary: 'Đã gỡ xuống', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Gỡ xuống thất bại', life: 3000 });
  }
}
async function removeItem(it: any) {
  if (!window.confirm(`Xóa quảng cáo "${it.name}"?`)) return;
  try {
    await api.del(`/admin/ads/${it.publicId}`);
    toast.add({ severity: 'success', summary: 'Đã xóa', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}

// --- Quy trinh duyet ---
async function submitItem(it: any) {
  try {
    await api.post(`/admin/ads/${it.publicId}/submit`);
    toast.add({ severity: 'success', summary: 'Đã gửi duyệt', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Gửi duyệt thất bại', life: 3000 });
  }
}
async function approveItem(it: any) {
  // Kiem tra SoD chu dong: trung nguoi xu ly buoc truoc thi mo thang dialog
  // ngoai le, khong goi approve mu. Luoi bat chuoi loi giu lam fallback.
  const prevActor = it.lastApproval?.actorId || null;
  const me = currentUserId();
  if (prevActor && me && prevActor === me) { openExceptionApprove(it); return; }
  try {
    const r = await api.post<any>(`/admin/ads/${it.publicId}/approve`);
    toast.add({ severity: 'success', summary: r?.status === 'published' ? 'Đã duyệt xong và xuất bản' : 'Đã duyệt', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    // ofetch dat body loi da parse vao e.data, khong phai e.response.data.
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
    const r = await api.post<any>(`/admin/ads/${excTarget.value.publicId}/approve`, { breakingNews: true, breakingNewsReason: excReason.value.trim() || undefined });
    toast.add({ severity: 'success', summary: r?.status === 'published' ? 'Đã duyệt xong và xuất bản (ngoại lệ tin nóng)' : 'Đã duyệt với ngoại lệ tin nóng', life: 2500 });
    excDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Duyệt thất bại', life: 3000 });
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
    await api.post(`/admin/ads/${returnTarget.value.publicId}/return`, { reason: returnReason.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã trả lại quảng cáo', life: 2500 });
    returnDlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Trả lại thất bại', life: 3000 });
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
    const r = await api.get<any>(`/admin/ads/${it.publicId}/approvals`);
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
/** Nguoi xu ly buoc truoc = ban ghi lich su moi nhat (API tra theo thu tu asc). */
const reviewPrevActorId = computed(() => {
  if (reviewHist.value.length) return reviewHist.value[reviewHist.value.length - 1]?.actorId || null;
  return reviewItem.value?.lastApproval?.actorId || null;
});
const reviewSodBlocked = computed(() => {
  if (!reviewItem.value || reviewItem.value.status !== 'pending_review') return false;
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
    const r = await api.get<any>(`/admin/ads/${it.publicId}/approvals`);
    reviewHist.value = r.data || [];
  } catch { /* tab lich su hien trong; canh bao SoD dung lastApproval */ }
}
function closeReview() { reviewItem.value = null; reviewHist.value = []; reviewTab.value = 0; }
async function refreshReview() {
  if (!reviewItem.value) return;
  const pid = reviewItem.value.publicId;
  await load(meta.value.page);
  const fresh = items.value.find((x: any) => x.publicId === pid);
  if (fresh) {
    reviewItem.value = fresh;
    try { const r = await api.get<any>(`/admin/ads/${pid}/approvals`); reviewHist.value = r.data || []; } catch {}
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
async function reviewPublish() {
  if (!reviewItem.value) return;
  await publishItem(reviewItem.value);
  await refreshReview();
}
async function reviewUnpublish() {
  if (!reviewItem.value) return;
  await unpublishItem(reviewItem.value);
  await refreshReview();
}
watch(excDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && excTarget.value?.publicId === reviewItem.value.publicId) await refreshReview();
});
watch(returnDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && returnTarget.value?.publicId === reviewItem.value.publicId) await refreshReview();
});

load(1);
</script>
