// Helpers dùng chung cho các trang CRUD qua /admin/catalog (quy ước giống pages/videos.vue).
export function useCatalog(entity: string | { value: string } | (() => string)) {
  const api = useApi();
  const toast = useToast();
  const items = ref<any[]>([]);
  const meta = ref({ page: 1, limit: 20, total: 0 });
  const loading = ref(true);
  const name = () => toValue(entity as any) as string;

  async function load() {
    loading.value = true;
    try {
      const r = await api.get<any>(`/admin/catalog/${name()}`, { page: meta.value.page, limit: meta.value.limit });
      items.value = r.data || [];
      meta.value = { ...meta.value, ...r.meta };
    } catch {
      toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Không tải được dữ liệu', life: 3000 });
    } finally { loading.value = false; }
  }

  function onPage(e: any) { meta.value.page = e.page + 1; load(); }

  async function saveItem(editingId: string | null, body: any, okMsg: string): Promise<boolean> {
    try {
      if (editingId) await api.patch(`/admin/catalog/${name()}/${editingId}`, body);
      else await api.post(`/admin/catalog/${name()}`, body);
      toast.add({ severity: 'success', summary: 'Xong', detail: okMsg, life: 3000 });
      return true;
    } catch (e: any) {
      toast.add({ severity: 'error', summary: 'Lỗi', detail: e?.response?.data?.error?.message || 'Lưu thất bại', life: 3000 });
      return false;
    }
  }

  function confirmDelete(confirm: any, id: string, label: string) {
    confirm.require({
      message: `Xóa "${label}"?`, header: 'Xác nhận', icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Xóa', rejectLabel: 'Hủy', acceptClass: 'p-button-danger',
      accept: async () => {
        try {
          await api.del(`/admin/catalog/${name()}/${id}`);
          toast.add({ severity: 'success', summary: 'Xong', detail: 'Đã xóa', life: 3000 });
          load();
        } catch {
          toast.add({ severity: 'error', summary: 'Lỗi', detail: 'Xóa thất bại', life: 3000 });
        }
      },
    });
  }

  return { api, toast, items, meta, loading, load, onPage, saveItem, confirmDelete };
}

export function fmtDate(v: any): string {
  if (!v) return '';
  return new Date(typeof v === 'number' ? v : String(v)).toLocaleString('vi-VN');
}

export function fmtSize(bytes: any): string {
  const n = Number(bytes);
  if (!n || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// InputText "a, b, c" <-> string[]
export function idsToText(v: any): string {
  return Array.isArray(v) ? v.join(', ') : (v || '');
}
export function textToIds(v: string): string[] {
  return (v || '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function sevVisible(v: any): string {
  return v ? 'success' : 'secondary';
}
