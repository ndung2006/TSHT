<template>
  <div class="flex flex-col gap-4">
    <!-- ==================== DANH SACH PHIM ==================== -->
    <template v-if="view === 'movies'">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Quản lý movie</h2>
        <p class="text-sm text-neutral-400">Tổng: {{ filteredMovies.length }} phim</p>
      </div>

      <div class="surface-card flex flex-wrap gap-2 p-3">
        <Button v-if="can('catalog:write')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openAdd" />
        <Button v-if="can('catalog:write')" label="Công khai" icon="pi pi-lock-open" severity="success" :disabled="!selMovies.length" @click="batchMovies(true)" />
        <Button v-if="can('catalog:write')" label="Ẩn" icon="pi pi-lock" severity="warn" :disabled="!selMovies.length" @click="batchMovies(false)" />
        <Button v-if="can('catalog:write')" label="Xoá" icon="pi pi-trash" severity="danger" :disabled="!selMovies.length" @click="batchDeleteMovies" />
      </div>

      <div class="surface-card flex flex-wrap items-center gap-2 p-3">
        <Dropdown v-model="fType" :options="movieTypes" option-label="label" option-value="value" placeholder="Loại phim" show-clear class="w-44" />
        <Dropdown v-model="fDist" :options="distFilterOptions" option-label="label" option-value="value" placeholder="Phân phối" show-clear class="w-44" />
        <span class="p-input-icon-left ml-auto">
          <i class="pi pi-search" />
          <InputText v-model="fQ" placeholder="Tìm kiếm..." class="w-64" />
        </span>
      </div>

      <div class="surface-card p-4">
        <DataTable :value="filteredMovies" :loading="moviesLoading" v-model:selection="selMovies" data-key="id"
          paginator :rows="20" size="small">
          <Column selection-mode="multiple" style="width:3rem" />
          <Column header="Tên" style="min-width:18rem">
            <template #body="{ data }">
              <div class="flex items-start gap-2">
                <img v-if="movieThumb(data)" :src="movieThumb(data)" class="h-10 w-16 shrink-0 rounded object-cover" alt="" />
                <div class="min-w-0">
                  <div class="font-medium">{{ data.title }}</div>
                  <div v-if="catChips(data).length" class="mt-1 flex flex-wrap gap-1">
                    <span v-for="c in catChips(data)" :key="c" class="rounded bg-lime-100 px-1.5 py-0.5 text-[11px] text-lime-800">{{ c }}</span>
                  </div>
                </div>
              </div>
            </template>
          </Column>
          <Column header="Phân phối" style="width:8rem">
            <template #body="{ data }"><Tag :value="distLabel(data.distribution)" :severity="distSev(data.distribution)" /></template>
          </Column>
          <Column header="Loại" style="width:8rem">
            <template #body="{ data }"><Tag :value="typeLabel(data.type)" severity="success" /></template>
          </Column>
          <Column header="Hiển thị" style="width:6rem">
            <template #body="{ data }">
              <InputSwitch :model-value="data.isVisible !== false"
                @update:model-value="(v: boolean) => toggleMovieVisible(data, v)" :disabled="!can('catalog:write')" />
            </template>
          </Column>
          <Column field="createdAt" header="Ngày tạo" sortable style="width:9rem">
            <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
          </Column>
          <Column header="" style="width:8rem">
            <template #body="{ data }">
              <div class="flex justify-end gap-1">
                <Button icon="pi pi-ellipsis-v" text rounded size="small" @click="(e: Event) => openRowMenu(e, data, 'movie')" />
                <Button v-if="can('catalog:write')" icon="pi pi-pencil" text rounded size="small" severity="success" @click="openEdit(data)" />
                <Button v-if="can('catalog:write')" icon="pi pi-trash" text rounded size="small" severity="danger" @click="delMovie(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>

    <!-- ==================== QUAN LY MUA / PHAN ==================== -->
    <template v-else-if="view === 'seasons'">
      <div class="flex items-center gap-3">
        <Button icon="pi pi-arrow-left" text rounded @click="view = 'movies'" v-tooltip.top="'Về danh sách phim'" />
        <h2 class="text-lg font-semibold">Phim {{ curMovie?.title }} | Quản lý mùa / phần</h2>
        <p class="ml-auto text-sm text-neutral-400">Tổng: {{ seasons.length }} mùa</p>
      </div>

      <div class="surface-card flex flex-wrap gap-2 p-3">
        <Button v-if="can('catalog:write')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openSeasonAdd" />
        <Button v-if="can('catalog:write')" label="Công khai" icon="pi pi-lock-open" severity="success" :disabled="!selSeasons.length" @click="batchSeasons(true)" />
        <Button v-if="can('catalog:write')" label="Ẩn" icon="pi pi-lock" severity="warn" :disabled="!selSeasons.length" @click="batchSeasons(false)" />
        <Button v-if="can('catalog:write')" label="Xoá" icon="pi pi-trash" severity="danger" :disabled="!selSeasons.length" @click="batchDeleteSeasons" />
      </div>

      <div class="surface-card p-4">
        <DataTable :value="seasons" :loading="seasonsLoading" v-model:selection="selSeasons" data-key="id" paginator :rows="20" size="small">
          <Column selection-mode="multiple" style="width:3rem" />
          <Column header="Tên" style="min-width:16rem">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <img v-if="data.thumbnail || data.poster" :src="data.thumbnail || data.poster" class="h-10 w-16 rounded object-cover" alt="" />
                <span class="font-medium">{{ data.title }}</span>
              </div>
            </template>
          </Column>
          <Column header="Hiển thị" style="width:6rem">
            <template #body="{ data }">
              <InputSwitch :model-value="data.isVisible !== false"
                @update:model-value="(v: boolean) => toggleSeasonVisible(data, v)" :disabled="!can('catalog:write')" />
            </template>
          </Column>
          <Column field="createdAt" header="Ngày tạo" sortable style="width:9rem">
            <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
          </Column>
          <Column header="" style="width:8rem">
            <template #body="{ data }">
              <div class="flex justify-end gap-1">
                <Button icon="pi pi-ellipsis-v" text rounded size="small" @click="(e: Event) => openRowMenu(e, data, 'season')" />
                <Button v-if="can('catalog:write')" icon="pi pi-pencil" text rounded size="small" severity="success" @click="openSeasonEdit(data)" />
                <Button v-if="can('catalog:write')" icon="pi pi-trash" text rounded size="small" severity="danger" @click="delSeason(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>

    <!-- ==================== QUAN LY TAP PHIM ==================== -->
    <template v-else-if="view === 'episodes'">
      <div class="flex items-center gap-3">
        <Button icon="pi pi-arrow-left" text rounded @click="backFromEpisodes" v-tooltip.top="'Quay lại'" />
        <h2 class="text-lg font-semibold">{{ epOwner.title }} | Quản lý tập phim</h2>
        <p class="ml-auto text-sm text-neutral-400">Tổng: {{ filteredEps.length }} tập</p>
      </div>

      <div class="surface-card flex flex-wrap gap-2 p-3">
        <Button v-if="can('catalog:write')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openETAdd('episode')" />
        <Button v-if="can('catalog:write')" label="Công khai" icon="pi pi-lock-open" severity="success" :disabled="!selET.length" @click="batchET(true)" />
        <Button v-if="can('catalog:write')" label="Ẩn" icon="pi pi-lock" severity="warn" :disabled="!selET.length" @click="batchET(false)" />
        <Button v-if="can('catalog:write')" label="Xoá" icon="pi pi-trash" severity="danger" :disabled="!selET.length" @click="batchDeleteET" />
      </div>

      <div class="surface-card flex flex-wrap items-center gap-2 p-3">
        <Dropdown v-model="fEpDist" :options="epDistFilterOptions" option-label="label" option-value="value" placeholder="Phân phối" show-clear class="w-44" />
        <span class="p-input-icon-left ml-auto">
          <i class="pi pi-search" />
          <InputText v-model="fEpQ" placeholder="Tìm kiếm..." class="w-64" />
        </span>
      </div>

      <div class="surface-card p-4">
        <DataTable :value="filteredEps" :loading="epsLoading" v-model:selection="selET" data-key="id" paginator :rows="20" size="small">
          <Column selection-mode="multiple" style="width:3rem" />
          <Column header="Tên" style="min-width:16rem">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <img v-if="data.thumbnail" :src="data.thumbnail" class="h-10 w-16 rounded object-cover" alt="" />
                <span class="font-medium">{{ data.name || data.title }}</span>
              </div>
            </template>
          </Column>
          <Column field="order" header="Thứ tự" sortable style="width:7rem" />
          <Column header="Phân phối" style="width:8rem">
            <template #body="{ data }"><Tag :value="epDistLabel(data.distribution)" :severity="epDistSev(data.distribution)" /></template>
          </Column>
          <Column header="Hiển thị" style="width:6rem">
            <template #body="{ data }">
              <InputSwitch :model-value="data.isVisible !== false"
                @update:model-value="(v: boolean) => toggleETVisible(data, v)" :disabled="!can('catalog:write')" />
            </template>
          </Column>
          <Column field="createdAt" header="Ngày tạo" sortable style="width:9rem">
            <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
          </Column>
          <Column header="" style="width:6rem">
            <template #body="{ data }">
              <div class="flex justify-end gap-1">
                <Button v-if="can('catalog:write')" icon="pi pi-pencil" text rounded size="small" severity="success" @click="openETEdit('episode', data)" />
                <Button v-if="can('catalog:write')" icon="pi pi-trash" text rounded size="small" severity="danger" @click="delET(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>

    <!-- ==================== QUAN LY TRAILER ==================== -->
    <template v-else-if="view === 'trailers'">
      <div class="flex items-center gap-3">
        <Button icon="pi pi-arrow-left" text rounded @click="backFromTrailers" v-tooltip.top="'Quay lại'" />
        <h2 class="text-lg font-semibold">{{ trOwner.title }} | Quản lý trailer</h2>
        <p class="ml-auto text-sm text-neutral-400">Tổng: {{ filteredET.length }} trailer</p>
      </div>

      <div class="surface-card flex flex-wrap gap-2 p-3">
        <Button v-if="can('catalog:write')" label="Thêm" icon="pi pi-plus" severity="secondary" @click="openETAdd('trailer')" />
        <Button v-if="can('catalog:write')" label="Công khai" icon="pi pi-lock-open" severity="success" :disabled="!selET.length" @click="batchET(true)" />
        <Button v-if="can('catalog:write')" label="Ẩn" icon="pi pi-lock" severity="warn" :disabled="!selET.length" @click="batchET(false)" />
        <Button v-if="can('catalog:write')" label="Xoá" icon="pi pi-trash" severity="danger" :disabled="!selET.length" @click="batchDeleteET" />
      </div>

      <div class="surface-card p-4">
        <DataTable :value="filteredET" :loading="epsLoading" v-model:selection="selET" data-key="id" paginator :rows="20" size="small">
          <Column selection-mode="multiple" style="width:3rem" />
          <Column header="Tên" style="min-width:16rem">
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <img v-if="data.thumbnail" :src="data.thumbnail" class="h-10 w-16 rounded object-cover" alt="" />
                <span class="font-medium">{{ data.name || data.title }}</span>
              </div>
            </template>
          </Column>
          <Column field="order" header="Thứ tự" sortable style="width:7rem" />
          <Column header="Phân phối" style="width:8rem">
            <template #body="{ data }"><Tag :value="epDistLabel(data.distribution)" :severity="epDistSev(data.distribution)" /></template>
          </Column>
          <Column header="Hiển thị" style="width:6rem">
            <template #body="{ data }">
              <InputSwitch :model-value="data.isVisible !== false"
                @update:model-value="(v: boolean) => toggleETVisible(data, v)" :disabled="!can('catalog:write')" />
            </template>
          </Column>
          <Column field="createdAt" header="Ngày tạo" sortable style="width:9rem">
            <template #body="{ data }">{{ fmtDateTime(data.createdAt) }}</template>
          </Column>
          <Column header="" style="width:6rem">
            <template #body="{ data }">
              <div class="flex justify-end gap-1">
                <Button v-if="can('catalog:write')" icon="pi pi-pencil" text rounded size="small" severity="success" @click="openETEdit('trailer', data)" />
                <Button v-if="can('catalog:write')" icon="pi pi-trash" text rounded size="small" severity="danger" @click="delET(data)" />
              </div>
            </template>
          </Column>
        </DataTable>
      </div>
    </template>

    <!-- ==================== DIALOG PHIM ==================== -->
    <Dialog v-model:visible="dlg" modal :header="editing ? 'Cập nhật phim' : 'Thêm phim'" class="w-full max-w-6xl">
      <div class="grid grid-cols-5 gap-4">
        <div class="col-span-3 flex flex-col gap-3">
          <div><label class="field-label">Tên (bắt buộc)</label><InputText v-model="form.title" class="w-full" /></div>
          <div><label class="field-label">Tên gốc</label><InputText v-model="form.originalTitle" class="w-full" /></div>
          <div><label class="field-label">Mô tả</label><Textarea v-model="form.description" rows="3" class="w-full" /></div>
          <div><label class="field-label">Danh mục</label>
            <MultiSelect v-model="form.categoryIds" :options="typeCategories('phim')" option-label="name" option-value="id" filter display="chip"
              :loading="loadingCats" placeholder="Chọn danh mục" class="w-full" />
          </div>
          <div><label class="field-label">Thể loại</label>
            <MultiSelect v-model="form.genreIds" :options="genres" option-label="title" option-value="id" filter display="chip"
              :loading="loadingGenres" placeholder="Chọn thể loại" class="w-full" />
          </div>
          <div><label class="field-label">Gói cước</label>
            <Dropdown v-model="form.planId" :options="plans" option-label="name" option-value="id" placeholder="—" show-clear class="w-full" />
          </div>
          <div><label class="field-label">Giới hạn độ tuổi</label>
            <Dropdown v-model="form.ageLimit" :options="ageOptions" placeholder="—" show-clear class="w-full" />
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="field-label">Ngày xuất bản</label>
              <Calendar v-model="form.publishedAt" date-format="dd/mm/yy" show-time hour-format="24" show-icon class="w-full" />
            </div>
            <div><label class="field-label">Thời lượng phim</label><InputText v-model="form.duration" class="w-full" placeholder="giờ:phút:giây" /></div>
            <div><label class="field-label">Năm sản xuất</label><InputNumber v-model="form.releaseYear" class="w-full" :use-grouping="false" /></div>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="field-label">Loại phim</label>
              <div class="flex flex-col gap-2 pt-1">
                <div v-for="t in movieTypes" :key="t.value" class="flex items-center gap-2">
                  <RadioButton v-model="form.type" :input-id="'mtype-' + t.value" :value="t.value" />
                  <label :for="'mtype-' + t.value">{{ t.label }}</label>
                </div>
              </div>
            </div>
            <div><label class="field-label">Phụ đề / Thuyết minh</label>
              <div class="flex flex-col gap-2 pt-1">
                <div class="flex items-center gap-2"><Checkbox v-model="form.hasSubtitle" binary input-id="msub" /><label for="msub">Phụ đề</label></div>
                <div class="flex items-center gap-2"><Checkbox v-model="form.hasDubbing" binary input-id="mdub" /><label for="mdub">Thuyết minh</label></div>
              </div>
            </div>
            <div><label class="field-label">Trạng thái hiển thị</label>
              <div class="flex flex-col gap-2 pt-1">
                <div class="flex items-center gap-2"><RadioButton v-model="form.isVisible" input-id="mvis1" :value="true" /><label for="mvis1">Hiển thị</label></div>
                <div class="flex items-center gap-2"><RadioButton v-model="form.isVisible" input-id="mvis0" :value="false" /><label for="mvis0">Ẩn</label></div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Phân phối</label>
              <Dropdown v-model="form.distribution" :options="distOptions" option-label="label" option-value="value" class="w-full" />
            </div>
            <div><label class="field-label">Giá mua lẻ nội dung</label>
              <InputNumber v-model="form.price" class="w-full" :disabled="form.distribution === 'free'" :use-grouping="false" />
            </div>
          </div>
        </div>
        <div class="col-span-2 flex flex-col gap-3">
          <div><label class="field-label">Poster (Tỉ lệ: 2:3)</label><ImagePicker v-model="form.posterUrl" ratio="2/3" /></div>
          <div><label class="field-label">Ảnh thumbnail (Tỉ lệ 16:9)</label><ImagePicker v-model="form.thumbnailUrl" ratio="16/9" /></div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="dlg = false" />
        <Button :label="editing ? 'Lưu' : 'Thêm'" severity="success" :loading="saving" @click="save" :disabled="!form.title.trim()" />
      </template>
    </Dialog>

    <!-- ==================== DIALOG MUA / PHAN ==================== -->
    <Dialog v-model:visible="seasonDlg" modal :header="editingSeason ? 'Cập nhật mùa / phần' : 'Thêm mùa / phần'" class="w-full max-w-4xl">
      <div class="grid grid-cols-2 gap-4">
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Tên (bắt buộc)</label><InputText v-model="seasonForm.title" class="w-full" /></div>
          <div><label class="field-label">Mô tả</label><Textarea v-model="seasonForm.description" rows="3" class="w-full" /></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Thứ tự (bắt buộc)</label><InputNumber v-model="seasonForm.order" class="w-full" :use-grouping="false" /></div>
            <div><label class="field-label">Năm sản xuất</label><InputNumber v-model="seasonForm.year" class="w-full" :use-grouping="false" /></div>
          </div>
          <div><label class="field-label">Ngày xuất bản</label>
            <Calendar v-model="seasonForm.publishedAt" date-format="dd/mm/yy" show-time hour-format="24" show-icon class="w-full" />
          </div>
          <div><label class="field-label">Trạng thái hiển thị</label>
            <div class="flex gap-4 pt-1">
              <div class="flex items-center gap-2"><RadioButton v-model="seasonForm.isVisible" input-id="svis1" :value="true" /><label for="svis1">Hiển thị</label></div>
              <div class="flex items-center gap-2"><RadioButton v-model="seasonForm.isVisible" input-id="svis0" :value="false" /><label for="svis0">Ẩn</label></div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          <div><label class="field-label">Poster (Tỉ lệ: 2:3)</label><ImagePicker v-model="seasonForm.poster" ratio="2/3" /></div>
          <div><label class="field-label">Ảnh thumbnail (Tỉ lệ 16:9)</label><ImagePicker v-model="seasonForm.thumbnail" ratio="16/9" /></div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="seasonDlg = false" />
        <Button :label="editingSeason ? 'Lưu' : 'Thêm'" severity="success" :loading="seasonSaving"
          @click="saveSeason" :disabled="!seasonForm.title.trim() || seasonForm.order == null" />
      </template>
    </Dialog>

    <!-- ==================== DIALOG TAP PHIM / TRAILER ==================== -->
    <Dialog v-model:visible="etDlg" modal :header="etDialogTitle" class="w-full max-w-6xl">
      <div class="grid grid-cols-5 gap-4">
        <div class="col-span-3 flex flex-col gap-3">
          <div><label class="field-label">Tên (bắt buộc)</label><InputText v-model="etForm.name" class="w-full" /></div>
          <div><label class="field-label">Mô tả</label><Textarea v-model="etForm.description" rows="3" class="w-full" /></div>
          <div class="grid grid-cols-3 gap-3">
            <div><label class="field-label">Thứ tự (bắt buộc)</label><InputNumber v-model="etForm.order" class="w-full" :use-grouping="false" /></div>
            <div><label class="field-label">Ngày xuất bản</label>
              <Calendar v-model="etForm.publishedAt" date-format="dd/mm/yy" show-time hour-format="24" show-icon class="w-full" />
            </div>
            <div><label class="field-label">Thời lượng video</label><InputText v-model="etForm.duration" class="w-full" placeholder="giờ:phút:giây" /></div>
          </div>
          <div><label class="field-label">Phụ đề Tiếng Anh</label>
            <div class="flex gap-1">
              <InputText v-model="etForm.subtitleEn" class="flex-1" placeholder="URL file phụ đề" />
              <Button icon="pi pi-trash" severity="danger" text v-tooltip.top="'Xoá'" :disabled="!etForm.subtitleEn" @click="etForm.subtitleEn = ''" />
            </div>
          </div>
          <div><label class="field-label">Phụ đề Tiếng Việt</label>
            <div class="flex gap-1">
              <InputText v-model="etForm.subtitleVi" class="flex-1" placeholder="URL file phụ đề" />
              <Button icon="pi pi-trash" severity="danger" text v-tooltip.top="'Xoá'" :disabled="!etForm.subtitleVi" @click="etForm.subtitleVi = ''" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Trạng thái hiển thị</label>
              <div class="flex gap-4 pt-1">
                <div class="flex items-center gap-2"><RadioButton v-model="etForm.isVisible" input-id="evis1" :value="true" /><label for="evis1">Hiển thị</label></div>
                <div class="flex items-center gap-2"><RadioButton v-model="etForm.isVisible" input-id="evis0" :value="false" /><label for="evis0">Ẩn</label></div>
              </div>
            </div>
            <div><label class="field-label">Hiển thị quảng cáo</label>
              <div class="flex gap-4 pt-1">
                <div class="flex items-center gap-2"><RadioButton v-model="etForm.showAds" input-id="eads1" :value="true" /><label for="eads1">Hiển thị</label></div>
                <div class="flex items-center gap-2"><RadioButton v-model="etForm.showAds" input-id="eads0" :value="false" /><label for="eads0">Ẩn</label></div>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="field-label">Phân phối</label>
              <Dropdown v-model="etForm.distribution" :options="epDistOptions" option-label="label" option-value="value" class="w-full" />
            </div>
            <div><label class="field-label">Giá mua lẻ nội dung</label>
              <InputNumber v-model="etForm.price" class="w-full" :disabled="etForm.distribution !== 'paid'" :use-grouping="false" />
            </div>
          </div>
        </div>
        <div class="col-span-2 flex flex-col gap-3">
          <div><label class="field-label">Ảnh thumbnail (Tỉ lệ 16:9)</label><ImagePicker v-model="etForm.thumbnail" ratio="16/9" /></div>
          <div>
            <label class="field-label">Video</label>
            <div v-if="etPreviewUrl" class="relative aspect-video overflow-hidden rounded-lg bg-black">
              <HlsPreview ref="etPreviewRef" :src="etPreviewUrl" class="absolute inset-0" />
              <span class="absolute right-2 top-2 z-10 flex gap-1.5">
                <button type="button" title="Chụp thumbnail từ khung hình hiện tại"
                  class="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/30 text-white backdrop-blur transition hover:bg-black/50 disabled:opacity-50"
                  :disabled="etCapturing" @click="captureETThumb">
                  <i :class="etCapturing ? 'pi pi-spin pi-spinner text-sm' : 'pi pi-camera text-sm'"></i>
                </button>
                <button type="button" title="Đổi video"
                  class="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/30 text-green-400 backdrop-blur transition hover:bg-black/50"
                  @click="libDlg = true">
                  <i class="pi pi-pencil text-sm"></i>
                </button>
                <button type="button" title="Gỡ video"
                  class="flex h-9 w-9 items-center justify-center rounded-full border border-white/70 bg-black/30 text-red-400 backdrop-blur transition hover:bg-black/50"
                  @click="etForm.videoFileId = ''; etPreviewUrl = ''">
                  <i class="pi pi-trash text-sm"></i>
                </button>
              </span>
            </div>
            <div v-else class="rounded-lg border border-dashed border-neutral-300 p-4 text-center dark:border-neutral-700">
              <p v-if="etForm.videoFileId" class="mb-2 break-all text-xs text-neutral-500">{{ etForm.videoFileId }}</p>
              <p v-else class="mb-2 text-sm text-neutral-400">Chưa gắn video</p>
              <div class="flex flex-wrap justify-center gap-2">
                <Button label="Chọn từ thư viện" icon="pi pi-folder-open" size="small" severity="secondary" @click="libDlg = true; loadDoneFiles()" />
                <Button label="Nhập ID" icon="pi pi-link" size="small" severity="secondary" @click="showIdInput = !showIdInput" />
                <Button v-if="editingET?.id && etForm.videoFileId && !etPreviewUrl" label="Xem trước" icon="pi pi-play"
                  size="small" :loading="etPreviewBusy" @click="loadETPreview" />
              </div>
              <InputText v-if="showIdInput" v-model="etForm.videoFileId" class="mt-2 w-full" placeholder="Nhập ID file video" />
              <div class="mt-2 text-left"><MediaUploader @done="onETUploadDone" @attached="onETUploadAttached" /></div>
              <p v-if="etPreviewErr" class="mt-1 text-xs text-red-500">{{ etPreviewErr }}</p>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Đóng" text @click="etDlg = false" />
        <Button :label="editingET ? 'Lưu' : 'Thêm'" severity="success" :loading="etSaving"
          @click="saveET" :disabled="!etForm.name.trim() || etForm.order == null" />
      </template>
    </Dialog>

    <!-- ==================== DIALOG THU VIEN VIDEO ==================== -->
    <Dialog v-model:visible="libDlg" modal header="Thư viện video" class="w-[95vw] max-w-3xl">
      <DataTable :value="vodFiles" :loading="loadingFiles" size="small" paginator :rows="10">
        <Column header="Tên file">
          <template #body="{ data }"><span class="break-all text-sm">{{ fileLabel(data) }}</span></template>
        </Column>
        <Column header="" style="width:6rem">
          <template #body="{ data }">
            <Button label="Chọn" size="small" severity="success" @click="pickVideoFile(data)" />
          </template>
        </Column>
      </DataTable>
      <template #footer><Button label="Đóng" text @click="libDlg = false" /></template>
    </Dialog>

    <Menu ref="menu" :model="menuModel" popup />
  </div>
