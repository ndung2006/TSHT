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
        <div><label class="field-label">Nội dung</label><Editor v-model="form.body" editor-style="height: 320px" /></div>
        <div><label class="field-label">Chuyên mục</label>
          <Dropdown v-model="form.categoryId" :options="catOptions" option-label="label" option-value="value"
            placeholder="Chưa chọn chuyên mục" class="w-full" show-clear />
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

    <!-- Lich su duyet -->
    <Dialog v-model:visible="histDlg" modal :header="`Lịch sử duyệt — ${histTarget?.title || ''}`" class="w-full max-w-2xl">
      <DataTable :value="histItems" size="small">
        <Column field="actionLabel" header="Hành động" style="min-width:8rem" />
        <Column field="stepLabel" header="Bước" style="min-width:12rem" />
        <Column field="actorRole" header="Vai trò" style="min-width:8rem" />
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
const form = ref({ title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '', isFeatured: false });
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
  form.value = { title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '', isFeatured: false };
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
  };
  authorsText.value = (it.authors || []).join(', ');
  tagsText.value = (it.tags || []).join(', ');
  publishAtText.value = isoToLocalInput(it.publishAt);
  dlg.value = true;
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
    await api.delete(`/admin/news/${it.publicId}`);
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
    await api.delete(`/admin/news-categories/${c.publicId}`);
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
