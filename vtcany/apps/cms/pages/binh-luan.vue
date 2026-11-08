<template>
  <div class="flex flex-col gap-4">
    <!-- Khong co quyen: can comments:view (xem) hoac comments:publish (thao tac). -->
    <Message v-if="!hasAccess" severity="error">
      Không có quyền xem bình luận. Cần quyền <b>comments:view</b> hoặc <b>comments:publish</b>.
    </Message>

    <template v-else>
      <div class="flex gap-2">
        <Button label="Hàng kiểm duyệt" icon="pi pi-list"
          :severity="tab === 'list' ? undefined : 'secondary'" :outlined="tab !== 'list'"
          @click="tab = 'list'" size="small" />
        <Button v-if="canPublish" label="Cài đặt" icon="pi pi-cog"
          :severity="tab === 'settings' ? undefined : 'secondary'" :outlined="tab !== 'settings'"
          @click="tab = 'settings'" size="small" />
      </div>

      <!-- ============ TAB DANH SACH ============ -->
      <template v-if="tab === 'list'">
        <div class="surface-card p-4 flex flex-wrap gap-2">
          <Dropdown v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
            class="w-44" @change="load(1)" />
          <Dropdown v-model="articleFilter" :options="articleOptions" option-label="label" option-value="value"
            placeholder="Tất cả bài viết" class="w-72" show-clear filter :loading="articleLoading"
            @filter="onArticleFilter" @change="load(1)" />
          <InputText v-model="q" placeholder="Tìm tác giả / nội dung..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
          <div class="flex items-center gap-2">
            <Checkbox v-model="flaggedOnly" binary input-id="flagged" @change="load(1)" />
            <label for="flagged" class="text-sm">Chỉ bình luận chứa từ cấm</label>
          </div>
          <Button label="Tìm" size="small" @click="load(1)" />
          <Button label="Làm mới" icon="pi pi-refresh" size="small" severity="secondary" outlined @click="refresh" />
        </div>

        <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} bình luận</p>

        <div class="surface-card p-4">
          <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total"
            lazy :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
            <Column header="Tác giả" style="min-width:9rem">
              <template #body="{ data }">
                {{ data.authorName || 'Bạn đọc' }}
                <Tag v-if="data.isNewsroom" value="Tòa soạn" severity="info" class="ml-1" />
              </template>
            </Column>
            <Column header="Bài viết" style="min-width:14rem">
              <template #body="{ data }">
                <a v-if="data.articleSlug" :href="articleUrl(data.articleSlug)" target="_blank" rel="noopener"
                  class="text-sky-400 hover:underline">{{ data.articleTitle || data.articleSlug }}</a>
                <span v-else>{{ data.articleTitle || '—' }}</span>
              </template>
            </Column>
            <Column header="Nội dung" style="min-width:18rem">
              <template #body="{ data }">
                <span class="cursor-pointer hover:underline" :title="data.body" @click="openDetail(data)">{{
                  truncateBody(data.body) }}</span>
              </template>
            </Column>
            <Column header="Trạng thái" style="min-width:8rem">
              <template #body="{ data }">
                <Tag :value="statusLabel(data.status)" :severity="statusSeverity(data.status)" />
                <Tag v-if="data.flaggedBannedWord" value="Chứa từ cấm" severity="warn" class="ml-1" />
              </template>
            </Column>
            <Column header="Báo cáo" style="min-width:8rem">
              <template #body="{ data }">
                <span :class="{ 'font-bold text-red-500': (data.reportCount || 0) >= 3 }">{{ data.reportCount || 0 }}</span>
                <Tag v-if="data.autoHiddenByReports" value="Tự ẩn vì báo cáo" severity="danger" class="ml-1" />
              </template>
            </Column>
            <Column header="Thời gian tạo" style="min-width:9rem">
              <template #body="{ data }">{{ fmtTime(data.createdAt) }}</template>
            </Column>
            <Column header="Thao tác" style="min-width:22rem">
              <template #body="{ data }">
                <template v-if="canPublish">
                  <Button v-if="['pending', 'hidden', 'rejected'].includes(data.status)" label="Duyệt" size="small" text
                    severity="success" @click="doApprove(data)" />
                  <Button v-if="['pending', 'hidden'].includes(data.status)" label="Từ chối" size="small" text
                    severity="danger" @click="openReject(data)" />
                  <Button v-if="data.status === 'approved'" label="Ẩn" size="small" text
                    severity="warn" @click="openHide(data)" />
                  <Button v-if="data.status === 'approved' && !data.parentId" label="Trả lời" size="small" text
                    @click="openReply(data)" />
                  <Button v-if="data.userId" label="Khóa" size="small" text severity="danger" @click="openBan(data)" />
                  <Button v-if="data.userId" label="Ẩn tất cả" size="small" text severity="danger" @click="openHideAll(data)" />
                </template>
                <Button label="Xem" size="small" text @click="openDetail(data)" />
              </template>
            </Column>
          </DataTable>
          <p class="mt-2 text-xs text-neutral-500">Thứ tự mặc định: Chờ duyệt → cũ nhất trước (để duyệt kịp);
            các trạng thái khác → mới nhất trước (do API sắp xếp theo §3.5 thiết kế).</p>
        </div>
      </template>

      <!-- ============ TAB CAI DAT ============ -->
      <template v-else-if="tab === 'settings' && canPublish">
        <div class="surface-card p-4 flex flex-col gap-4 max-w-3xl">
          <p v-if="settingsLoading" class="text-sm text-neutral-400">Đang tải cài đặt...</p>
          <template v-else-if="settingsForm">
            <div class="flex items-start gap-3">
              <InputSwitch v-model="settingsForm.enabled" input-id="c-enabled" />
              <div>
                <label for="c-enabled" class="font-medium">Bật bình luận trên portal</label>
                <p class="text-xs text-neutral-400">Bật sau buổi demo khi có lệnh. Tắt = portal không hiện khung
                  bình luận và API công khai trả lỗi.</p>
              </div>
            </div>
            <div>
              <p class="font-medium mb-2">Chế độ duyệt</p>
              <div class="flex flex-wrap gap-4">
                <div class="flex items-center gap-2">
                  <RadioButton v-model="settingsForm.moderationMode" input-id="c-pre" value="pre" />
                  <label for="c-pre">Duyệt trước</label>
                </div>
                <div class="flex items-center gap-2">
                  <RadioButton v-model="settingsForm.moderationMode" input-id="c-post" value="post" />
                  <label for="c-post">Duyệt sau</label>
                </div>
              </div>
              <p class="text-xs text-neutral-400 mt-1">Đợt 1 chỉ hỗ trợ duyệt trước; chọn 'Duyệt sau' vẫn lưu nhưng
                hệ thống vẫn duyệt trước cho đến đợt sau.</p>
            </div>
            <div>
              <p class="font-medium mb-1">Danh sách từ cấm</p>
              <p class="text-xs text-neutral-400">Danh sách từ cấm dùng chung cho toàn hệ thống — sửa ở tab
                "Từ cấm" trong trang Từ khoá. Bình luận chứa từ trong danh sách luôn chờ duyệt (kể cả khi đã
                bật duyệt sau ở đợt sau).</p>
              <Button label="Mở trang Từ khoá" icon="pi pi-external-link" size="small" severity="secondary"
                outlined class="mt-2" @click="navigateTo('/tu-khoa')" />
            </div>
            <div class="flex items-start gap-3">
              <InputSwitch v-model="settingsForm.turnstileEnabled" input-id="c-turnstile" />
              <div>
                <label for="c-turnstile" class="font-medium">Bật Turnstile (chống spam)</label>
                <p class="text-xs text-neutral-400">Chỉ có tác dụng khi đã có TURNSTILE_SECRET_KEY trên backend.</p>
                <Message v-if="settingsForm.turnstileEnabled && settingsTurnstileKeyConfigured === false"
                  severity="error" class="mt-2">Chưa có key Turnstile — form bình luận sẽ không yêu cầu captcha
                  cho đến khi có key.</Message>
              </div>
            </div>
            <div class="flex items-start gap-3">
              <InputSwitch v-model="settingsForm.requirePhoneVerified" input-id="c-phone" />
              <div>
                <label for="c-phone" class="font-medium">Yêu cầu xác thực số điện thoại</label>
                <p class="text-xs text-neutral-400">Chờ pháp chế xác nhận NĐ 147/2024 có áp cho báo điện tử không.
                  Đợt 1 chưa có luồng xác minh SĐT — bật cờ này chưa có tác dụng cho đến khi có luồng xác minh.</p>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label class="field-label">Tối đa ký tự / bình luận</label>
                <InputNumber v-model="settingsForm.maxLength" :min="0" class="w-full" />
              </div>
              <div>
                <label class="field-label">Bình luận / ngày / tài khoản</label>
                <InputNumber v-model="settingsForm.dailyLimit" :min="0" class="w-full" />
              </div>
              <div>
                <label class="field-label">Bình luận / ngày / IP</label>
                <InputNumber v-model="settingsForm.ipDailyLimit" :min="0" class="w-full" />
              </div>
              <div>
                <label class="field-label">Bình luận / 10 phút / IP</label>
                <InputNumber v-model="settingsForm.ipBurstLimit" :min="0" class="w-full" />
              </div>
            </div>
            <p class="text-xs text-neutral-400">Mặc định: 1000 / 20 / 200 / 20. Đổi không cần deploy.</p>
            <div>
              <Button label="Lưu cài đặt" icon="pi pi-check" :loading="settingsSaving" @click="saveSettings" />
            </div>
          </template>
        </div>
      </template>
    </template>

    <!-- ============ DIALOG CHI TIET ============ -->
    <Dialog v-model:visible="detailDlg" modal header="Chi tiết bình luận" class="w-[96vw] max-w-2xl">
      <div v-if="detailItem" class="flex flex-col gap-3">
        <div>
          <p class="text-xs text-neutral-400">Nội dung</p>
          <p class="whitespace-pre-wrap break-words">{{ detailItem.body }}</p>
        </div>
        <p class="text-sm"><span class="text-neutral-400">Bài viết: </span>
          <a v-if="detailItem.articleSlug" :href="articleUrl(detailItem.articleSlug)" target="_blank" rel="noopener"
            class="text-sky-400 hover:underline">{{ detailItem.articleTitle || detailItem.articleSlug }}</a>
          <span v-else>{{ detailItem.articleTitle || '—' }}</span>
        </p>
        <p class="text-sm"><span class="text-neutral-400">Tác giả: </span>{{ detailItem.authorName || 'Bạn đọc' }}
          <Tag v-if="detailItem.isNewsroom" value="Tòa soạn" severity="info" class="ml-1" />
        </p>
        <p class="text-sm"><span class="text-neutral-400">Trạng thái: </span>
          <Tag :value="statusLabel(detailItem.status)" :severity="statusSeverity(detailItem.status)" />
          <Tag v-if="detailItem.flaggedBannedWord" value="Chứa từ cấm" severity="warn" class="ml-1" />
          <span v-if="detailItem.deletedAt" class="text-sm text-neutral-400"> · Đã xóa mềm lúc {{ fmtTime(detailItem.deletedAt) }}</span>
        </p>
        <p class="text-sm"><span class="text-neutral-400">Thời gian tạo: </span>{{ fmtTime(detailItem.createdAt) }}</p>
        <!-- IP + User-Agent chi hien khi co comments:publish (API cung chi tra cho publish). -->
        <template v-if="canPublish">
          <p class="text-sm"><span class="text-neutral-400">IP: </span>{{ detailItem.ip || '—' }}</p>
          <p class="text-sm break-all"><span class="text-neutral-400">User-Agent: </span>{{ detailItem.userAgent || '—' }}</p>
        </template>
        <div>
          <p class="text-xs text-neutral-400">Báo cáo vi phạm ({{ detailItem.reportCount || 0 }})</p>
          <template v-if="detailItem.reports?.length">
            <DataTable :value="detailItem.reports" size="small">
              <Column field="reporterName" header="Người báo cáo" />
              <Column field="reason" header="Lý do" />
              <Column header="Thời gian">
                <template #body="{ data }">{{ fmtTime(data.createdAt) }}</template>
              </Column>
            </DataTable>
          </template>
          <p v-else class="text-sm text-neutral-400">
            <span v-if="detailItem.autoHiddenByReports">Bình luận này đã tự ẩn vì có từ 3 báo cáo trở lên.</span>
            <span v-else-if="(detailItem.reportCount || 0) > 0">Có {{ detailItem.reportCount }} báo cáo — API hàng kiểm duyệt
              (§3.5) không trả danh sách từng báo cáo nên chỉ hiện tổng số ở đây.</span>
            <span v-else>Chưa có báo cáo nào.</span>
          </p>
        </div>
        <div>
          <p class="text-xs text-neutral-400">Lịch sử duyệt (lần gần nhất)</p>
          <p v-if="detailItem.moderatedAt || detailItem.moderationReason" class="text-sm">
            {{ detailItem.moderatedByName || '—' }} · {{ fmtTime(detailItem.moderatedAt) }}
            <span v-if="detailItem.moderationReason"> — {{ detailItem.moderationReason }}</span>
          </p>
          <p v-else class="text-sm text-neutral-400">Chưa có lượt duyệt nào.</p>
        </div>
        <div v-if="!detailItem.parentId">
          <p class="text-xs text-neutral-400">Trả lời của tòa soạn</p>
          <p v-if="detailRepliesLoading" class="text-sm text-neutral-400">Đang tải...</p>
          <div v-else-if="detailReplies.length" class="flex flex-col gap-2">
            <div v-for="r in detailReplies" :key="r.id" class="surface-card p-3">
              <p class="text-sm"><b>Tòa soạn</b> · {{ fmtTime(r.createdAt) }}</p>
              <p class="text-sm whitespace-pre-wrap break-words">{{ r.body }}</p>
            </div>
          </div>
          <p v-else class="text-sm text-neutral-400">Chưa có trả lời.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="detailDlg = false" />
        <template v-if="canPublish && detailItem">
          <Button v-if="['pending', 'hidden', 'rejected'].includes(detailItem.status)" label="Duyệt"
            severity="success" @click="doApprove(detailItem)" />
          <Button v-if="['pending', 'hidden'].includes(detailItem.status)" label="Từ chối"
            severity="danger" @click="openReject(detailItem)" />
          <Button v-if="detailItem.status === 'approved'" label="Ẩn" severity="warn" @click="openHide(detailItem)" />
          <Button v-if="detailItem.status === 'approved' && !detailItem.parentId" label="Trả lời"
            @click="openReply(detailItem)" />
        </template>
      </template>
    </Dialog>

    <!-- Tu choi (ly do BAT BUOC) -->
    <Dialog v-model:visible="rejectDlg" modal header="Từ chối bình luận" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Từ chối bình luận của "{{ rejectTarget?.authorName || 'Bạn đọc' }}". Lý do này hiển thị
          cho tác giả trong mục "Bình luận của tôi".</p>
        <Textarea v-model="rejectReason" rows="3" class="w-full" placeholder="Lý do từ chối *" maxlength="500" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="rejectDlg = false" />
        <Button label="Từ chối" severity="danger" :disabled="!rejectReason.trim()" :loading="actionBusy" @click="saveReject" />
      </template>
    </Dialog>

    <!-- An (ly do tuy chon) -->
    <Dialog v-model:visible="hideDlg" modal header="Ẩn bình luận" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Ẩn bình luận của "{{ hideTarget?.authorName || 'Bạn đọc' }}" — bình luận sẽ không hiện
          công khai nữa, có thể duyệt lại sau.</p>
        <Textarea v-model="hideReason" rows="3" class="w-full" placeholder="Lý do ẩn (tùy chọn)" maxlength="500" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="hideDlg = false" />
        <Button label="Ẩn bình luận" severity="warn" :loading="actionBusy" @click="saveHide" />
      </template>
    </Dialog>

    <!-- Tra loi cua toa soan -->
    <Dialog v-model:visible="replyDlg" modal header="Trả lời bình luận (Tòa soạn)" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Trả lời hiện ngay dưới bình luận gốc với nhãn "Tòa soạn". Chỉ trả lời 1 cấp.</p>
        <Textarea v-model="replyBody" rows="4" class="w-full" placeholder="Nội dung trả lời..." maxlength="1000" />
        <p class="text-xs text-right" :class="(replyBody.length || 0) > 1000 ? 'text-red-400' : 'text-neutral-400'">
          {{ replyBody.length || 0 }}/1000</p>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="replyDlg = false" />
        <Button label="Gửi trả lời" :disabled="!replyBody.trim() || (replyBody.length || 0) > 1000"
          :loading="actionBusy" @click="saveReply" />
      </template>
    </Dialog>

    <!-- Khoa nguoi binh luan -->
    <Dialog v-model:visible="banDlg" modal header="Khóa người bình luận" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Khóa tài khoản bạn đọc "{{ banTarget?.authorName || 'Bạn đọc' }}". Tài khoản bị khóa sẽ
          không bình luận được nữa.</p>
        <p class="text-sm font-medium text-amber-400">Các bình luận đã duyệt của người này KHÔNG tự ẩn — dùng
          "Ẩn tất cả bình luận của người này" nếu cần ẩn.</p>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="banDlg = false" />
        <Button label="Khóa người bình luận" severity="danger" :loading="actionBusy" @click="saveBan" />
      </template>
    </Dialog>

    <!-- An tat ca binh luan cua nguoi nay -->
    <Dialog v-model:visible="hideAllDlg" modal header="Ẩn tất cả bình luận của người này" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p v-if="hideAllLoading" class="text-sm text-neutral-400">Đang đếm bình luận đã duyệt...</p>
        <template v-else>
          <p class="text-sm">Sẽ ẩn <b>{{ hideAllCount }}{{ hideAllTruncated ? '+' : '' }} bình luận đã duyệt</b> của
            "{{ hideAllTarget?.authorName || 'Bạn đọc' }}" (chuyển sang trạng thái Đã ẩn, không hiện công khai nữa).
            <span v-if="hideAllTruncated">Con số là tối thiểu — danh sách đã duyệt vượt quá 100 dòng tải về để đếm.</span></p>
          <p class="text-sm text-neutral-400">Bình luận đang chờ duyệt / bị từ chối / đã ẩn không bị ảnh hưởng.
            Hành động này được ghi nhật ký.</p>
        </template>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="hideAllDlg = false" />
        <Button label="Ẩn tất cả" severity="danger" :loading="actionBusy" :disabled="hideAllLoading" @click="saveHideAll" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
