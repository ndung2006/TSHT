<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-neutral-400">Tổng: {{ meta.total }} bài viết</p>
      <div class="flex gap-2">
        <Button v-if="can('category:create') || can('category:update')" label="Chuyên mục" icon="pi pi-folder"
          severity="secondary" @click="openCatDlg" />
        <Button v-if="can('articles:create')" label="Thêm bài viết" icon="pi pi-plus" @click="openAdd" />
      </div>
    </div>

    <div class="surface-card p-4 flex flex-wrap gap-2">
      <InputText v-model="q" placeholder="Tìm tiêu đề / sapo..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
      <Dropdown v-model="catFilter" :options="catFilterOptions" option-label="label" option-value="value"
        placeholder="Tất cả chuyên mục" class="w-56" show-clear @change="load(1)" />
      <Dropdown v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
        placeholder="Tất cả trạng thái" class="w-48" show-clear @change="load(1)" />
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total" lazy
        :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Chuyên mục" style="min-width:9rem">
          <template #body="{ data }">{{ data.category?.name || '—' }}</template>
        </Column>
        <Column header="Trạng thái" style="min-width:10rem">
          <template #body="{ data }">{{ statusText(data) }}</template>
        </Column>
        <Column header="Nổi bật" style="width:7rem">
          <template #body="{ data }"><Tag :value="data.isFeatured ? 'Có' : 'Không'" :severity="data.isFeatured ? 'success' : 'secondary'" /></template>
        </Column>
        <Column header="Định dạng" style="min-width:8rem">
          <template #body="{ data }">{{ contentTypeLabel(data.contentType) }}</template>
        </Column>
        <Column header="Sửa đổi gần nhất" style="min-width:13rem">
          <template #body="{ data }">{{ lastEditText(data) }}</template>
        </Column>
        <Column header="Duyệt gần nhất" style="min-width:11rem">
          <template #body="{ data }">{{ lastApprovalText(data) }}</template>
        </Column>
        <Column header="Thao tác" style="min-width:20rem">
          <template #body="{ data }">
            <Button v-if="can('articles:update')" label="Sửa" size="small" text @click="openEdit(data)" />
            <Button v-if="can('articles:update') && data.status === 'draft'" label="Gửi duyệt" size="small" text
              severity="info" @click="submitItem(data)" />
            <Button v-if="can('articles:publish') && data.status === 'pending_review'" label="Duyệt" size="small" text
              severity="success" @click="approveItem(data)" />
            <Button v-if="can('articles:publish') && data.status === 'pending_review'" label="Trả lại" size="small" text
              severity="warn" @click="openReturn(data)" />
            <Button v-if="can('articles:publish') && ((data.status === 'draft' && isFullAdmin) || data.status === 'unpublished')" label="Xuất bản" size="small" text
              severity="success" @click="publishItem(data)" />
            <Button v-if="can('articles:publish') && data.status === 'published'" label="Gỡ xuống" size="small" text
              severity="warn" @click="unpublishItem(data)" />
            <Button v-if="can('articles:delete') && (data.status === 'draft' || data.status === 'unpublished')" label="Xóa" size="small" text
              severity="danger" @click="removeItem(data)" />
            <Button v-if="can('articles:view')" label="Lịch sử duyệt" size="small" text @click="openHistory(data)" />
          </template>
        </Column>
      </DataTable>
      <p class="mt-2 text-xs text-neutral-500">Bài đặt giờ xuất bản tương lai hiển thị "Chờ xuất bản" và tự
        hiện công khai khi tới giờ (không cần chạy thêm tác vụ). Quy trình duyệt: Gửi duyệt → TP (Trưởng phòng)
        → PBĐT (Phó Ban điện tử) → BBT (Ban biên tập) → XB (Xuất bản, duyệt bước cuối = xuất bản). Mỗi bước
        chỉ Role trùng tên bước hoặc tài khoản toàn quyền mới duyệt được; bài nháp chỉ toàn quyền mới xuất bản
        trực tiếp được. Tên Role trong CMS phải giữ nguyên viết tắt (khóa chặn bước).</p>
    </div>

    <!-- Form bai viet -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Sửa bài viết' : 'Thêm bài viết'" class="w-full max-w-4xl">
      <div class="flex flex-col gap-3">
        <div><label class="field-label">Tiêu đề *</label><InputText v-model="form.title" class="w-full" /></div>
        <div><label class="field-label">Slug (để trống = tự sinh từ tiêu đề)</label><InputText v-model="form.slug" class="w-full" /></div>
        <div>
          <label class="field-label">Sapo (tóm tắt, tối đa 500 ký tự) — {{ form.sapo.length }}/500</label>
          <Textarea v-model="form.sapo" rows="3" class="w-full" maxlength="500" />
        </div>
        <div><label class="field-label">Nội dung</label>
          <Editor ref="editorRef" v-model="form.body" editor-style="height: 320px" @load="onEditorLoad" />
          <div class="flex flex-wrap items-center gap-2 mt-2">
            <Button label="Chèn ảnh từ thư viện" icon="pi pi-images" size="small" severity="secondary" @click="openLib" />
            <span class="text-xs text-neutral-500">Ảnh chèn từ thư viện là URL đã host (không nhúng base64). Nút ảnh trên thanh công cụ vẫn tải file như cũ; ảnh base64 sẽ được chuyển thành URL khi lưu.</span>
          </div>
        </div>
        <div><label class="field-label">Chuyên mục</label>
          <Dropdown v-model="form.categoryId" :options="catOptions" option-label="label" option-value="value"
            placeholder="Chưa chọn chuyên mục" class="w-full" show-clear />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label class="field-label">Định dạng nội dung (Dot 1a: mọi loại dùng chung một form; form riêng theo loại để Dot 2)</label>
            <Dropdown v-model="form.contentType" :options="contentTypeOptions" option-label="label" option-value="value" class="w-full" />
          </div>
          <div><label class="field-label">Nhãn tin địa phương (chọn một cách duy nhất: trường này)</label>
            <InputText v-model="form.localNews" class="w-full" placeholder="VD: Tuyên Quang" />
          </div>
        </div>
        <div class="flex flex-wrap gap-4 pb-1">
          <div class="flex items-center gap-2"><Checkbox v-model="form.isSpotlight" binary input-id="spot" />
            <label for="spot">Tiêu điểm (lên cột Tiêu điểm)</label>
          </div>
          <div class="flex items-center gap-2"><Checkbox v-model="form.isPhoto" binary input-id="photo" />
            <label for="photo">Tin ảnh</label>
          </div>
          <div class="flex items-center gap-2"><Checkbox v-model="form.isInfographic" binary input-id="info" />
            <label for="info">Infographic</label>
          </div>
          <div class="flex items-center gap-2"><Checkbox v-model="form.allowComments" binary input-id="cmt" />
            <label for="cmt">Cho phép bình luận</label>
          </div>
        </div>
        <div><label class="field-label">Ảnh bìa</label><ImagePicker v-model="form.coverPath" ratio="16/9" /></div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label class="field-label">Tác giả (nhiều người cách nhau bằng dấu phẩy)</label><InputText v-model="authorsText" class="w-full" /></div>
          <div><label class="field-label">Từ khóa (cách nhau bằng dấu phẩy)</label><InputText v-model="tagsText" class="w-full" /></div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label class="field-label">Hẹn giờ xuất bản (giờ Việt Nam, để trống = ngay khi bấm Xuất bản)</label>
            <InputText v-model="publishAtText" type="datetime-local" class="w-full" />
          </div>
          <div class="flex items-end gap-2 pb-1"><Checkbox v-model="form.isFeatured" binary input-id="feat" />
            <label for="feat">Tin nổi bật (lên khối Tin nổi bật ở trang chủ)</label>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Hủy" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Tạo'" :loading="saving" @click="save"
          :disabled="!form.title.trim() || form.sapo.length > 500" />
      </template>
    </Dialog>

    <!-- Chon anh tu thu vien media (Dot 1a) -->
    <Dialog v-model:visible="libDlg" modal header="Chọn ảnh từ thư viện" class="w-full max-w-3xl">
      <div class="flex gap-2 mb-3">
        <InputText v-model="libQ" placeholder="Tìm tên file..." class="flex-1" @keyup.enter="loadLib(1)" />
        <Button label="Tìm" size="small" @click="loadLib(1)" />
      </div>
      <div v-if="libLoading" class="text-sm text-neutral-400">Đang tải...</div>
      <div v-else-if="!libItems.length" class="text-sm text-neutral-400">Chưa có ảnh nào trong thư viện.</div>
      <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60dvh] overflow-y-auto pr-1">
        <button v-for="im in libItems" :key="im.id" type="button" class="text-left group" @click="pickLib(im)">
          <span class="block aspect-square rounded-lg overflow-hidden bg-neutral-800">
            <img :src="resolveMedia(im.url)" class="w-full h-full object-cover" :alt="im.filename" loading="lazy" />
          </span>
          <span class="block text-[11px] text-neutral-400 truncate mt-1 group-hover:text-neutral-200">{{ im.filename }}</span>
        </button>
      </div>
      <div class="flex items-center justify-between mt-3">
        <span class="text-xs text-neutral-400">Trang {{ libMeta.page }} — tổng {{ libMeta.total }} ảnh</span>
        <span class="flex gap-2">
          <Button label="Trước" size="small" text :disabled="libMeta.page <= 1" @click="loadLib(libMeta.page - 1)" />
          <Button label="Sau" size="small" text :disabled="libMeta.page * libMeta.limit >= libMeta.total" @click="loadLib(libMeta.page + 1)" />
        </span>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="libDlg = false" />
      </template>
    </Dialog>

    <!-- Quan ly chuyen muc -->
    <Dialog v-model:visible="catDlg" modal header="Chuyên mục tin bài" class="w-full max-w-2xl">
      <div class="flex flex-col gap-3">
        <DataTable :value="cats" size="small">
          <Column field="name" header="Tên" />
          <Column header="Chuyên mục cha"><template #body="{ data }">{{ parentName(data.parentId) }}</template></Column>
          <Column field="slug" header="Slug" class="text-xs" />
          <Column header="Hiện" style="width:6rem">
            <template #body="{ data }"><Tag :value="data.isVisible ? 'Hiện' : 'Ẩn'" :severity="data.isVisible ? 'success' : 'secondary'" /></template>
          </Column>
          <Column header="Thao tác" style="min-width:8rem">
            <template #body="{ data }">
              <Button v-if="can('category:update')" label="Sửa" size="small" text @click="openCatEdit(data)" />
              <Button v-if="can('category:delete')" label="Xóa" size="small" text severity="danger" @click="removeCat(data)" />
            </template>
          </Column>
        </DataTable>
        <div class="border-t border-neutral-800 pt-3 flex flex-col gap-2">
          <p class="text-sm font-medium">{{ catEditing ? 'Sửa chuyên mục' : 'Thêm chuyên mục' }}</p>
          <InputText v-model="catForm.name" placeholder="Tên chuyên mục *" class="w-full" />
          <InputText v-model="catForm.slug" placeholder="Slug (để trống = tự sinh)" class="w-full" />
          <Dropdown v-model="catForm.parentId" :options="catParentOptions" option-label="label" option-value="value"
            placeholder="Chuyên mục cha (để trống = cấp 1)" class="w-full" show-clear />
          <div class="flex gap-2">
            <InputText v-model.number="catForm.sortOrder" type="number" placeholder="Thứ tự" class="w-32" />
            <div class="flex items-center gap-2"><Checkbox v-model="catForm.isVisible" binary input-id="catvis" />
              <label for="catvis">Hiển thị công khai</label>
            </div>
            <Button :label="catEditing ? 'Lưu' : 'Thêm'" size="small" @click="saveCat" :disabled="!catForm.name.trim()" />
            <Button v-if="catEditing" label="Hủy sửa" size="small" text @click="resetCatForm" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="catDlg = false" />
      </template>
    </Dialog>

    <!-- Tra lai bai (bat buoc ly do) -->
    <Dialog v-model:visible="returnDlg" modal header="Trả lại bài viết" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Trả lại bài "{{ returnTarget?.title }}" về nháp. Người viết sẽ thấy lý do này.</p>
        <Textarea v-model="returnReason" rows="3" class="w-full" placeholder="Lý do trả lại *" />
      </div>
      <template #footer>
        <Button label="Hủy" text @click="returnDlg = false" />
        <Button label="Trả lại" severity="warn" :disabled="!returnReason.trim()" @click="saveReturn" />
      </template>
    </Dialog>

    <!-- Ngoai le tin nong (tach nhiem vu, Dot 1b) -->
    <Dialog v-model:visible="excDlg" modal header="Duyệt với ngoại lệ tin nóng" class="w-full max-w-lg">
      <div class="flex flex-col gap-2">
        <p class="text-sm">Bạn đã xử lý bước trước của bài "{{ excTarget?.title }}" nên quy tắc tách nhiệm vụ chặn lượt duyệt này. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
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
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Tin bài - VTC ANY CMS' });

