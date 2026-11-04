// Dinh nghia truy van dung chung cho dashboard GĐ1 — file thuan, KHONG
// import Nest/Prisma (where Prisma la object JS thuan) de:
// (1) widget va API danh sach drill-down dung chung mot dinh nghia, so
//     tren widget = so dong danh sach (tai lieu duyet 11.2 muc 8);
// (2) test truc tiep bang node --test.
// Chu y: cac bang *Approval DEU co index (ma muc, createdAt) nen khong
// can migration them index (quyet dinh 15 trong brief da thoa man san).

import { latestApprovalsByItem } from './dashboard-helpers';

export interface DashboardModuleMeta {
  key: string;
  label: string;
  workflowKey: string;
  route: string;
  /** Ten truong tieu de tren bang muc (royalties lay qua quan he article). */
  titleField: 'title' | 'article.title';
  /** Ten model Prisma cua bang muc / bang approval (dung (db as any)[...]). */
  itemModel: string;
  approvalModel: string;
  approvalFk: string;
}

/** 7 phan he cua A1 (tai lieu duyet 11.1 muc 5). Video chua vao (catalog
 *  item khong co workflowStep). */
export const DASHBOARD_MODULES: DashboardModuleMeta[] = [
  { key: 'news', label: 'Tin bài', workflowKey: 'news', route: '/tin-bai', titleField: 'title', itemModel: 'newsArticle', approvalModel: 'newsArticleApproval', approvalFk: 'articleId' },
  { key: 'epaper', label: 'Báo in', workflowKey: 'epaper', route: '/bao-in', titleField: 'title', itemModel: 'epaperIssue', approvalModel: 'epaperIssueApproval', approvalFk: 'issueId' },
  { key: 'printArticle', label: 'Bài báo in', workflowKey: 'print-article', route: '/bai-bao-in', titleField: 'title', itemModel: 'printArticle', approvalModel: 'printArticleApproval', approvalFk: 'articleId' },
  { key: 'events', label: 'Sự kiện', workflowKey: 'events', route: '/su-kien-toa-soan', titleField: 'title', itemModel: 'newsroomEvent', approvalModel: 'newsroomEventApproval', approvalFk: 'eventId' },
  { key: 'liveblog', label: 'Tường thuật', workflowKey: 'liveblog', route: '/tuong-thuat', titleField: 'title', itemModel: 'liveblog', approvalModel: 'liveblogApproval', approvalFk: 'liveblogId' },
  { key: 'ads', label: 'Quảng cáo', workflowKey: 'ads', route: '/quang-cao-toa-soan', titleField: 'title', itemModel: 'newsroomAd', approvalModel: 'newsroomAdApproval', approvalFk: 'adId' },
  { key: 'royalties', label: 'Nhuận bút', workflowKey: 'royalties', route: '/nhuan-but', titleField: 'article.title', itemModel: 'articleRoyalty', approvalModel: 'articleRoyaltyApproval', approvalFk: 'royaltyId' },
];

export const moduleMeta = (key: string): DashboardModuleMeta => {
  const m = DASHBOARD_MODULES.find((x) => x.key === key);
  if (!m) throw new Error(`unknown dashboard module: ${key}`);
  return m;
};

/** Trang thai "dang trong quy trinh" cua tung phan he (buoc > 0). */
export function pendingWhere(step?: number): Record<string, unknown> {
  return { status: 'pending_review', ...(step ? { workflowStep: step } : {}) };
}

/**
 * Dieu kien hang cho cua toi (A1) dung chung cho widget va danh sach:
 * dang cho duyet + (buoc chi dinh neu co) + toi khong phai nguoi tao +
 * toi khong co BAT KY approval nao tren muc. Viec buoc co thuoc role cua
 * toi hay khong do lop service/controller kiem tra bang stepRole map
 * (widget tinh san; danh sach chi nhan workflowStep tu drill cua widget).
 * Fail-closed: khong co userId -> khong tra dong nao.
 */
export function myQueueWhere(userId: string | null | undefined, step?: number): Record<string, unknown> {
  if (!userId) return { id: '___no_user___' };
  return {
    ...pendingWhere(step),
    createdBy: { not: userId },
    approvals: { none: { actorId: userId } },
  };
}

/** Bai nhap chua tung gui (A3 hieu chat): draft + khong co approval submit. */
export function strictDraftWhere(userId: string | null | undefined): Record<string, unknown> {
  if (!userId) return { id: '___no_user___' };
  return {
    status: 'draft',
    createdBy: userId,
    approvals: { none: { action: 'submit' } },
  };
}

/** Bai cua toi dang bi tra (A2): draft + createdBy = toi (loc "gan nhat la
 *  return" thuc hien o lop service bang latestApprovalsByItem, vi Prisma
 *  khong bieu dien truc tiep "approval moi nhat"). */
export function myReturnedBaseWhere(userId: string | null | undefined): Record<string, unknown> {
  if (!userId) return { id: '___no_user___' };
  return { status: 'draft', createdBy: userId };
}

/**
 * Map role cua buoc tu cac WorkflowDefinition: { [workflowKey]: { [step]: roleName } }.
 * Buoc k = vi tri thu sortOrder (1-based), dung quy uoc cua workflow-engine
 * (steps('news')[step - 1].roleName). Steps lay tu DB, fallback o service.
 */