</template>

<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: 'auth' });
useHead({ title: 'Phim - VTC ANY CMS' });

const { can } = useCmsAuth();
const api = useApi();
const toast = useToast();
const confirm = useConfirm();

// ---- Views: movies | seasons | episodes | trailers ----
const view = ref<'movies' | 'seasons' | 'episodes' | 'trailers'>('movies');
const curMovie = ref<any>(null);   // phim dang quan ly mua/tap/trailer
const curSeason = ref<any>(null);   // mua dang quan ly tap/trailer
const backView = ref<'movies' | 'seasons'>('movies'); // nut back tu episodes/trailers ve dau

const movieTypes = [
  { label: 'Phim lẻ', value: 'single' },
  { label: 'Phim bộ', value: 'series' },
  { label: 'Short', value: 'short' },
];
const distOptions = [
  { label: 'Miễn phí', value: 'free' },
  { label: 'Trả phí', value: 'paid' },
];
const distFilterOptions = [
  { label: 'Miễn phí', value: 'free' },
  { label: 'Trả phí', value: 'paid' },
];
const epDistOptions = [
  { label: 'Theo phim', value: 'inherit' },
  { label: 'Miễn phí', value: 'free' },
  { label: 'Trả phí', value: 'paid' },
];
const epDistFilterOptions = [
  { label: 'Theo phim', value: 'inherit' },
  { label: 'Miễn phí', value: 'free' },
  { label: 'Trả phí', value: 'paid' },
];
const ageOptions = ['P - Phù hợp mọi độ tuổi', 'T13 - 13 tuổi trở lên', 'T16 - 16 tuổi trở lên', 'T18 - 18 tuổi trở lên'];