const { can, permissions } = useCmsAuth();
const api = useApi();
const toast = useToast();

// Tai khoan toan quyen (map quyen '*') duoc xuat ban truc tiep tu nhap;
// tai khoan thuong phai di qua quy trinh duyet (server chan neu sai).
const isFullAdmin = computed(() => permissions.value.includes('*'));

const items = ref<any[]>([]);
const meta = ref({ total: 0, page: 1, limit: 20 });
const loading = ref(false);
const q = ref('');
const catFilter = ref('');
const statusFilter = ref('');
const cats = ref<any[]>([]);

const statusOptions = [
  { label: 'Nháp', value: 'draft' },
  { label: 'Chờ duyệt', value: 'pending_review' },
  { label: 'Đã xuất bản', value: 'published' },
  { label: 'Hạ xuất bản', value: 'unpublished' },
];

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
function parentName(parentId: string | null) {
  if (!parentId) return '—';
  return cats.value.find((c) => c.id === parentId || c.publicId === parentId)?.name || '—';
}
const catOptions = computed(() => {
  const byId = new Map(cats.value.map((c) => [c.id, c]));
  return cats.value.map((c) => {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    return { label: parent ? `${parent.name} / ${c.name}` : c.name, value: c.publicId };
  });
});
const catFilterOptions = computed(() => [{ label: 'Tất cả chuyên mục', value: '' }, ...catOptions.value]);
const catParentOptions = computed(() => cats.value
  .filter((c) => !c.parentId)
  .map((c) => ({ label: c.name, value: c.publicId })));