export function stepRolesFromDefinitions(
  definitions: Array<{ moduleKey: string; steps: Array<{ roleName: string; sortOrder: number }> }>,
): Record<string, Record<number, string>> {
  const out: Record<string, Record<number, string>> = {};
  for (const d of definitions) {
    const sorted = [...(d.steps || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    out[d.moduleKey] = {};
    sorted.forEach((s, i) => {
      out[d.moduleKey][i + 1] = s.roleName;
    });
  }
  return out;
}

/** Map nhan buoc tu definitions (cung thu tu sortOrder nhu stepRoles). */
export function stepLabelsFromDefinitions(
  definitions: Array<{ moduleKey: string; steps: Array<{ label: string; sortOrder: number }> }>,
): Record<string, Record<number, string>> {
  const out: Record<string, Record<number, string>> = {};
  for (const d of definitions) {
    const sorted = [...(d.steps || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    out[d.moduleKey] = {};
    sorted.forEach((s, i) => {
      out[d.moduleKey][i + 1] = s.label;
    });
  }
  return out;
}

/**
 * Drill-down dung chung cho cac API danh sach (nhap tu service cua tung
 * phan he, khong phu thuoc Nest). Cung dinh nghia voi widget:
 * - returned: muc nhap ma approval GAN NHAT la 'return' (Prisma khong
 *   bieu dien truc tiep "moi nhat" nen loc 2 buoc: lay approval cua cac
 *   muc ung vien roi phan loai bang latestApprovalsByItem).
 * - neverSubmitted: muc nhap chua tung co approval 'submit'.
 * Ca hai tra ve danh sach id de service gan where.id IN (...).
 */
export async function drillReturnedIds(
  db: any,
  approvalModel: string,
  fk: string,
  candidateIds: string[],
): Promise<string[]> {
  if (!candidateIds.length) return [];
  const rows = await db[approvalModel].findMany({
    where: { [fk]: { in: candidateIds } },
    select: { [fk]: true, action: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const latest = latestApprovalsByItem(rows.map((r: any) => ({
    itemId: r[fk], step: 0, action: r.action, createdAt: r.createdAt,
  })));
  return candidateIds.filter((id) => latest.get(id)?.action === 'return');
}

export async function drillNeverSubmittedIds(
  db: any,
  approvalModel: string,
  fk: string,
  candidateIds: string[],
): Promise<string[]> {
  if (!candidateIds.length) return [];
  const rows = await db[approvalModel].findMany({
    where: { [fk]: { in: candidateIds }, action: 'submit' },
    select: { [fk]: true },
  });
  const submitted = new Set<string>(rows.map((r: any) => r[fk] as string));
  return candidateIds.filter((id) => !submitted.has(id));
}

/**
 * Ap loc drill-down tu dashboard GĐ1 vao where cua API danh sach (dung
 * chung cho bao in / bai bao in / su kien / tuong thuat / quang cao /
 * nhuan but; tin bai dung buildListWhere rieng vi co scope san).
 * - workflowStep: loc theo buoc hien tai.
 * - myQueue: hang cho cua toi (buoc + tach nhiem vu: khong phai nguoi
 *   tao, khong co approval truoc do; actorId lay tu JWT o controller).
 * - mine: muc do toi tao.
 * - returned: nhap ma approval gan nhat la return.
 * - neverSubmitted: nhap chua tung gui.
 * Khi myQueue/returned/neverSubmitted bat thi status bi ghi de thanh
 * pending_review/draft tuong ung (drill khong gui kem status doi lap).
 */
export async function applyDrillWhere(
  db: any,
  itemModel: string,
  approvalModel: string,
  fk: string,
  where: Record<string, any>,
  params: { workflowStep?: string; myQueue?: string; mine?: string; returned?: string; neverSubmitted?: string },
  actorId: string | null | undefined,
): Promise<void> {
  if (params.mine && actorId) where.createdBy = actorId;
  if (params.myQueue && actorId) {
    const step = parseInt(String(params.workflowStep || ''), 10);
    where.status = 'pending_review';
    if (Number.isInteger(step) && step > 0) where.workflowStep = step;
    where.createdBy = { not: actorId };
    where.approvals = { none: { actorId } };
  } else if (params.workflowStep) {
    const step = parseInt(String(params.workflowStep), 10);
    if (Number.isInteger(step) && step >= 0) where.workflowStep = step;
  }
  if (params.returned) {
    const drafts = await db[itemModel].findMany({ where: { status: 'draft' }, select: { id: true } });
    const ids = await drillReturnedIds(db, approvalModel, fk, drafts.map((d: any) => d.id));
    where.id = { in: ids };
    where.status = 'draft';
  }
  if (params.neverSubmitted) {
    const drafts = await db[itemModel].findMany({
      where: { status: 'draft', ...(actorId && params.mine ? { createdBy: actorId } : {}) },
      select: { id: true },
    });
    const ids = await drillNeverSubmittedIds(db, approvalModel, fk, drafts.map((d: any) => d.id));
    where.id = { in: ids };
    where.status = 'draft';
  }
}