function typeLabel(t: string) { return movieTypes.find((x) => x.value === t)?.label || (t === 'short' ? 'Short' : 'Phim lẻ'); }
function distLabel(d: string) { return d === 'paid' ? 'Trả phí' : 'Miễn phí'; }
function distSev(d: string) { return d === 'paid' ? 'success' : 'danger'; }
function epDistLabel(d: string) { return d === 'paid' ? 'Trả phí' : d === 'free' ? 'Miễn phí' : 'Theo phim'; }
function epDistSev(d: string) { return d === 'paid' ? 'success' : d === 'free' ? 'danger' : 'warn'; }
function toIso(d: any) { return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : (d || ''); }
function toDate(v: any) { return v ? new Date(v) : null; }
function fmtDateTime(v: any) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function errMsg(e: any, fb: string) { return e?.response?.data?.error?.message || e?.data?.error?.message || e?.message || fb; }

// ---- Danh muc / the loai / goi cuoc ----
const categories = ref<any[]>([]);
const loadingCats = ref(false);
const genres = ref<any[]>([]);
const loadingGenres = ref(false);
const plans = ref<any[]>([]);
function typeCategories(kind: string) {
  return categories.value.filter((c) => {
    const a = c.appliesTo || [];
    return !a.length || a.includes(kind);
  });
}
function catChips(m: any): string[] {
  if (!Array.isArray(m.categoryIds)) return [];
  return m.categoryIds.slice(0, 3).map((id: string) => categories.value.find((c) => c.id === id)?.name || '').filter(Boolean);
}
function movieThumb(m: any) { return m.thumbnailUrl || m.thumbnail || m.posterUrl || m.poster || ''; }