async function loadCats() {
  try { cats.value = await api.get<any[]>('/admin/news-categories') || []; }
  catch { cats.value = []; }
}
async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/news', {
      q: q.value || undefined, status: statusFilter.value || undefined,
      categoryId: catFilter.value || undefined, page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
}
function onPage(e: any) { load(Math.floor(e.first / e.rows) + 1); }

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
// Dot 1a: dinh dang + co hien thi + nhan tin dia phuong (moi loai bai tam
// dung chung mot form; form rieng theo loai de Dot 2).
const contentTypeOptions = [
  { label: 'Bài viết', value: 'text' },
  { label: 'Video', value: 'video' },
  { label: 'Audio / Podcast', value: 'audio' },
  { label: 'Chùm ảnh', value: 'gallery' },
  { label: 'Infographic', value: 'infographic' },
  { label: 'Emagazine / Longform', value: 'emagazine' },
];
function contentTypeLabel(v: string | null | undefined) {
  return contentTypeOptions.find((o) => o.value === (v || 'text'))?.label || 'Bài viết';
}
const form = ref({
  title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '', isFeatured: false,
  contentType: 'text', isSpotlight: false, isPhoto: false, isInfographic: false, allowComments: true, localNews: '',
});
const authorsText = ref('');
const tagsText = ref('');
const publishAtText = ref('');

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
function splitList(s: string) {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}
function openAdd() {
  editing.value = null;
  form.value = {
    title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '', isFeatured: false,
    contentType: 'text', isSpotlight: false, isPhoto: false, isInfographic: false, allowComments: true, localNews: '',
  };
  authorsText.value = '';
  tagsText.value = '';
  publishAtText.value = '';
  dlg.value = true;
}
function openEdit(it: any) {
  editing.value = it;
  form.value = {
    title: it.title || '', slug: it.slug || '', sapo: it.sapo || '', body: it.body || '',
    categoryId: it.category?.publicId || '', coverPath: it.coverPath || '', isFeatured: !!it.isFeatured,
    contentType: it.contentType || 'text', isSpotlight: !!it.isSpotlight, isPhoto: !!it.isPhoto,
    isInfographic: !!it.isInfographic, allowComments: it.allowComments !== false, localNews: it.localNews || '',
  };
  authorsText.value = (it.authors || []).join(', ');
  tagsText.value = (it.tags || []).join(', ');
  publishAtText.value = isoToLocalInput(it.publishAt);
  dlg.value = true;
}
// --- Chen anh tu thu vien media (Dot 1a) ---
// PrimeVue Editor phat event @load kem Quill instance. Chen them 1 nut
// "Thu vien" vao toolbar Quill (ben canh nut anh mac dinh) de bien tap
// vien chon anh da host thay vi tai file -> base64. Nut duoi editor la
// du phong neu toolbar tuy bien that bai. Chen bang URL host, KHONG bao
// gio nhung base64 vao noi dung.
const editorRef = ref<any>(null);
const editorQuill = ref<any>(null);
// URL media dang tuong doi (/images/...) thuoc ve backend: hien thi phai
// ghep voi origin cua apiBase (giong ImagePicker), neu khong trinh duyet
// hieu thanh cms origin -> 404. Gia tri chen vao bai giu nguyen url goc.
function resolveMedia(u: string) {
  if (!u) return '';
  if (/^(https?:)?\/\//.test(u) || u.startsWith('data:')) return u;
  if (!u.startsWith('/')) return u;
  try { return new URL(useRuntimeConfig().public.apiBase as string).origin + u; } catch { return u; }
}
const libDlg = ref(false);
const libItems = ref<any[]>([]);
const libMeta = ref({ total: 0, page: 1, limit: 20 });
const libLoading = ref(false);
const libQ = ref('');
function onEditorLoad(e: any) {
  const quill = e?.instance;
  if (!quill) return;
  editorQuill.value = quill;
  try {
    const toolbar = quill.getModule('toolbar')?.container;
    if (toolbar && !toolbar.querySelector('.cms-lib-btn')) {
      const span = document.createElement('span');
      span.className = 'ql-formats';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cms-lib-btn';
      btn.title = 'Chèn ảnh từ thư viện';
      btn.innerHTML = '<i class="pi pi-images"></i>';
      btn.addEventListener('click', () => openLib());
      span.appendChild(btn);
      toolbar.appendChild(span);
    }
  } catch { /* toolbar tuy bien that bai: nut duoi editor van dung duoc */ }
}
async function loadLib(page = 1) {
  libLoading.value = true;
  try {
    const r = await api.get<any>('/admin/media', { kind: 'image', q: libQ.value || undefined, page, limit: libMeta.value.limit });
    libItems.value = r.data || [];
    libMeta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được thư viện', life: 3000 });
  } finally { libLoading.value = false; }
}
function openLib() {
  libDlg.value = true;
  loadLib(1);
}
function pickLib(item: any) {
  // Chen URL DA RESOLVE (tuyet doi, origin backend) chu khong chen url
  // tho tu API: url tho la tuong doi (/images/...) khi backend khong set
  // VOD_PUBLIC_BASE_URL; chen tho vao bai thi trinh duyet hieu thanh
  // cms origin -> 404 -> icon hong ben vung ca sau khi Luu (da chung
  // minh bang bai nhap test 2026-10-28). resolveMedia da co san trong
  // file nay, dung cho ca duong insert chinh lan fallback.
  const url = resolveMedia(item?.url);
  if (!url) {
    toast.add({ severity: 'warn', summary: 'Ảnh này chưa có URL dùng được', life: 3000 });
    return;
  }
  libDlg.value = false;
  // Cung hoa chen anh (Dot 1b + va sau chan doan 2026-10-28): hoan insert
  // toi sau khi hop thu vien dong han (tranh race focus/modal cua
  // PrimeVue Dialog). Duong chinh lay instance Quill DANG SONG tu ref
  // cua component tai thoi diem insert, thay vi dung editorQuill bat tu
  // @load — vi @load khong giu duoc instance song (nut .cms-lib-btn
  // tao trong onEditorLoad chua tung xuat hien) nen insert cu chet im.
  // Chen TRUOC newline cuoi: getLength() da tinh '\n' cuoi tai lieu,
  // chen tai getLength() de bi Quill chuan hoa mat. Khong nhung
  // base64 moi.
  const doInsert = () => {
    // PrimeVue Editor expose .quill tren component instance; neu khong
    // co thi suy bien an toan ve editorQuill cu (duong cu, co the chet
    // nhu truoc, nhung khong lam hong gi them).
    const quill = (editorRef.value as any)?.quill || editorQuill.value;
    try {
      if (quill) {
        quill.focus();
        const range = quill.getSelection();
        const index = range ? range.index : Math.max(0, quill.getLength() - 1);
        quill.insertEmbed(index, 'image', url, 'user');
        quill.setSelection(index + 1, 0, 'silent');
        form.value.body = quill.root.innerHTML;
        return;
      }
    } catch { /* roi xuong fallback append + ep render */ }
    // Fallback: append vao model ROI ep editor render lai bang Quill API
    // (thay v-model tu ben ngoai khong lam PrimeVue 4 + Quill 2 hien
    // thi lai — loi renderValue da biet). 'silent' de khong phat
    // text-change trung; sau do sync tay form.body tu DOM Quill.
    const next = `${form.value.body || ''}<p><img src="${url}"></p>`;
    form.value.body = next;
    try {
      const q = (editorRef.value as any)?.quill || editorQuill.value;
      if (q) {
        q.setContents(q.clipboard.convert({ html: next }), 'silent');
        form.value.body = q.root.innerHTML;
      }
    } catch { /* giu nguyen model; luc Luu van gui kem anh */ }
  };
  nextTick(() => { setTimeout(doInsert, 50); });
}

// --- Anh inline trong than bai ---
// Editor (Quill) chen anh dang base64 (data:) thang vao HTML. Backend
// gioi han JSON 256kb (main.ts) nen bai co anh base64 lon se lam POST
// that bai (loi 2026-10-27: tao bai co anh inline that bai 7 lan, xoa
// anh thi tao duoc ngay). Truoc khi luu, tai tung anh base64 len
// /uploads/image (stream nhi phan, khong qua JSON parser, giong anh
// bia) roi thay src bang URL host. Anh da host (/images/..., http...)
// giu nguyen, khong tai lai. Loi tai anh thi dung luu, giu nguyen
// form de nguoi dung thu lai, khong mat noi dung.
async function uploadInlineImages(html: string): Promise<string> {
  if (!html || !html.includes('data:image/')) return html;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const imgs = Array.from(doc.querySelectorAll('img')).filter((im) => (im.getAttribute('src') || '').startsWith('data:image/'));
  for (let i = 0; i < imgs.length; i++) {
    const im = imgs[i];
    const src = im.getAttribute('src') || '';
    const m = /^data:(image\/[a-z+]+);base64,/.exec(src);
    const ext = (m?.[1]?.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const blob = await (await fetch(src)).blob();
    const res = await api.put<any>('/uploads/image', blob, {
      'Content-Type': blob.type || m?.[1] || 'image/jpeg',
      'x-file-name': encodeURIComponent(`noi-dung-${Date.now()}-${i + 1}.${ext}`),
    });
    if (!res?.url) throw new Error('Không tải được ảnh trong bài lên máy chủ');
    im.setAttribute('src', res.url);
  }
  return doc.body.innerHTML;
}
async function save() {
  saving.value = true;
  try {
    form.value.body = await uploadInlineImages(form.value.body);
    const payload: any = {
      title: form.value.title.trim(),
      slug: form.value.slug.trim() || undefined,
      sapo: form.value.sapo,
      body: form.value.body,
      categoryId: form.value.categoryId || null,
      coverPath: form.value.coverPath || null,
      authors: splitList(authorsText.value),
      tags: splitList(tagsText.value),
      publishAt: localInputToIso(publishAtText.value),
      isFeatured: form.value.isFeatured,
      contentType: form.value.contentType,
      isSpotlight: form.value.isSpotlight,
      isPhoto: form.value.isPhoto,
      isInfographic: form.value.isInfographic,
      allowComments: form.value.allowComments,
      localNews: form.value.localNews.trim() || null,
    };
    if (editing.value) await api.patch(`/admin/news/${editing.value.publicId}`, payload);
    else await api.post('/admin/news', payload);
    toast.add({ severity: 'success', summary: editing.value ? 'Đã lưu bài viết' : 'Đã tạo bài viết (nháp)', life: 2500 });
    dlg.value = false;
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Lưu thất bại', life: 3000 });
  } finally { saving.value = false; }
}
async function publishItem(it: any) {
  try {
    await api.post(`/admin/news/${it.publicId}/publish`, {});
    toast.add({ severity: 'success', summary: 'Đã xuất bản', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xuất bản thất bại', life: 3000 });
  }
}
async function unpublishItem(it: any) {
  try {
    await api.post(`/admin/news/${it.publicId}/unpublish`, {});
    toast.add({ severity: 'success', summary: 'Đã gỡ xuống', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Gỡ xuống thất bại', life: 3000 });
  }
}
async function removeItem(it: any) {
  if (!window.confirm(`Xóa bài "${it.title}"?`)) return;
  try {
    await api.del(`/admin/news/${it.publicId}`);
    toast.add({ severity: 'success', summary: 'Đã xóa', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}

// --- Quy trinh duyet ---
async function submitItem(it: any) {
  try {
    await api.post(`/admin/news/${it.publicId}/submit`);
    toast.add({ severity: 'success', summary: 'Đã gửi duyệt', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Gửi duyệt thất bại', life: 3000 });
  }
}
async function approveItem(it: any) {
  try {
    const r = await api.post<any>(`/admin/news/${it.publicId}/approve`);
    toast.add({ severity: 'success', summary: r?.status === 'published' ? 'Đã duyệt xong và xuất bản' : 'Đã duyệt, chuyển bước tiếp theo', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    const msg = e?.response?.data?.message || e?.message || '';
    // Tach nhiem vu (Dot 1b): server chan khi nguoi duyet trung nguoi xu ly
    // buoc truoc — mo dialog ngoai le tin nong de duyet tiep co ghi log.
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
    const r = await api.post<any>(`/admin/news/${excTarget.value.publicId}/approve`, { breakingNews: true, breakingNewsReason: excReason.value.trim() || undefined });
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
    await api.post(`/admin/news/${returnTarget.value.publicId}/return`, { reason: returnReason.value.trim() });
    toast.add({ severity: 'success', summary: 'Đã trả lại bài viết', life: 2500 });
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
    const r = await api.get<any>(`/admin/news/${it.publicId}/approvals`);
    histItems.value = r.data || [];
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được lịch sử duyệt', life: 3000 });
  }
}

// --- Chuyen muc ---
const catDlg = ref(false);
const catEditing = ref<any>(null);
const catForm = ref({ name: '', slug: '', parentId: '', sortOrder: 0, isVisible: true });
function resetCatForm() {
  catEditing.value = null;
  catForm.value = { name: '', slug: '', parentId: '', sortOrder: 0, isVisible: true };
}
async function openCatDlg() {
  await loadCats();
  resetCatForm();
  catDlg.value = true;
}
function openCatEdit(c: any) {
  catEditing.value = c;
  catForm.value = {
    name: c.name || '', slug: c.slug || '',
    parentId: cats.value.find((x) => x.id === c.parentId)?.publicId || '',
    sortOrder: c.sortOrder || 0, isVisible: c.isVisible !== false,
  };
}
async function saveCat() {
  try {
    const payload: any = {
      name: catForm.value.name.trim(),
      slug: catForm.value.slug.trim() || undefined,
      parentId: catForm.value.parentId || null,
      sortOrder: Number(catForm.value.sortOrder) || 0,
      isVisible: catForm.value.isVisible,
    };
    if (catEditing.value) await api.patch(`/admin/news-categories/${catEditing.value.publicId}`, payload);
    else await api.post('/admin/news-categories', payload);
    toast.add({ severity: 'success', summary: 'Đã lưu chuyên mục', life: 2500 });
    await loadCats();
    resetCatForm();
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Lưu chuyên mục thất bại', life: 3000 });
  }
}
async function removeCat(c: any) {
  if (!window.confirm(`Xóa chuyên mục "${c.name}"?`)) return;
  try {
    await api.del(`/admin/news-categories/${c.publicId}`);
    toast.add({ severity: 'success', summary: 'Đã xóa chuyên mục', life: 2500 });
    await loadCats();
    load(meta.value.page);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Xóa thất bại', life: 3000 });
  }
}

loadCats();
load(1);
</script>
