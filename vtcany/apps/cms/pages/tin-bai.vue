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

    <div class="surface-card p-4 flex flex-wrap items-center gap-2">
      <span class="text-sm text-neutral-400">Lọc nhanh:</span>
      <Button v-for="l in statusLinks" :key="l.key" :label="`${l.label} (${counts[l.key] ?? 0})`" size="small"
        :severity="statusFilter === l.value ? undefined : 'secondary'" :text="statusFilter !== l.value"
        @click="applyStatusLink(l.value)" />
    </div>

    <div class="surface-card p-4 flex flex-wrap gap-2">
      <InputText v-model="q" placeholder="Tìm tiêu đề / sapo..." class="flex-1 min-w-52" @keyup.enter="load(1)" />
      <Dropdown v-model="catFilter" :options="catFilterOptions" option-label="label" option-value="value"
        placeholder="Tất cả chuyên mục" class="w-56" show-clear @change="load(1)" />
      <Dropdown v-model="authorFilter" :options="authorFilterOptions" option-label="label" option-value="value"
        placeholder="Tất cả tác giả" class="w-48" show-clear @change="load(1)" />
      <Dropdown v-model="statusFilter" :options="statusOptions" option-label="label" option-value="value"
        placeholder="Tất cả trạng thái" class="w-48" show-clear @change="load(1)" />
      <Dropdown v-model="contentTypeFilter" :options="contentTypeFilterOptions" option-label="label" option-value="value"
        placeholder="Tất cả loại bài" class="w-48" show-clear @change="load(1)" />
      <span class="text-sm self-center">Từ ngày</span>
      <input v-model="dateFrom" type="date" class="p-inputtext p-component w-40" @change="load(1)" />
      <span class="text-sm self-center">Đến ngày</span>
      <input v-model="dateTo" type="date" class="p-inputtext p-component w-40" @change="load(1)" />
      <Button label="Tìm" size="small" @click="load(1)" />
    </div>

    <div class="surface-card p-4">
      <DataTable :value="items" :loading="loading" paginator :rows="20" :total-records="meta.total" lazy
        :first="(meta.page - 1) * meta.limit" @page="onPage" size="small">
        <Column field="title" header="Tiêu đề" />
        <Column header="Chuyên mục" style="min-width:9rem">
          <template #body="{ data }">{{ data.category?.name || '—' }}</template>
        </Column>
        <Column header="Tác giả" style="min-width:10rem">
          <template #body="{ data }">{{ data.authors?.length ? data.authors.join(', ') : '—' }}</template>
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
          <template #body="{ data }">{{ lastActivityText(data) }}</template>
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
            <Button v-if="can('articles:view')" label="Xem duyệt" size="small" text @click="openReview(data)" />
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
          <div><label class="field-label">Định dạng nội dung (mỗi loại có trường nhập riêng bên dưới, 1B)</label>
            <Dropdown v-model="form.contentType" :options="contentTypeOptions" option-label="label" option-value="value" class="w-full" />
          </div>
          <div><label class="field-label">Nhãn tin địa phương (chọn một cách duy nhất: trường này)</label>
            <InputText v-model="form.localNews" class="w-full" placeholder="VD: Tuyên Quang" />
          </div>
        </div>
        <!-- Truong rieng theo dinh dang (Goi 1B). Media luu vao formatData
             (JSONB), khong nhung base64; trang cong khai chi dung media cua
             loai hien tai. Video trong thu vien la HLS can ky nen 1B chua
             chon truc tiep duoc — video dung URL file truc tiep. -->
        <div v-if="form.contentType === 'video'" class="rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <p class="text-sm font-medium">Video chính (định dạng Video)</p>
          <label class="field-label">URL file video trực tiếp (MP4)</label>
          <InputText v-model="formatForm.videoUrl" class="w-full" placeholder="VD: /videos/... hoặc https://..." />
          <p class="text-xs text-neutral-500">Video này hiển thị bằng trình phát ngoài trang công khai; nội dung bên dưới vẫn dùng làm mô tả. Ảnh bìa dùng làm poster.</p>
        </div>
        <div v-if="form.contentType === 'audio'" class="rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <p class="text-sm font-medium">Audio chính (định dạng Audio / Podcast)</p>
          <div class="flex flex-wrap gap-2">
            <Button label="Chọn audio từ thư viện" icon="pi pi-volume-up" size="small" severity="secondary" @click="openLibFor('audio')" />
            <InputText v-model="formatForm.audioUrl" class="flex-1 min-w-52" placeholder="hoặc dán URL file audio..." />
          </div>
          <p class="text-xs text-neutral-500">Audio trong thư viện có URL file dùng được ngay. Audio này hiển thị bằng trình phát ngoài trang công khai.</p>
        </div>
        <div v-if="form.contentType === 'gallery'" class="rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <p class="text-sm font-medium">Chùm ảnh (định dạng Chùm ảnh)</p>
          <div class="flex flex-wrap items-center gap-2">
            <Button label="Thêm ảnh từ thư viện" icon="pi pi-images" size="small" severity="secondary" @click="openLibFor('gallery')" />
            <span class="text-xs text-neutral-500">Ảnh hiển thị dạng lưới ngoài trang công khai. Ảnh chèn trong nội dung vẫn giữ nguyên, không thay thế danh sách này.</span>
          </div>
          <div v-if="formatForm.images.length" class="grid grid-cols-3 sm:grid-cols-4 gap-2">
            <div v-for="(im, i) in formatForm.images" :key="im + '-' + i" class="rounded-lg overflow-hidden bg-neutral-800">
              <img :src="resolveMedia(im)" class="w-full aspect-square object-cover" :alt="`Ảnh ${i + 1}`" loading="lazy" />
              <div class="flex gap-1 p-1">
                <Button icon="pi pi-chevron-up" size="small" text :disabled="i === 0" @click="moveGallery(i, -1)" />
                <Button icon="pi pi-chevron-down" size="small" text :disabled="i === formatForm.images.length - 1" @click="moveGallery(i, 1)" />
                <Button icon="pi pi-times" size="small" text severity="danger" @click="removeGallery(i)" />
              </div>
            </div>
          </div>
          <p v-else class="text-xs text-neutral-400">Chưa có ảnh nào trong chùm ảnh.</p>
        </div>
        <div v-if="form.contentType === 'infographic'" class="rounded-lg border border-neutral-800 p-3 flex flex-col gap-2">
          <p class="text-sm font-medium">Ảnh infographic (định dạng Infographic)</p>
          <div class="flex flex-wrap gap-2">
            <Button label="Chọn ảnh từ thư viện" icon="pi pi-images" size="small" severity="secondary" @click="openLibFor('image')" />
            <InputText v-model="formatForm.imageUrl" class="flex-1 min-w-52" placeholder="hoặc dán URL ảnh..." />
          </div>
          <img v-if="formatForm.imageUrl" :src="resolveMedia(formatForm.imageUrl)" class="w-full max-h-96 object-contain rounded-lg bg-neutral-900" alt="Infographic" />
          <p class="text-xs text-neutral-500">Ảnh này hiển thị khổ lớn ngoài trang công khai; ảnh bìa vẫn dùng làm thumbnail.</p>
        </div>
        <div v-if="form.contentType === 'emagazine'" class="rounded-lg border border-neutral-800 p-3">
          <p class="text-xs text-neutral-500">Emagazine / Longform dùng ảnh bìa làm hero và nội dung dài trong editor; trang công khai hiển thị kiểu longform. Không cần trường riêng.</p>
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

    <!-- Chon anh tu thu vien media (Dot 1a; Goi 1B dung chung cho media dinh dang) -->
    <Dialog v-model:visible="libDlg" modal :header="libPickTitle" class="w-full max-w-3xl">
      <div class="flex gap-2 mb-3">
        <InputText v-model="libQ" placeholder="Tìm tên file..." class="flex-1" @keyup.enter="loadLib(1)" />
        <Button label="Tìm" size="small" @click="loadLib(1)" />
      </div>
      <div v-if="libLoading" class="text-sm text-neutral-400">Đang tải...</div>
      <div v-else-if="!libItems.length" class="text-sm text-neutral-400">Chưa có mục nào trong thư viện.</div>
      <div v-else class="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-[60dvh] overflow-y-auto pr-1">
        <button v-for="im in libItems" :key="im.id" type="button" class="text-left group" @click="pickLib(im)">
          <span class="block aspect-square rounded-lg overflow-hidden bg-neutral-800">
            <img :src="resolveMedia(im.url)" class="w-full h-full object-cover" :alt="im.filename" loading="lazy" />
          </span>
          <span class="block text-[11px] text-neutral-400 truncate mt-1 group-hover:text-neutral-200">{{ im.filename }}</span>
        </button>
      </div>
      <div class="flex items-center justify-between mt-3">
        <span class="text-xs text-neutral-400">Trang {{ libMeta.page }} — tổng {{ libMeta.total }} mục<span v-if="libPickMode === 'gallery'"> · Đã chọn {{ formatForm.images.length }} ảnh cho chùm ảnh</span></span>
        <span class="flex gap-2">
          <Button label="Trước" size="small" text :disabled="libMeta.page <= 1" @click="loadLib(libMeta.page - 1)" />
          <Button label="Sau" size="small" text :disabled="libMeta.page * libMeta.limit >= libMeta.total" @click="loadLib(libMeta.page + 1)" />
        </span>
      </div>
      <template #footer>
        <Button v-if="libPickMode === 'gallery'" label="Xong" @click="libDlg = false" />
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

    <!-- Xem duyet bai (theo mau popup Xem duyet bao in: 96vw, footer nut theo trang thai + quyen) -->
    <Dialog v-model:visible="reviewDlg" modal :header="`Xem duyệt — ${reviewItem?.title || ''}`"
      class="w-[96vw] max-w-[96vw]" @hide="closeReview">
      <div v-if="reviewItem" class="flex flex-col gap-2">
        <p class="text-sm text-neutral-400">{{ reviewItem.category?.name || '—' }} · {{ statusText(reviewItem) }} · {{ lastApprovalText(reviewItem) }}</p>
        <div v-if="reviewSodBlocked" class="p-3 rounded-lg border border-amber-700 bg-amber-950/40 flex flex-wrap items-center gap-2">
          <p class="text-sm flex-1 min-w-52">Bạn đã xử lý bước trước của bài này nên duyệt thường sẽ bị chặn theo quy tắc tách nhiệm vụ. Chỉ dùng ngoại lệ cho tin nóng thật sự — lượt duyệt này sẽ được ghi log là ngoại lệ.</p>
          <Button label="Duyệt với ngoại lệ tin nóng" size="small" severity="warn" @click="openExceptionApprove(reviewItem)" />
        </div>
        <div class="flex gap-2">
          <Button label="Nội dung" size="small" :text="reviewTab !== 0" @click="reviewTab = 0" />
          <Button label="Lịch sử duyệt" size="small" :text="reviewTab !== 1" @click="reviewTab = 1" />
        </div>
        <div v-if="reviewTab === 0" class="flex flex-col gap-3 max-h-[70dvh] overflow-y-auto pr-1">
          <div class="flex flex-wrap gap-2">
            <Tag :value="contentTypeLabel(reviewItem.contentType)" severity="secondary" />
            <Tag v-if="reviewItem.isSpotlight" value="Tiêu điểm" severity="success" />
            <Tag v-if="reviewItem.isPhoto" value="Tin ảnh" severity="info" />
            <Tag v-if="reviewItem.isInfographic" value="Infographic" severity="info" />
            <Tag v-if="reviewItem.isFeatured" value="Nổi bật trang chủ" severity="success" />
            <Tag v-if="reviewItem.localNews" :value="`Tin địa phương: ${reviewItem.localNews}`" severity="secondary" />
            <Tag :value="reviewItem.allowComments === false ? 'Tắt bình luận' : 'Mở bình luận'" severity="secondary" />
          </div>
          <h2 class="text-xl font-semibold leading-snug">{{ reviewItem.title }}</h2>
          <p v-if="reviewItem.sapo" class="text-sm text-neutral-300 leading-relaxed">{{ reviewItem.sapo }}</p>
          <img v-if="reviewItem.coverPath" :src="resolveMedia(reviewItem.coverPath)" :alt="reviewItem.title" class="w-full max-h-96 object-cover rounded-lg" />
          <!-- Xem truoc media dinh dang (Goi 1B) -->
          <video v-if="reviewItem.contentType === 'video' && reviewItem.formatData?.videoUrl" :src="resolveMedia(reviewItem.formatData.videoUrl)" controls preload="metadata" class="w-full rounded-lg" />
          <audio v-if="reviewItem.contentType === 'audio' && reviewItem.formatData?.audioUrl" :src="resolveMedia(reviewItem.formatData.audioUrl)" controls class="w-full" />
          <div v-if="reviewItem.contentType === 'gallery' && reviewItem.formatData?.images?.length" class="grid grid-cols-3 gap-2">
            <img v-for="(im, i) in reviewItem.formatData.images" :key="i" :src="resolveMedia(im)" class="w-full aspect-square object-cover rounded-lg" :alt="`Ảnh ${i + 1}`" loading="lazy" />
          </div>
          <img v-if="reviewItem.contentType === 'infographic' && reviewItem.formatData?.imageUrl" :src="resolveMedia(reviewItem.formatData.imageUrl)" :alt="reviewItem.title" class="w-full rounded-lg" />
          <p class="text-xs text-neutral-400">
            {{ (reviewItem.authors || []).join(', ') || '—' }}
            <span v-if="reviewItem.publishAt"> · {{ fmtTime(reviewItem.publishAt) }}</span>
            <span v-if="reviewItem.status === 'published' && reviewItem.publishAt && new Date(reviewItem.publishAt).getTime() > Date.now()"> · Chờ xuất bản (hẹn giờ)</span>
          </p>
          <div v-if="reviewItem.body" class="text-sm leading-relaxed" v-html="reviewBody" />
          <p v-else class="text-sm text-neutral-400">Chưa có nội dung.</p>
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
        <Button v-if="reviewItem && can('articles:update') && reviewItem.status === 'draft'" label="Gửi duyệt" severity="info" @click="reviewSubmit" />
        <Button v-if="reviewItem && can('articles:publish') && reviewItem.status === 'pending_review'" label="Duyệt" severity="success" @click="reviewApprove" />
        <Button v-if="reviewItem && can('articles:publish') && reviewItem.status === 'pending_review'" label="Trả lại" severity="warn" @click="reviewReturn" />
        <Button v-if="reviewItem && can('articles:publish') && ((reviewItem.status === 'draft' && isFullAdmin) || reviewItem.status === 'unpublished')" label="Xuất bản" severity="success" @click="reviewPublish" />
        <Button v-if="reviewItem && can('articles:publish') && reviewItem.status === 'published'" label="Gỡ xuống" severity="warn" @click="reviewUnpublish" />
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
const authorFilter = ref('');
const contentTypeFilter = ref('');
const dateFrom = ref('');
const dateTo = ref('');
const cats = ref<any[]>([]);
const authorsList = ref<string[]>([]);
const counts = ref({ total: 0, draft: 0, pending_review: 0, published: 0, unpublished: 0 });

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
/**
 * Cot "Sua doi gan nhat" gop (theo mau tham chieu): hoat dong gan nhat
 * duoi dang "nguoi — vai tro — thoi gian". Hanh dong duyet (submit/duyet/
 * tra lai) khong cap nhat updatedBy nen phai so sanh thoi gian: neu dong
 * duyet moi nhat moi hon lan sua noi dung thi hien nguoi duyet, neu khong
 * hien nguoi sua. Lich su duyet day du van xem o nut "Lich su duyet".
 */
