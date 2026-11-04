// Tai cau hinh quy trinh duyet tu API cho cac trang duyet hien thi dong.
// Cache theo phan he trong phien lam viec; neu API loi (chua co quyen
// workflows:view hoac backend chua chay migration) thi tra null de trang
// dung fallback text cu — khong vo giao dien.
export function useWorkflowConfig() {
  const api = useApi();
  const cache = reactive<Record<string, any>>({});

  async function load(key: string) {
    if (cache[key]) return cache[key];
    try {
      const d = await api.get<any>(`/admin/workflows/${key}`);
      cache[key] = d;
      return d;
    } catch {
      return null;
    }
  }

  /** Chuoi nhan day du cac buoc: "MD — ... → T.PP — ... → ..." */
  function labelsChain(d: any): string {
    return (d?.steps || []).map((s: any) => s.label).join(' → ');
  }

  /** Chuoi ten Role viet tat: "PV → TP → PBĐT → BBT → XB" (buoc nhieu
   *  Role noi bang "/": "TBT/P.TBT"). */
  function rolesChain(d: any): string {
    const parts = [d?.authorRole, ...(d?.steps || []).map((s: any) => (s.roleNames?.length ? s.roleNames.join('/') : s.roleName))].filter(Boolean);
    return parts.join(' → ');
  }

  /** Chuoi panel Quy trinh: nguoi tao + cac buoc (kem nhan day du). */
  function panelSteps(d: any): { num: number; label: string }[] {
    const steps = (d?.steps || []).map((s: any, i: number) => ({ num: i + 1, label: s.label }));
    return [{ num: 0, label: d?.authorLabel || '' }, ...steps];
  }

  /** Buoc hien tai co cho phep duyet khan khong. */
  function stepAllowsEmergency(d: any, step: number): boolean {
    return d?.steps?.[step - 1]?.allowEmergency === true;
  }

  return { load, labelsChain, rolesChain, panelSteps, stepAllowsEmergency, cache };
}