// ---- Video files (thu vien) ----
const { files: vodFiles, loadingFiles, loadDoneFiles, fileLabel } = useVodFiles();

// ==================== PHIM ====================
const movies = ref<any[]>([]);
const moviesLoading = ref(false);
const selMovies = ref<any[]>([]);
const fType = ref<string | null>(null);
const fDist = ref<string | null>(null);
const fQ = ref('');

const filteredMovies = computed(() => {
  const q = fQ.value.trim().toLowerCase();
  return movies.value.filter((m) => {
    if (fType.value && (m.type || 'single') !== fType.value) return false;
    if (fDist.value && (m.distribution || 'free') !== fDist.value) return false;
    if (q && !(m.title || '').toLowerCase().includes(q)) return false;
    return true;
  });
});

async function loadMovies() {
  moviesLoading.value = true;
  try {
    const r = await api.get<any>('/admin/catalog/movies', { page: 1, limit: 100 });
    movies.value = r.data || [];
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được danh sách phim', life: 3000 }); }
  finally { moviesLoading.value = false; }
}

const dlg = ref(false);
const editing = ref<any>(null);
const saving = ref(false);
const emptyMovieForm = () => ({
  title: '', originalTitle: '', description: '', type: 'single', planId: '',
  categoryIds: [] as string[], genreIds: [] as string[], ageLimit: '', publishedAt: null as any,
  duration: '', releaseYear: null as any, distribution: 'free', price: null as any,
  posterUrl: '', thumbnailUrl: '', hasSubtitle: false, hasDubbing: false, isVisible: true,
});
const form = ref(emptyMovieForm());

function openAdd() { editing.value = null; form.value = emptyMovieForm(); dlg.value = true; }
function openEdit(m: any) {
  editing.value = m;
  form.value = {
    title: m.title || '', originalTitle: m.originalTitle || '', description: m.description || '',
    type: m.type || 'single', planId: m.planId || '', categoryIds: m.categoryIds || [], genreIds: m.genreIds || [],
    ageLimit: m.ageLimit || '', publishedAt: toDate(m.publishedAt),
    duration: m.duration || '', releaseYear: m.releaseYear ?? null, distribution: m.distribution || 'free',
    price: m.price ?? null, posterUrl: m.posterUrl || '', thumbnailUrl: m.thumbnailUrl || '',
    hasSubtitle: !!m.hasSubtitle, hasDubbing: !!m.hasDubbing, isVisible: m.isVisible !== false,
  };
  dlg.value = true;
}
async function save() {
  saving.value = true;
  try {
    const body = {
      title: form.value.title, originalTitle: form.value.originalTitle || undefined,
      description: form.value.description || undefined, type: form.value.type,
      planId: form.value.planId || undefined,
      categoryIds: form.value.categoryIds, genreIds: form.value.genreIds,
      ageLimit: form.value.ageLimit || undefined, publishedAt: toIso(form.value.publishedAt) || undefined,
      duration: form.value.duration || undefined, releaseYear: form.value.releaseYear ?? undefined,
      distribution: form.value.distribution, price: form.value.price ?? undefined,
      posterUrl: form.value.posterUrl || undefined, thumbnailUrl: form.value.thumbnailUrl || undefined,
      hasSubtitle: form.value.hasSubtitle, hasDubbing: form.value.hasDubbing, isVisible: form.value.isVisible,
    };
    if (editing.value) await api.patch(`/admin/catalog/movies/${editing.value.id}`, body);
    else await api.post('/admin/catalog/movies', body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu phim', life: 3000 });
    dlg.value = false; loadMovies();
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Lưu thất bại'), life: 3000 }); }
  finally { saving.value = false; }
}
async function toggleMovieVisible(m: any, v: boolean) {
  try {
    await api.post(`/admin/catalog/movies/${m.id}/${v ? 'publish' : 'unpublish'}`);
    m.isVisible = v;
    toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã công khai' : 'Đã ẩn', life: 2000 });
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Không đổi được trạng thái'), life: 3000 }); }
}
function delMovie(m: any) {
  confirm.require({
    message: `Xóa phim "${m.title}"? Toàn bộ mùa, tập phim và trailer sẽ bị xóa theo.`, header: 'Xác nhận',
    icon: 'pi pi-exclamation-triangle', acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/catalog/movies/${m.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa phim', life: 3000 });
        loadMovies();
      } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Xóa thất bại'), life: 3000 }); }
    },
  });
}
async function batchMovies(published: boolean) {
  for (const m of selMovies.value) {
    try { await api.post(`/admin/catalog/movies/${m.id}/${published ? 'publish' : 'unpublish'}`); m.isVisible = published; }
    catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `${m.title}: ${errMsg(e, 'thất bại')}`, life: 3000 }); }
  }
  selMovies.value = [];
  toast.add({ severity: 'success', summary: 'Xong', detail: published ? 'Đã công khai các phim đã chọn' : 'Đã ẩn các phim đã chọn', life: 3000 });
}
function batchDeleteMovies() {
  confirm.require({
    message: `Xóa ${selMovies.value.length} phim đã chọn? Toàn bộ mùa, tập phim và trailer sẽ bị xóa theo.`,
    header: 'Xác nhận', icon: 'pi pi-exclamation-triangle', acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      for (const m of [...selMovies.value]) {
        try { await api.del(`/admin/catalog/movies/${m.id}`); }
        catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `${m.title}: ${errMsg(e, 'thất bại')}`, life: 3000 }); }
      }
      selMovies.value = []; loadMovies();
    },
  });
}