function lastActivityText(it: any) {
  const a = it.lastApproval;
  if (a && a.createdAt && it.updatedAt && a.createdAt >= it.updatedAt) {
    // Truoc day an vai tro khi ten nguoi trung nhan vai tro (vd. tai khoan
    // superadmin co ten hien thi dung la "Super Admin"), khien cot chi con
    // "Super Admin · thoi gian" va doc nhu thieu ten nguoi. Nay: ten that
    // thi luon kem vai tro (ke ca khi hai chuoi trung nhau); chi khi khong
    // co ten that moi lay vai tro lam ten va khong lap lai.
    const who = a.actorName || a.actorRole || '?';
    const role = a.actorName && a.actorRole ? ` · ${a.actorRole}` : '';
    return `${who}${role} · ${fmtTime(a.createdAt)}`;
  }
  return lastEditText(it);
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
const authorFilterOptions = computed(() => [{ label: 'Tất cả tác giả', value: '' }, ...authorsList.value.map((a) => ({ label: a, value: a }))]);
const statusLinks = [
  { label: 'Tất cả', value: '', key: 'total' },
  { label: 'Bài nháp', value: 'draft', key: 'draft' },
  { label: 'Chờ duyệt', value: 'pending_review', key: 'pending_review' },
  { label: 'Đã xuất bản', value: 'published', key: 'published' },
  { label: 'Hạ xuất bản', value: 'unpublished', key: 'unpublished' },
];
function applyStatusLink(v: string) { statusFilter.value = v; load(1); }
const catParentOptions = computed(() => cats.value
  .filter((c) => !c.parentId)
  .map((c) => ({ label: c.name, value: c.publicId })));

async function loadCats() {
  try { cats.value = await api.get<any[]>('/admin/news-categories') || []; }
  catch { cats.value = []; }
}
async function loadAuthors() {
  try { authorsList.value = await api.get<any[]>('/admin/news/authors') || []; }
  catch { authorsList.value = []; }
}
// Chan so dem cu ghi de so dem moi: load() goi loadCounts() khong await,
// nen khi doi loc nhanh (vd. Loai bai Video -> Tat ca), phan hoi counts
// cua lan loc cu co the ve SAU phan hoi cua lan loc moi va ghi de so dem
// moi (4) bang so dem cu (0). Chi ap dung phan hoi cua lan goi moi nhat.
let countsSeq = 0;
async function loadCounts() {
  const seq = ++countsSeq;
  try {
    const r = await api.get<any>('/admin/news/counts', {
      q: q.value || undefined, categoryId: catFilter.value || undefined,
      author: authorFilter.value || undefined, contentType: contentTypeFilter.value || undefined,
      dateFrom: dateFrom.value || undefined, dateTo: dateTo.value || undefined,
    });
    if (r && seq === countsSeq) counts.value = { total: r.total || 0, draft: r.draft || 0, pending_review: r.pending_review || 0, published: r.published || 0, unpublished: r.unpublished || 0 };
  } catch { /* giu so dem cu, khong chan danh sach */ }
}
async function load(page = 1) {
  loading.value = true;
  try {
    const r = await api.get<any>('/admin/news', {
      q: q.value || undefined, status: statusFilter.value || undefined,
      categoryId: catFilter.value || undefined, author: authorFilter.value || undefined,
      contentType: contentTypeFilter.value || undefined,
      dateFrom: dateFrom.value || undefined, dateTo: dateTo.value || undefined,
      page, limit: meta.value.limit,
    });
    items.value = r.data || [];
    meta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được danh sách', life: 3000 });
  } finally { loading.value = false; }
  loadCounts();
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
const contentTypeFilterOptions = computed(() => [{ label: 'Tất cả loại bài', value: '' }, ...contentTypeOptions]);
const form = ref({
  title: '', slug: '', sapo: '', body: '', categoryId: '', coverPath: '', isFeatured: false,
  contentType: 'text', isSpotlight: false, isPhoto: false, isInfographic: false, allowComments: true, localNews: '',
});
const authorsText = ref('');
const tagsText = ref('');
const publishAtText = ref('');

// --- Media rieng theo dinh dang (Goi 1B) ---
// Luu vao NewsArticle.formatData (JSONB, nullable) qua API. URL luu dang
// tho tu thu vien (tuong doi /... hoac tuyet doi theo API tra), luc hien
// thi resolve nhu anh bia. Khong nhung base64. Khi doi dinh dang, media
// cua loai cu van giu trong state (khong xoa) — luc Luu gui cac key co
// gia tri; trang cong khai chi dung media cua loai hien tai.
const formatForm = ref<{ videoUrl: string; audioUrl: string; imageUrl: string; images: string[] }>({
  videoUrl: '', audioUrl: '', imageUrl: '', images: [],
});
function resetFormatForm() {
  formatForm.value = { videoUrl: '', audioUrl: '', imageUrl: '', images: [] };
}
function loadFormatForm(fd: any) {
  const f = fd && typeof fd === 'object' ? fd : {};
  formatForm.value = {
    videoUrl: typeof f.videoUrl === 'string' ? f.videoUrl : '',
    audioUrl: typeof f.audioUrl === 'string' ? f.audioUrl : '',
    imageUrl: typeof f.imageUrl === 'string' ? f.imageUrl : '',
    images: Array.isArray(f.images) ? f.images.filter((x: any) => typeof x === 'string' && x) : [],
  };
}
function buildFormatData(): any {
  const out: any = {};
  if (formatForm.value.videoUrl.trim()) out.videoUrl = formatForm.value.videoUrl.trim();
  if (formatForm.value.audioUrl.trim()) out.audioUrl = formatForm.value.audioUrl.trim();
  if (formatForm.value.imageUrl.trim()) out.imageUrl = formatForm.value.imageUrl.trim();
  const imgs = formatForm.value.images.filter(Boolean);
  if (imgs.length) out.images = imgs;
  return Object.keys(out).length ? out : null;
}
function moveGallery(i: number, d: number) {
  const imgs = [...formatForm.value.images];
  const j = i + d;
  if (j < 0 || j >= imgs.length) return;
  [imgs[i], imgs[j]] = [imgs[j], imgs[i]];
  formatForm.value.images = imgs;
}
function removeGallery(i: number) {
  formatForm.value.images = formatForm.value.images.filter((_, x) => x !== i);
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
  resetFormatForm();
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
  loadFormatForm(it.formatData);
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
// Goi 1B: hop thu vien dung chung cho 4 muc dich — chen anh vao body
// ('body', mac dinh cu) hoac nap media dinh dang ('audio' | 'image' |
// 'gallery'). O che do gallery, hop giu mo de chon nhieu anh lien tiep.
const libPickMode = ref<'body' | 'audio' | 'image' | 'gallery'>('body');
const libKind = ref('image');
const libPickTitle = computed(() => {
  if (libPickMode.value === 'audio') return 'Chọn audio từ thư viện';
  if (libPickMode.value === 'image') return 'Chọn ảnh infographic từ thư viện';
  if (libPickMode.value === 'gallery') return 'Chọn ảnh cho chùm ảnh';
  return 'Chọn ảnh từ thư viện';
});
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
    const r = await api.get<any>('/admin/media', { kind: libKind.value, q: libQ.value || undefined, page, limit: libMeta.value.limit });
    libItems.value = r.data || [];
    libMeta.value = { total: r.total || 0, page: r.page || 1, limit: r.limit || 20 };
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.message || e?.message || 'Không tải được thư viện', life: 3000 });
  } finally { libLoading.value = false; }
}
function openLib() {
  libPickMode.value = 'body';
  libKind.value = 'image';
  libDlg.value = true;
  loadLib(1);
}
function openLibFor(mode: 'audio' | 'image' | 'gallery') {
  libPickMode.value = mode;
  libKind.value = mode === 'audio' ? 'audio' : 'image';
  libDlg.value = true;
  loadLib(1);
}
function pickLib(item: any) {
  // Goi 1B: che do chon media dinh dang — luu URL tho tu API (khong
  // resolve), luc hien thi resolve nhu anh bia. Rieng che do body giu
  // nguyen hanh vi cu (chen URL da resolve vao editor).
  if (libPickMode.value === 'audio' || libPickMode.value === 'image') {
    const rawUrl = item?.url || '';
    if (!rawUrl) {
      toast.add({ severity: 'warn', summary: 'File này chưa có URL dùng được', life: 3000 });
      return;
    }
    if (libPickMode.value === 'audio') formatForm.value.audioUrl = rawUrl;
    else formatForm.value.imageUrl = rawUrl;
    libDlg.value = false;
    return;
  }
  if (libPickMode.value === 'gallery') {
    const rawUrl = item?.url || '';
    if (!rawUrl) {
      toast.add({ severity: 'warn', summary: 'Ảnh này chưa có URL dùng được', life: 3000 });
      return;
    }
    if (!formatForm.value.images.includes(rawUrl)) formatForm.value.images.push(rawUrl);
    return; // giu hop mo de chon tiep nhieu anh
  }
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
      formatData: buildFormatData(),
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
  // Kiem tra SoD chu dong (dong bo voi popup): trung nguoi xu ly buoc truoc
  // (truong "Duyet gan nhat" cua hang) thi mo thang dialog ngoai le, khong
  // goi approve mu roi moi doan chuoi loi 403. Luoi bat chuoi loi giu lam fallback.
  const prevActor = it.lastApproval?.actorId || null;
  const me = currentUserId();
  if (prevActor && me && prevActor === me) { openExceptionApprove(it); return; }
  try {
    const r = await api.post<any>(`/admin/news/${it.publicId}/approve`);
    toast.add({ severity: 'success', summary: r?.status === 'published' ? 'Đã duyệt xong và xuất bản' : 'Đã duyệt, chuyển bước tiếp theo', life: 2500 });
    load(meta.value.page);
  } catch (e: any) {
    // ofetch dat body loi da parse vao e.data, khong phai e.response.data
    // (e.message chi la "[POST] url: 403" nen dialog ngoai le khong bao
    // gio mo duoc neu chi doc 2 truong cu — dung nhu live-run 2026-10-28).
    const msg = e?.data?.message || e?.response?.data?.message || e?.message || '';
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

// --- Xem duyet bai (theo mau popup Xem duyet bao in) ---
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
/** Nguoi xu ly buoc truoc = ban ghi lich su moi nhat (API tra theo thu tu asc).
 * Neu chua tai duoc lich su, dung lastApproval cua hang danh sach. */
const reviewPrevActorId = computed(() => {
  if (reviewHist.value.length) return reviewHist.value[reviewHist.value.length - 1]?.actorId || null;
  return reviewItem.value?.lastApproval?.actorId || null;
});
/** Kiem tra SoD chu dong trong popup: trung nguoi xu ly buoc truoc thi canh
 * bao ngay, khong cho approve mu roi moi doan chuoi loi 403 (co che da hong
 * 2 lan live). Chi ap dung khi bai dang cho duyet. */
const reviewSodBlocked = computed(() => {
  if (!reviewItem.value || reviewItem.value.status !== 'pending_review') return false;
  const prev = reviewPrevActorId.value;
  const me = currentUserId();
  return !!(prev && me && prev === me);
});
/** Body hien trong popup Xem duyet: bo anh trung voi anh bia (cung file,
 * khop pathname sau resolveMedia) de khoi thay 2 anh giong nhau — giong
 * guard phia portal (article.js). Chi khop dung file bia, khong xoa anh
 * khac. Ban tai lai khac URL thi khong khop duoc, phai xoa tay trong body. */
const reviewBody = computed(() => {
  const it: any = reviewItem.value;
  if (!it?.body) return '';
  const cover = it.coverPath ? resolveMedia(it.coverPath) : '';
  if (!cover || typeof DOMParser === 'undefined') return it.body;
  let coverPath = '';
  try { coverPath = new URL(cover, window.location.origin).pathname; } catch { coverPath = cover; }
  if (!coverPath) return it.body;
  const doc = new DOMParser().parseFromString(it.body, 'text/html');
  doc.querySelectorAll('img').forEach((img: any) => {
    const src = img.getAttribute('src') || '';
    if (!src) return;
    let p = '';
    try { p = new URL(resolveMedia(src), window.location.origin).pathname; } catch { p = src; }
    if (p === coverPath) {
      const parent: any = img.parentNode;
      img.remove();
      if (parent && (parent.nodeName === 'P' || parent.nodeName === 'FIGURE') && !parent.textContent.trim() && !parent.querySelector('img')) parent.remove();
    }
  });
  return doc.body.innerHTML;
});
async function openReview(it: any) {
  reviewItem.value = it;
  reviewTab.value = 0;
  reviewHist.value = [];
  reviewDlg.value = true;
  try {
    const r = await api.get<any>(`/admin/news/${it.publicId}/approvals`);
    reviewHist.value = r.data || [];
  } catch { /* tab lich su hien trong; canh bao SoD dung lastApproval */ }
}
function closeReview() { reviewItem.value = null; reviewHist.value = []; reviewTab.value = 0; }
/** Sau moi hanh dong trong popup, nap lai danh sach va chi reviewItem ve hang
 * moi nhat (cung publicId). Neu hang roi khoi danh sach da loc thi dong popup. */
async function refreshReview() {
  if (!reviewItem.value) return;
  const pid = reviewItem.value.publicId;
  await load(meta.value.page);
  const fresh = items.value.find((x: any) => x.publicId === pid);
  if (fresh) {
    reviewItem.value = fresh;
    try { const r = await api.get<any>(`/admin/news/${pid}/approvals`); reviewHist.value = r.data || []; } catch {}
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
/** Hanh dong qua dialog phu (tra lai / ngoai le) khong co hook tra ve nen
 * dong bo lai popup khi dialog phu dong (chi khi no mo tu popup nay). */
watch(excDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && excTarget.value?.publicId === reviewItem.value.publicId) await refreshReview();
});
watch(returnDlg, async (v) => {
  if (!v && reviewDlg.value && reviewItem.value && returnTarget.value?.publicId === reviewItem.value.publicId) await refreshReview();
});

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
loadAuthors();
load(1);
</script>
