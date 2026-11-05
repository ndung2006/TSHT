// Cache so dem sidebar theo user — Map o muc module (khong phai Nest
// provider) de ca SidebarCountsService (doc/ghi) va cac service viet
// approval/tap bai (xoa) dung chung mot kho ma khong can DI cheo
// module. Khuon defCache cua DashboardService (TTL 30 giay); o day TTL
// 60 giay theo yeu cau dot 2 (trung cua so nghiem thu 60 giay).
//
// Gioi han (ghi ro trong bao cao dot 2): xoa theo actor chi lam moi so
// cua chinh nguoi vua hanh dong. So cua nguoi khac (vd A duyet xong thi
// hang cho cua B o buoc sau tang) chi cap nhat sau toi da 1 TTL — van
// trong 60 giay theo yeu cau, nhung khong tuc thi.

const TTL_MS = 60_000;

const cache = new Map<string, { at: number; data: any }>();

export function getSidebarCountsCache(userId: string): any | null {
  const hit = cache.get(userId);
  if (!hit) return null;
  if (Date.now() - hit.at >= TTL_MS) {
    cache.delete(userId);
    return null;
  }
  return hit.data;
}

export function setSidebarCountsCache(userId: string, data: any): void {
  cache.set(userId, { at: Date.now(), data });
}

/** Xoa cache cua 1 user (goi cuoi transition/tap moi). userId null -> no-op. */
export function clearSidebarCounts(userId: string | null | undefined): void {
  if (!userId) return;
  cache.delete(userId);
}