// ---- Menu "..." tren moi dong ----
const menu = ref();
const menuModel = ref<any[]>([]);
function openRowMenu(e: Event, row: any, kind: 'movie' | 'season') {
  if (kind === 'movie') {
    menuModel.value = (row.type || 'single') === 'series'
      ? [{ label: 'Phần / Mùa', icon: 'pi pi-list', command: () => openSeasons(row) }]
      : [
          { label: 'Trailer', icon: 'pi pi-play', command: () => openTrailers({ movieId: row.id, title: row.title }, 'movies') },
          { label: 'Tập phim', icon: 'pi pi-video', command: () => openEpisodes({ movieId: row.id, title: row.title }, 'movies') },
        ];
  } else {
    menuModel.value = [
      { label: 'Trailer', icon: 'pi pi-play', command: () => openTrailers({ seasonId: row.id, title: row.title || row.name }, 'seasons') },
      { label: 'Tập phim', icon: 'pi pi-video', command: () => openEpisodes({ movieId: row.movieId, seasonId: row.id, title: row.title || row.name }, 'seasons') },
    ];
  }
  menu.value.toggle(e);
}

// ==================== MUA / PHAN ====================
const seasons = ref<any[]>([]);
const seasonsLoading = ref(false);
const selSeasons = ref<any[]>([]);
const seasonDlg = ref(false);
const editingSeason = ref<any>(null);
const seasonSaving = ref(false);
const emptySeasonForm = () => ({
  title: '', description: '', order: null as any, year: null as any, publishedAt: null as any,
  poster: '', thumbnail: '', isVisible: true,
});
const seasonForm = ref(emptySeasonForm());

