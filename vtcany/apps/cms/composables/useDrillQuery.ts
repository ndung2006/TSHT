// Drill-down tu dashboard GĐ1: trang danh sach doc route.query luc mo
// trang va truyen thang cac tham so drill vao API danh sach (widget va
// danh sach dung chung mot dinh nghia loc o backend, so tren widget =
// so dong danh sach). Drill thang tren loc cua trang (khong ghi de
// dropdown cua nguoi dung mot cach am tham): chip "Dang loc theo
// dashboard" hien ro loc dang ap; nut "Xoa loc" xoa query va tai lai.
export function useDrillQuery() {
  const route = useRoute();
  const router = useRouter();
  const drill = ref<Record<string, string>>({});
  const hasDrill = computed(() => Object.keys(drill.value).length > 0);

  function initDrill(keys: string[]) {
    const d: Record<string, string> = {};
    for (const k of keys) {
      const v = route.query[k];
      if (typeof v === 'string' && v !== '') d[k] = v;
    }
    drill.value = d;
    return d;
  }

  function clearDrill() {
    drill.value = {};
    router.replace({ query: {} });
  }

  const LABELS: Record<string, (v: string) => string> = {
    q: (v) => `từ khóa "${v}"`,
    status: (v) => ({ draft: 'Nháp', pending_review: 'Chờ duyệt', published: 'Đã xuất bản', unpublished: 'Hạ xuất bản', approved: 'Đã duyệt' }[v] || v),
    royaltyStatus: (v) => ({ draft: 'Nháp', pending_review: 'Chờ duyệt', approved: 'Đã duyệt', none: 'Chưa có nhuận bút' }[v] || v),
    workflowStep: (v) => `bước ${v}`,
    myQueue: () => 'hàng chờ của tôi',
    mine: () => 'của tôi',
    returned: () => 'bị trả về',
    neverSubmitted: () => 'chưa từng gửi',
    scheduled: () => 'chờ xuất bản',
    categoryId: () => 'theo chuyên mục',
    publishFrom: (v) => `từ ${v.slice(0, 10)}`,
    publishTo: (v) => `đến ${v.slice(0, 10)}`,
    issueNumber: (v) => `số ${v}`,
    issueType: (v) => (v === 'vung_cao' ? 'Vùng cao' : 'Thường'),
    actor: (v) => `người thực hiện "${v}"`,
    action: (v) => `hành động "${v}"`,
    channel: () => 'theo kênh',
    date: (v) => `ngày ${v}`,
  };
  const drillLabel = computed(() => Object.entries(drill.value)
    .map(([k, v]) => (LABELS[k] ? LABELS[k](v) : `${k}=${v}`)).join(' · '));

  return { drill, hasDrill, initDrill, clearDrill, drillLabel };
}