// Hang kiem duyet binh luan — Thiet ke Binh luan Dot 1 §4.1 + §4.2, API §3.5:
//   GET /api/v1/admin/comments (status/articleId/q/flagged/page/limit)
//   POST /api/v1/admin/comments/:id/approve | reject | hide | reply | ban-author | hide-all-by-author
//   GET/PUT /api/v1/admin/comments/settings
// Thu tu do API sap xep: pending -> createdAt ASC, trang thai khac -> DESC.
// Le thiet ke (ghi trong bao cao): nut Duyet hien ca o rejected (theo §3.5 + test
// T80, cho duyet lai) du §4.1 chi ghi pending/hidden; dialog chi tiet khong
// hien danh sach tung bao cao vi API §3.5 khong tra truong reports.
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Bình luận - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const route = useRoute();

const hasAccess = computed(() => can('comments:view') || can('comments:publish'));
const canPublish = computed(() => can('comments:publish'));

const tab = ref('list');

// --- Loc / danh sach ---
const statusOptions = [
  { label: 'Chờ duyệt', value: 'pending' },
  { label: 'Đã duyệt', value: 'approved' },
  { label: 'Bị từ chối', value: 'rejected' },
  { label: 'Đã ẩn', value: 'hidden' },
  { label: 'Đã xóa', value: 'deleted' },
  { label: 'Tất cả', value: 'all' },
];
const STATUS_VALUES = statusOptions.map((o) => o.value);
const statusFilter = ref('pending');
const articleFilter = ref('');
const articleOptions = ref<any[]>([]);
const articleLoading = ref(false);
const q = ref('');
const flaggedOnly = ref(false);
const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);