function openSeasons(m: any) {
  curMovie.value = m; curSeason.value = null;
  view.value = 'seasons'; selSeasons.value = [];
  loadSeasons();
}
async function loadSeasons() {
  if (!curMovie.value) return;
  seasonsLoading.value = true;
  try {
    const r = await api.get<any>(`/admin/catalog/movies/${curMovie.value.id}/seasons`, { page: 1, limit: 100 });
    seasons.value = (r.data || []).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được mùa / phần', life: 3000 }); }
  finally { seasonsLoading.value = false; }
}
function openSeasonAdd() {
  editingSeason.value = null;
  seasonForm.value = { ...emptySeasonForm(), order: (seasons.value.length || 0) + 1 };
  seasonDlg.value = true;
}
function openSeasonEdit(s: any) {
  editingSeason.value = s;
  seasonForm.value = {
    title: s.title || '', description: s.description || '', order: s.order ?? null, year: s.year ?? null,
    publishedAt: toDate(s.publishedAt), poster: s.poster || '', thumbnail: s.thumbnail || '',
    isVisible: s.isVisible !== false,
  };
  seasonDlg.value = true;
}
async function saveSeason() {
  seasonSaving.value = true;
  try {
    const body = { ...seasonForm.value, publishedAt: toIso(seasonForm.value.publishedAt) || undefined };
    if (editingSeason.value) await api.patch(`/admin/catalog/seasons/${editingSeason.value.id}`, body);
    else await api.post(`/admin/catalog/movies/${curMovie.value.id}/seasons`, body);
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu mùa / phần', life: 3000 });
    seasonDlg.value = false; loadSeasons();
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Lưu thất bại'), life: 3000 }); }
  finally { seasonSaving.value = false; }
}
async function toggleSeasonVisible(s: any, v: boolean) {
  try {
    await api.post(`/admin/catalog/seasons/${s.id}/${v ? 'publish' : 'unpublish'}`);
    s.isVisible = v;
    toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã công khai' : 'Đã ẩn', life: 2000 });
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Không đổi được trạng thái'), life: 3000 }); }
}
function delSeason(s: any) {
  confirm.require({
    message: `Xóa "${s.title}"? Toàn bộ tập phim và trailer của mùa sẽ bị xóa theo.`, header: 'Xác nhận',
    icon: 'pi pi-exclamation-triangle', acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/catalog/seasons/${s.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa mùa / phần', life: 3000 });
        loadSeasons();
      } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Xóa thất bại'), life: 3000 }); }
    },
  });
}
async function batchSeasons(published: boolean) {
  for (const s of selSeasons.value) {
    try { await api.post(`/admin/catalog/seasons/${s.id}/${published ? 'publish' : 'unpublish'}`); s.isVisible = published; }
    catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `${s.title}: ${errMsg(e, 'thất bại')}`, life: 3000 }); }
  }
  selSeasons.value = [];
  toast.add({ severity: 'success', summary: 'Xong', detail: published ? 'Đã công khai các mùa đã chọn' : 'Đã ẩn các mùa đã chọn', life: 3000 });
}
function batchDeleteSeasons() {
  confirm.require({
    message: `Xóa ${selSeasons.value.length} mùa đã chọn? Tập phim và trailer sẽ bị xóa theo.`,
    header: 'Xác nhận', icon: 'pi pi-exclamation-triangle', acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      for (const s of [...selSeasons.value]) {
        try { await api.del(`/admin/catalog/seasons/${s.id}`); }
        catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `${s.title}: ${errMsg(e, 'thất bại')}`, life: 3000 }); }
      }
      selSeasons.value = []; loadSeasons();
    },
  });
}

