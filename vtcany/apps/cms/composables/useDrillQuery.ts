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
    unpublishedFrom: (v) => `hạ xuất bản từ ${v.slice(0, 10)}`,
    unpublishedTo: (v) => `hạ xuất bản đến ${v.slice(0, 10)}`,
    issueNumber: (v) => `số ${v}`,
    issueType: (v) => (v === 'vung_cao' ? 'Vùng cao' : 'Thường'),
    actor: (v) => `người thực hiện "${v}"`,
    action: (v) => `hành động "${v}"`,
    channel: () => 'theo kênh',
    date: (v) => `ngày ${v}`,
  };
  // Tham so nguon chi de phan biet chip, khong phai loc: menu sidebar
  // gan src=menu cho muc con "Bi tra ve" (workspaces.ts); drill tu B1
  // khong co src. src doc truc tiep tu route.query, khong nam trong
  // drill.value nen khong bao gio gui kem API danh sach (khong can
  // sua initDrill cac trang).
  const drillSrc = computed(() => (route.query.src === 'menu' ? 'menu' : null));

  const drillLabel = computed(() => {
    // Chip cua muc con menu "Bi tra ve" (src=menu): ghi dung ten muc
    // "Bi tra ve" thay cho "Nhap · bi tra ve" cua drill B1.
    if (drillSrc.value === 'menu' && drill.value.returned) return 'Bị trả về';
    return Object.entries(drill.value)
      .map(([k, v]) => (LABELS[k] ? LABELS[k](v) : `${k}=${v}`)).join(' · ');
  });

  // Chip loc: khi drill chi co duy nhat status (truong hop vao tu menu
  // sidebar ?status=), hien "Dang loc: <trang thai>" thay cho "Dang loc
  // theo dashboard". Dashboard drill thuong kem q/myQueue/... nen van
  // giu chu cu khi co them khoa khac. Rieng drill tu menu (src=menu)
  // luon hien "Dang loc:" du query co nhieu khoa (vd Bi tra ve gom
  // status + returned) — phan biet voi drill cung query tu B1.
  const isStatusOnlyDrill = computed(() => Object.keys(drill.value).length === 1 && drill.value.status !== undefined);
  const chipPrefix = computed(() => (drillSrc.value === 'menu' || isStatusOnlyDrill.value ? 'Đang lọc:' : 'Đang lọc theo dashboard:'));

  return { drill, hasDrill, initDrill, clearDrill, drillLabel, chipPrefix, drillSrc };
}