function statusLabel(s: string) {
  return ({ pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Bị từ chối', hidden: 'Đã ẩn', deleted: 'Đã xóa' } as any)[s] || s;
}
function statusSeverity(s: string) {
  return ({ pending: 'warn', approved: 'success', rejected: 'danger', hidden: 'secondary', deleted: 'secondary' } as any)[s] || 'secondary';
}
function fmtTime(s: string | null | undefined) {
  return s ? s.slice(0, 16).replace('T', ' ') : '';
}
function truncateBody(b: string) {
  const t = (b || '').replace(/\s+/g, ' ').trim();
  return t.length > 120 ? t.slice(0, 120) + '…' : t;
}
// Portal chinh tsht.vtctech.xyz, bai viet o /tin/<slug> (public/js/article.js).
function articleUrl(slug: string) {
  return `https://tsht.vtctech.xyz/tin/${encodeURIComponent(slug)}`;
}
function errMsg(e: any) {
  return e?.response?.data?.error?.message || e?.response?.data?.message || e?.message || 'Thao tác thất bại';
}

async function loadArticles(search: string) {
  articleLoading.value = true;
  try {
    const r = await api.get<any>('/admin/news', { q: search || undefined, page: 1, limit: 20 });
    articleOptions.value = (r.data || []).map((a: any) => ({ label: a.title || a.slug, value: a.id }));
  } catch {
    // Fail-open: khong co quyen articles:view thi dropdown trong, loc theo
    // bai van dung duoc neu biet articleId (khong chan danh sach chinh).
    articleOptions.value = [];
  } finally { articleLoading.value = false; }
}
function onArticleFilter(e: any) { loadArticles(e?.value || ''); }

async function load(page = 1) {
  if (!hasAccess.value) return;
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/comments', {
      status: statusFilter.value, articleId: articleFilter.value || undefined,
      q: q.value || undefined, flagged: flaggedOnly.value ? true : undefined,
      page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e) || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
}
function onPage(e: any) { load(Math.floor(e.first / e.rows) + 1); }
function refresh() { load(1); }

// Dong bo loc trang thai theo ?status= (drill tu A1/C6: /binh-luan?status=pending).
function applyQuery() {
  const s = route.query.status;
  if (typeof s === 'string' && STATUS_VALUES.includes(s) && s !== statusFilter.value) statusFilter.value = s;
  load(1);
}
watch(() => route.query, applyQuery);

// --- Chi tiet ---
const detailDlg = ref(false);
const detailItem = ref<any>(null);
const detailReplies = ref<any[]>([]);
const detailRepliesLoading = ref(false);
async function openDetail(it: any) {
  detailItem.value = it;
  detailReplies.value = [];
  detailDlg.value = true;
  if (!it.parentId && it.articleId) {
    detailRepliesLoading.value = true;
    try {
      const r = await api.get<any>('/admin/comments', { articleId: it.articleId, limit: 100 });
      detailReplies.value = (r.data || []).filter((c: any) => c.parentId === it.id);
    } catch { detailReplies.value = []; } finally { detailRepliesLoading.value = false; }
  }
}
function refreshDetail() {
  if (!detailItem.value) return;
  const fresh = items.value.find((x: any) => x.id === detailItem.value.id);
  if (fresh) detailItem.value = fresh;
  else detailDlg.value = false;
}

// --- Thao tac kiem duyet (xong reload + toast) ---
const actionBusy = ref(false);
async function doApprove(it: any) {
  actionBusy.value = true;
  try {
    await api.post(`/admin/comments/${it.id}/approve`, {});
    toast.add({ severity: 'success', summary: 'Đã duyệt bình luận', life: 2500 });
    await load(meta.value.page);
    refreshDetail();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { actionBusy.value = false; }
}

const rejectDlg = ref(false);
const rejectTarget = ref<any>(null);
const rejectReason = ref('');
function openReject(it: any) { rejectTarget.value = it; rejectReason.value = ''; rejectDlg.value = true; }
async function saveReject() {
  if (!rejectTarget.value || !rejectReason.value.trim()) return;
  actionBusy.value = true;
  try {
    await api.post(`/admin/comments/${rejectTarget.value.id}/reject`, { reason: rejectReason.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã từ chối bình luận', life: 2500 });
    rejectDlg.value = false;
    await load(meta.value.page);
    refreshDetail();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { actionBusy.value = false; }
}

const hideDlg = ref(false);
const hideTarget = ref<any>(null);
const hideReason = ref('');
function openHide(it: any) { hideTarget.value = it; hideReason.value = ''; hideDlg.value = true; }
async function saveHide() {
  if (!hideTarget.value) return;
  actionBusy.value = true;
  try {
    await api.post(`/admin/comments/${hideTarget.value.id}/hide`, { reason: hideReason.value.trim() || undefined });
    toast.add({ severity: 'success', summary: 'Đã ẩn bình luận', life: 2500 });
    hideDlg.value = false;
    await load(meta.value.page);
    refreshDetail();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { actionBusy.value = false; }
}

const replyDlg = ref(false);
const replyTarget = ref<any>(null);
const replyBody = ref('');
function openReply(it: any) { replyTarget.value = it; replyBody.value = ''; replyDlg.value = true; }
async function saveReply() {
  if (!replyTarget.value || !replyBody.value.trim()) return;
  actionBusy.value = true;
  try {
    await api.post(`/admin/comments/${replyTarget.value.id}/reply`, { body: replyBody.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã gửi trả lời', life: 2500 });
    replyDlg.value = false;
    await load(meta.value.page);
    refreshDetail();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { actionBusy.value = false; }
}

const banDlg = ref(false);
const banTarget = ref<any>(null);
function openBan(it: any) { banTarget.value = it; banDlg.value = true; }
async function saveBan() {
  if (!banTarget.value) return;
  actionBusy.value = true;
  try {
    await api.post(`/admin/comments/${banTarget.value.id}/ban-author`, {});
    toast.add({ severity: 'success', summary: 'Đã khóa người bình luận', life: 2500 });
    banDlg.value = false;
    await load(meta.value.page);
    refreshDetail();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { actionBusy.value = false; }
}

const hideAllDlg = ref(false);
const hideAllTarget = ref<any>(null);
const hideAllCount = ref(0);
const hideAllTruncated = ref(false);
const hideAllLoading = ref(false);
async function openHideAll(it: any) {
  hideAllTarget.value = it;
  hideAllCount.value = 0;
  hideAllTruncated.value = false;
  hideAllLoading.value = true;
  hideAllDlg.value = true;
  // Dem binh luan APPROVED cua dung userId nay: API khong co loc theo
  // tac gia nen tai 100 dong approved roi loc client-side theo userId.
  try {
    const r = await api.get<any>('/admin/comments', { status: 'approved', limit: 100 });
    const mine = (r.data || []).filter((c: any) => c.userId && c.userId === it.userId);
    hideAllCount.value = mine.length;
    hideAllTruncated.value = (r.total || 0) > 100;
  } catch {
    hideAllCount.value = 0;
  } finally { hideAllLoading.value = false; }
}
async function saveHideAll() {
  if (!hideAllTarget.value) return;
  actionBusy.value = true;
  try {
    const r = await api.post<any>(`/admin/comments/${hideAllTarget.value.id}/hide-all-by-author`, {});
    toast.add({ severity: 'success', summary: `Đã ẩn ${r?.hiddenCount ?? hideAllCount.value} bình luận`, life: 2500 });
    hideAllDlg.value = false;
    await load(meta.value.page);
    refreshDetail();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { actionBusy.value = false; }
}

// --- Tab Cai dat (chi comments:publish) ---
const settingsLoading = ref(false);
const settingsSaving = ref(false);
const settingsTurnstileKeyConfigured = ref<boolean | null>(null);
const settingsForm = ref<any>(null);
async function loadSettings() {
  settingsLoading.value = true;
  try {
    const r = await api.get<any>('/admin/comments/settings');
    settingsTurnstileKeyConfigured.value = !!r.turnstileKeyConfigured;
    settingsForm.value = {
      enabled: !!r.enabled,
      moderationMode: r.moderationMode || 'pre',
      turnstileEnabled: !!r.turnstileEnabled,
      requirePhoneVerified: !!r.requirePhoneVerified,
      maxLength: r.maxLength ?? 1000,
      dailyLimit: r.dailyLimit ?? 20,
      ipDailyLimit: r.ipDailyLimit ?? 200,
      ipBurstLimit: r.ipBurstLimit ?? 20,
    };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e) || 'Không tải được cài đặt', life: 3000 });
  } finally { settingsLoading.value = false; }
}
async function saveSettings() {
  if (!settingsForm.value) return;
  const f = settingsForm.value;
  const nums = [f.maxLength, f.dailyLimit, f.ipDailyLimit, f.ipBurstLimit];
  if (nums.some((n: any) => n === null || n === undefined || Number(n) < 0 || !Number.isInteger(Number(n)))) {
    toast.add({ severity: 'warn', summary: 'Số chưa hợp lệ', detail: 'Các giới hạn phải là số nguyên ≥ 0', life: 3000 });
    return;
  }
  settingsSaving.value = true;
  try {
    const r = await api.put<any>('/admin/comments/settings', {
      enabled: !!f.enabled,
      moderationMode: f.moderationMode,
      turnstileEnabled: !!f.turnstileEnabled,
      requirePhoneVerified: !!f.requirePhoneVerified,
      maxLength: Number(f.maxLength),
      dailyLimit: Number(f.dailyLimit),
      ipDailyLimit: Number(f.ipDailyLimit),
      ipBurstLimit: Number(f.ipBurstLimit),
    });
    settingsTurnstileKeyConfigured.value = !!r.turnstileKeyConfigured;
    toast.add({ severity: 'success', summary: 'Đã lưu cài đặt bình luận', life: 2500 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e), life: 3000 });
  } finally { settingsSaving.value = false; }
}
watch(tab, (v) => {
  if (v === 'settings' && canPublish.value && !settingsForm.value) loadSettings();
});

onMounted(() => {
  loadArticles('');
  applyQuery();
});
</script>