// ==================== TAP PHIM / TRAILER (dung chung dialog) ====================
const epOwner = ref<{ movieId: string; seasonId?: string; title: string }>({ movieId: '', title: '' });
const trOwner = ref<{ movieId?: string; seasonId?: string; title: string }>({ title: '' });
const etKind = ref<'episode' | 'trailer'>('episode');
const etItems = ref<any[]>([]);
const epsLoading = ref(false);
const selET = ref<any[]>([]);
const fEpDist = ref<string | null>(null);
const fEpQ = ref('');

const filteredEps = computed(() => {
  const q = fEpQ.value.trim().toLowerCase();
  return etItems.value.filter((it) => {
    if (fEpDist.value && (it.distribution || 'inherit') !== fEpDist.value) return false;
    if (q && !((it.name || it.title || '').toLowerCase().includes(q))) return false;
    return true;
  });
});
const filteredET = computed(() => filteredEps.value);
const etDialogTitle = computed(() => {
  const base = etKind.value === 'trailer' ? 'trailer' : 'tập phim';
  return `${editingET.value ? 'Cập nhật' : 'Thêm'} ${base}`;
});

function openEpisodes(owner: { movieId: string; seasonId?: string; title: string }, from: 'movies' | 'seasons') {
  epOwner.value = owner; backView.value = from;
  view.value = 'episodes'; selET.value = []; fEpDist.value = null; fEpQ.value = '';
  loadET();
}
function openTrailers(owner: { movieId?: string; seasonId?: string; title: string }, from: 'movies' | 'seasons') {
  trOwner.value = owner; backView.value = from;
  view.value = 'trailers'; selET.value = [];
  loadET();
}
function backFromEpisodes() { view.value = backView.value; if (backView.value === 'seasons') loadSeasons(); }
function backFromTrailers() { view.value = backView.value; if (backView.value === 'seasons') loadSeasons(); }

async function loadET() {
  epsLoading.value = true;
  try {
    let url: string;
    const params: any = { page: 1, limit: 100 };
    if (view.value === 'episodes') {
      url = `/admin/catalog/movies/${epOwner.value.movieId}/episodes`;
      if (epOwner.value.seasonId) params.seasonId = epOwner.value.seasonId;
    } else {
      url = trOwner.value.movieId
        ? `/admin/catalog/movies/${trOwner.value.movieId}/trailers`
        : `/admin/catalog/seasons/${trOwner.value.seasonId}/trailers`;
    }
    const r = await api.get<any>(url, params);
    etItems.value = (r.data || []).sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0));
  } catch { toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được dữ liệu', life: 3000 }); }
  finally { epsLoading.value = false; }
}

// ---- Dialog tap / trailer ----
const etDlg = ref(false);
const editingET = ref<any>(null);
const etSaving = ref(false);
const showIdInput = ref(false);
const libDlg = ref(false);
const emptyETForm = () => ({
  name: '', description: '', order: null as any, publishedAt: null as any, duration: '',
  subtitleEn: '', subtitleVi: '', thumbnail: '', videoFileId: '',
  isVisible: true, showAds: false, distribution: 'inherit', price: null as any,
});
const etForm = ref(emptyETForm());

// Xem truoc video ngay trong form.
const etPreviewUrl = ref('');
const etPreviewBusy = ref(false);
const etPreviewErr = ref('');
const etPreviewRef = ref<any>(null);
const etCapturing = ref(false);

function openETAdd(kind: 'episode' | 'trailer') {
  etKind.value = kind; editingET.value = null;
  etForm.value = { ...emptyETForm(), order: (etItems.value.length || 0) + 1 };
  etPreviewUrl.value = ''; etPreviewErr.value = ''; showIdInput.value = false;
  etDlg.value = true;
  loadDoneFiles();
}
function openETEdit(kind: 'episode' | 'trailer', it: any) {
  etKind.value = kind; editingET.value = it;
  etPreviewUrl.value = ''; etPreviewErr.value = ''; showIdInput.value = false;
  etForm.value = {
    name: it.name || it.title || '', description: it.description || '', order: it.order ?? null,
    publishedAt: toDate(it.publishedAt), duration: it.duration || '',
    subtitleEn: it.subtitleEn || '', subtitleVi: it.subtitleVi || '', thumbnail: it.thumbnail || '',
    videoFileId: it.videoFileId || '', isVisible: it.isVisible !== false, showAds: !!it.showAds,
    distribution: it.distribution || 'inherit', price: it.price ?? null,
  };
  etDlg.value = true;
  loadDoneFiles();
}
async function saveET() {
  etSaving.value = true;
  try {
    const body = { ...etForm.value, publishedAt: toIso(etForm.value.publishedAt) || undefined };
    if (etKind.value === 'episode') {
      if (editingET.value) await api.patch(`/admin/catalog/episodes/${editingET.value.id}`, body);
      else await api.post(`/admin/catalog/movies/${epOwner.value.movieId}/episodes`, { ...body, seasonId: epOwner.value.seasonId || null });
    } else {
      if (editingET.value) await api.patch(`/admin/catalog/trailers/${editingET.value.id}`, body);
      else if (trOwner.value.movieId) await api.post(`/admin/catalog/movies/${trOwner.value.movieId}/trailers`, body);
      else await api.post(`/admin/catalog/seasons/${trOwner.value.seasonId}/trailers`, body);
    }
    toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã lưu', life: 3000 });
    etDlg.value = false; loadET();
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Lưu thất bại'), life: 3000 }); }
  finally { etSaving.value = false; }
}
async function loadETPreview() {
  if (!editingET.value?.id) return;
  etPreviewBusy.value = true; etPreviewErr.value = '';
  try {
    const url = etKind.value === 'episode'
      ? `/admin/catalog/episodes/${editingET.value.id}/play`
      : `/admin/catalog/trailers/${editingET.value.id}/play`;
    const r = await api.get<any>(url);
    etPreviewUrl.value = r.hls_path || '';
    if (!etPreviewUrl.value) etPreviewErr.value = 'Chưa có URL phát.';
  } catch (e: any) { etPreviewErr.value = errMsg(e, 'Video chưa sẵn sàng (chưa gắn file hoặc transcode chưa xong).'); }
  finally { etPreviewBusy.value = false; }
}
function pickVideoFile(f: any) {
  etForm.value.videoFileId = f.id;
  etPreviewUrl.value = ''; etPreviewErr.value = '';
  libDlg.value = false;
  autoETThumbFromFile();
  toast.add({ severity: 'success', summary: 'Đã chọn video', detail: fileLabel(f), life: 2500 });
}
function onETUploadAttached(uploadId: string) {
  // Gan file ngay khi upload xong (transcode con chay ngam): luu som van giu duoc
  // videoFileId, tap phat duoc ngay khi worker transcode xong.
  if (!etForm.value.videoFileId) etForm.value.videoFileId = uploadId;
}
function onETUploadDone(uploadId: string) {
  etForm.value.videoFileId = uploadId;
  etPreviewUrl.value = ''; etPreviewErr.value = '';
  loadDoneFiles(); autoETThumbFromFile();
  toast.add({ severity: 'success', summary: 'Upload xong', detail: 'Đã gắn file video vừa tải lên.', life: 3000 });
}
// Thumbnail tu dong: dung poster worker cat san neu chua co anh rieng.
function autoETThumbFromFile() {
  if (etForm.value.thumbnail) return;
  const f = vodFiles.value.find((x) => x.id === etForm.value.videoFileId);
  if (f?.posterUrl) etForm.value.thumbnail = f.posterUrl;
}
// Chup khung hinh dang phat lam thumbnail.
async function captureETThumb() {
  if (!etPreviewRef.value?.captureFrame) return;
  etCapturing.value = true;
  try {
    const blob = await etPreviewRef.value.captureFrame();
    if (!blob) {
      toast.add({ severity: 'warn', summary: 'Chưa chụp được', detail: 'Hãy để video phát một lúc rồi thử lại.', life: 3000 });
      return;
    }
    const file = new File([blob], `thumb-${Date.now()}.jpg`, { type: 'image/jpeg' });
    const res = await api.put<any>('/uploads/image', file, { 'Content-Type': 'image/jpeg', 'x-file-name': encodeURIComponent(file.name) });
    if (res?.url) {
      etForm.value.thumbnail = res.url;
      toast.add({ severity: 'success', summary: 'Đã cắt thumbnail từ video', life: 2500 });
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Chụp thumbnail lỗi', detail: errMsg(e, 'Thử lại sau.'), life: 3000 });
  } finally { etCapturing.value = false; }
}
watch(() => etForm.value.videoFileId, () => { etPreviewUrl.value = ''; etPreviewErr.value = ''; });
watch(etDlg, (open) => { if (!open) { etPreviewUrl.value = ''; etPreviewErr.value = ''; } });

async function toggleETVisible(it: any, v: boolean) {
  const base = etKind.value === 'episode' || view.value === 'episodes' ? 'episodes' : 'trailers';
  try {
    await api.post(`/admin/catalog/${base}/${it.id}/${v ? 'publish' : 'unpublish'}`);
    it.isVisible = v;
    toast.add({ severity: 'success', summary: 'Xong', detail: v ? 'Đã công khai' : 'Đã ẩn', life: 2000 });
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Không đổi được trạng thái'), life: 3000 }); }
}
function delET(it: any) {
  const base = view.value === 'episodes' ? 'episodes' : 'trailers';
  const label = it.name || it.title;
  confirm.require({
    message: `Xóa "${label}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
    acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      try {
        await api.del(`/admin/catalog/${base}/${it.id}`);
        toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa', life: 3000 });
        loadET();
      } catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: errMsg(e, 'Xóa thất bại'), life: 3000 }); }
    },
  });
}
async function batchET(published: boolean) {
  const base = view.value === 'episodes' ? 'episodes' : 'trailers';
  for (const it of selET.value) {
    try { await api.post(`/admin/catalog/${base}/${it.id}/${published ? 'publish' : 'unpublish'}`); it.isVisible = published; }
    catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `${it.name || it.title}: ${errMsg(e, 'thất bại')}`, life: 3000 }); }
  }
  selET.value = [];
  toast.add({ severity: 'success', summary: 'Xong', detail: published ? 'Đã công khai các mục đã chọn' : 'Đã ẩn các mục đã chọn', life: 3000 });
}
function batchDeleteET() {
  const base = view.value === 'episodes' ? 'episodes' : 'trailers';
  confirm.require({
    message: `Xóa ${selET.value.length} mục đã chọn?`, header: 'Xác nhận',
    icon: 'pi pi-exclamation-triangle', acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
    accept: async () => {
      for (const it of [...selET.value]) {
        try { await api.del(`/admin/catalog/${base}/${it.id}`); }
        catch (e: any) { toast.add({ severity: 'error', summary: 'Lỗi', detail: `${it.name || it.title}: ${errMsg(e, 'thất bại')}`, life: 3000 }); }
      }
      selET.value = []; loadET();
    },
  });
}

// ---- Khoi tao ----
onMounted(async () => {
  loadMovies();
  try {
    const r = await api.get<any>('/admin/catalog/plans', { page: 1, limit: 100 });
    plans.value = r.data || [];
  } catch { /* bỏ qua */ }
  loadingCats.value = true;
  try {
    const r = await api.get<any>('/admin/categories');
    categories.value = r.data || [];
  } catch { categories.value = []; }
  finally { loadingCats.value = false; }
  loadingGenres.value = true;
  try {
    const r = await api.get<any>('/admin/catalog/genres', { page: 1, limit: 100 });
    genres.value = r.data || [];
  } catch { genres.value = []; }
  finally { loadingGenres.value = false; }
});
</script>
