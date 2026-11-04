// Dashboard CMS GĐ1 (tai lieu duyet 04/11/2026): API tong hop cho 16 widget.
// Chi doc, khong sua quy trinh duyet, khong xoa du lieu. Moi dinh nghia
// chi so o dashboard-helpers.ts / dashboard-queries.ts; service nay chi
// lay rows tu Prisma (hoac TvService/AuditService/UploadsService) roi ap
// cac ham thuan do — widget va danh sach drill-down dung chung dinh nghia.

import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { TvService } from '../tv/tv.service';
import { AuditService } from '../audit/audit.service';
import { UploadsService } from '../uploads/uploads.service';
import { WorkflowConfigService } from '../workflows/workflow-config.service';
import { channelPublicId, groupForChannel } from '../tv/tv.catalog';
import {
  ALL_GD1_WIDGETS,
  EPG_CACHE_TTL_MS,
  OPS_WINDOW_DAYS,
  STUCK_THRESHOLD_HOURS,
  WIDGET_META,
  resolveLayout,
  type WidgetCode,
} from './dashboard-layout.config';
import {
  epgDayState,
  filterMyQueue,
  fmtVnDate,
  groupSubstitutes,
  isOverdue,
  isReturnedDraft,
  isStrictDraft,
  latestApprovalsByItem,
  median,
  periodRange,
  vnDayRange,
  vnDayStrOffset,
  vnTodayStr,
  waitHours,
  type ApprovalRow,
} from './dashboard-helpers';
import {
  DASHBOARD_MODULES,
  moduleMeta,
  myQueueWhere,
  pendingWhere,
  stepLabelsFromDefinitions,
  stepRolesFromDefinitions,
  type DashboardModuleMeta,
} from './dashboard-queries';

export interface DashboardActor {
  id: string | null;
  roleName: string | null;
  isFullAdmin: boolean;
}

interface StepMaps {
  roles: Record<string, Record<number, string>>;
  labels: Record<string, Record<number, string>>;
}

const LINE_MODULES: Record<string, string[]> = {
  all: ['news', 'epaper', 'printArticle', 'events', 'liveblog', 'ads', 'royalties'],
  online: ['news'],
  print: ['epaper', 'printArticle'],
  tv: [],
  radio: [],
};

@Injectable()
export class DashboardService {
  constructor(
    private prisma: PrismaService,
    private roles: RolesService,
    private tv: TvService,
    private audit: AuditService,
    private uploads: UploadsService,
    private wfConfig: WorkflowConfigService,
  ) {}

  private defCache: { at: number; data: any[] } | null = null;
  private epgCache = new Map<string, { at: number; programs: number; source: string }>();

  async actor(userId: string | null | undefined): Promise<DashboardActor> {
    if (!userId) return { id: null, roleName: null, isFullAdmin: false };
    try {
      const id = await this.roles.adminIdentity(userId);
      if (id) return { id: userId, roleName: id.roleName, isFullAdmin: !!id.isFullAdmin };
    } catch { /* roi ve tra cuu truc tiep */ }
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: userId }, include: { role: true },
    }).catch(() => null);
    const roleName = admin?.role?.name ?? admin?.roleName ?? null;
    const perms: any = admin?.role?.permissions;
    const isFullAdmin = !!(perms && perms['*'] && (perms['*'] as string[]).includes('*'));
    return { id: userId, roleName, isFullAdmin };
  }

  layout(actor: DashboardActor) {
    const codes = resolveLayout(actor.roleName, actor.isFullAdmin);
    return {
      role: actor.roleName,
      isFullAdmin: actor.isFullAdmin,
      widgets: codes.map((code) => ({ code, title: WIDGET_META[code].title, tier: WIDGET_META[code].tier })),
    };
  }

  assertWidgetAllowed(actor: DashboardActor, code: string): WidgetCode {
    if (!(ALL_GD1_WIDGETS as readonly string[]).includes(code)) {
      throw new NotFoundException(`unknown widget: ${code}`);
    }
    const allowed = resolveLayout(actor.roleName, actor.isFullAdmin);
    if (!allowed.includes(code as WidgetCode)) {
      throw new ForbiddenException(`role ${actor.roleName || '?'} khong co quyen xem widget ${code}`);
    }
    return code as WidgetCode;
  }

  private async definitions(): Promise<any[]> {
    if (this.defCache && Date.now() - this.defCache.at < 30_000) return this.defCache.data;
    const data = await this.wfConfig.list().catch(() => []);
    this.defCache = { at: Date.now(), data };
    return data;
  }

  private async stepMaps(): Promise<StepMaps> {
    const defs = await this.definitions();
    return {
      roles: stepRolesFromDefinitions(defs),
      labels: stepLabelsFromDefinitions(defs),
    };
  }

  /** Ten hien thi cho cac actorId (batch, tranh N+1). */
  private async actorNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    const out = new Map<string, string>();
    if (!uniq.length) return out;
    const rows = await this.prisma.adminUser.findMany({
      where: { id: { in: uniq } }, select: { id: true, fullName: true, username: true },
    }).catch(() => []);
    for (const r of rows) out.set(r.id, r.fullName || r.username || r.id);
    return out;
  }

  /** Tieu de hien thi cua muc (royalties lay qua bai goc). */
  private async itemTitles(meta: DashboardModuleMeta, ids: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!ids.length) return out;
    const db: any = this.prisma as any;
    if (meta.key === 'royalties') {
      const rows = await db[meta.itemModel].findMany({
        where: { id: { in: ids } }, include: { article: { select: { title: true } } },
      }).catch(() => []);
      for (const r of rows) out.set(r.id, r.article?.title || '(không tiêu đề)');
      return out;
    }
    const rows = await db[meta.itemModel].findMany({
      where: { id: { in: ids } }, select: { id: true, title: true },
    }).catch(() => []);
    for (const r of rows) out.set(r.id, r.title || '(không tiêu đề)');
    return out;
  }

  /** Khoang ky loc cho tang B: from/to la ngay VN (YYYY-MM-DD). */
  private rangeOf(q: Record<string, any>): { from: Date; to: Date } {
    if (q?.from || q?.to) {
      const from = q.from ? vnDayRange(String(q.from)).from : vnDayRange(vnDayStrOffset(-6)).from;
      const to = q.to ? vnDayRange(String(q.to)).to : vnDayRange(vnTodayStr()).to;
      return { from, to };
    }
    return periodRange('7d');
  }

  /** Cac module ap dung theo line (tv/radio khong co phan he quy trinh). */
  private modulesForLine(line: string | undefined): DashboardModuleMeta[] {
    const keys = LINE_MODULES[line || 'all'] ?? LINE_MODULES.all;
    return DASHBOARD_MODULES.filter((m) => keys.includes(m.key));
  }

  /** Lay pending items + approvals cua 1 phan he (dung chung cho A1/B6).
   *  Chu y: ArticleRoyalty KHONG co publicId/title (tieu de lay qua bai
   *  goc) nen select phai khac — neu select sai Prisma se throw va catch
   *  se lam mat ca phan he mot cach lang le. */
  private async pendingWithApprovals(meta: DashboardModuleMeta, step?: number) {
    const db: any = this.prisma as any;
    const isRoy = meta.key === 'royalties';
    const items = await db[meta.itemModel].findMany({
      where: pendingWhere(step),
      select: isRoy
        ? { id: true, workflowStep: true, status: true, createdBy: true }
        : { id: true, publicId: true, title: true, workflowStep: true, status: true, createdBy: true },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);
    const ids = items.map((i: any) => i.id);
    const approvals = ids.length
      ? await db[meta.approvalModel].findMany({
        where: { [meta.approvalFk]: { in: ids } },
        select: { [meta.approvalFk]: true, step: true, actorId: true, actorRole: true, action: true, comment: true, isException: true, exceptionReason: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }).catch(() => [])
      : [];
    return { items, approvals };
  }

  /** Chuyen approval rows tho ve ApprovalRow (khoa fk -> itemId). */
  private toApprovalRows(meta: DashboardModuleMeta, rows: any[]): ApprovalRow[] {
    return rows.map((r) => ({
      itemId: r[meta.approvalFk],
      step: r.step,
      actorId: r.actorId ?? null,
      actorRole: r.actorRole ?? null,
      action: r.action,
      comment: r.comment ?? null,
      isException: !!r.isException,
      exceptionReason: r.exceptionReason ?? null,
      createdAt: r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt),
    }));
  }

  // ------------------------------------------------------------------
  // Dispatcher widget
  // ------------------------------------------------------------------

  async widget(actor: DashboardActor, code: WidgetCode, q: Record<string, any>) {
    const range = this.rangeOf(q);
    const line = typeof q?.line === 'string' ? q.line : 'all';
    let data: any = null;
    let empty: { reason: string } | null = null;
    let drill: any = null;
    switch (code) {
      case 'A1': ({ data, drill } = await this.wA1(actor)); break;
      case 'A2': ({ data, drill } = await this.wA2(actor)); break;
      case 'A3': ({ data, drill } = await this.wA3(actor)); break;
      case 'A4': ({ data, drill } = await this.wA4()); break;
      case 'B1': ({ data, empty, drill } = await this.wB1(range, line)); break;
      case 'B2': ({ data, empty, drill } = await this.wB2(q, line)); break;
      case 'B3': ({ data, empty, drill } = await this.wB3(line)); break;
      case 'B4': ({ data, empty, drill } = await this.wB4(range, line)); break;
      case 'B5': ({ data, empty, drill } = await this.wB5(range, line)); break;
      case 'B6': ({ data, empty, drill } = await this.wB6(line)); break;
      case 'B7': ({ data, empty, drill } = await this.wB7(range, line)); break;
      case 'D1': ({ data, drill } = await this.wD1()); break;
      case 'D2': ({ data, drill } = await this.wD2()); break;
      case 'D4': ({ data, drill } = await this.wD4(q)); break;
      case 'D5': ({ data, drill } = await this.wD5()); break;
      case 'E1': data = { client: true }; break;
      default: throw new NotFoundException(`unknown widget: ${code}`);
    }
    return { code, generatedAt: new Date().toISOString(), data, empty, drill };
  }

  // ------------------------------------------------------------------
  // Tang A — viec cua toi (luon "hien tai", khong theo ky loc)
  // ------------------------------------------------------------------

  /** A1: hang cho cua toi, tach theo phan he + 10 muc cho lau nhat. */
  private async wA1(actor: DashboardActor) {
    const { roles, labels } = await this.stepMaps();
    const byModule: any[] = [];
    const allOldest: any[] = [];
    for (const meta of DASHBOARD_MODULES) {
      const { items, approvals } = await this.pendingWithApprovals(meta);
      const rows = this.toApprovalRows(meta, approvals);
      const actorIdsByItem = new Map<string, string[]>();
      for (const r of rows) {
        const arr = actorIdsByItem.get(r.itemId) || [];
        if (r.actorId) arr.push(r.actorId);
        actorIdsByItem.set(r.itemId, arr);
      }
      const latest = latestApprovalsByItem(rows);
      // Loc hang cho dung dinh nghia dung chung (filterMyQueue): buoc thuoc
      // role cua toi (hoac full-admin thay moi buoc), toi khong phai nguoi
      // tao va khong co BAT KY approval nao truoc do tren muc.
      const mineRows = items.filter((i: any) => this.inQueue({
        module: meta.key, workflowStep: i.workflowStep, status: i.status,
        createdBy: i.createdBy ?? null, approvalActorIds: actorIdsByItem.get(i.id) || [],
      }, actor, roles));
      const stepCounts = new Map<number, number>();
      for (const r of mineRows) stepCounts.set(r.workflowStep, (stepCounts.get(r.workflowStep) || 0) + 1);
      const steps = [...stepCounts.entries()].sort((a, b) => a[0] - b[0]).map(([step, count]) => ({
        step,
        label: labels[meta.workflowKey]?.[step] || `Bước ${step}`,
        roleName: roles[meta.workflowKey]?.[step] || null,
        count,
        drill: { route: meta.route, query: { workflowStep: step, myQueue: 1 } },
      }));
      byModule.push({ module: meta.key, label: meta.label, total: mineRows.length, steps, route: meta.route });
      for (const r of mineRows) {
        const la = latest.get(r.id);
        allOldest.push({
          module: meta.key, moduleLabel: meta.label, id: r.id, publicId: r.publicId || null,
          title: meta.key === 'royalties' ? undefined : (r.title || '(không tiêu đề)'),
          step: r.workflowStep, stepLabel: labels[meta.workflowKey]?.[r.workflowStep] || `Bước ${r.workflowStep}`,
          enteredAt: la ? la.createdAt.toISOString() : null,
          waitHours: la ? Math.round(waitHours(la.createdAt) * 10) / 10 : null,
          drill: { route: meta.route, query: { workflowStep: r.workflowStep, myQueue: 1 } },
        });
      }
    }
    // Tieu de nhuan but lay qua bai goc (batch theo module).
    const royIdx = allOldest.filter((x) => x.module === 'royalties');
    if (royIdx.length) {
      const titles = await this.itemTitles(moduleMeta('royalties'), royIdx.map((x) => x.id));
      for (const x of royIdx) x.title = titles.get(x.id) || '(không tiêu đề)';
    }
    allOldest.sort((a, b) => (b.waitHours ?? -1) - (a.waitHours ?? -1));
    const total = byModule.reduce((s, m) => s + m.total, 0);
    return {
      data: { total, byModule, items: allOldest.slice(0, 10) },
      drill: null,
    };
  }

  /** Kiem tra 1 row co trong hang cho (ban don cua inMyQueue cho 1 row). */
  private inQueue(
    item: { module: string; workflowStep: number; status: string; createdBy: string | null; approvalActorIds: string[] },
    actor: DashboardActor,
    stepRoles: Record<string, Record<number, string>>,
  ): boolean {
    // Dung chung logic voi helpers.filterMyQueue (khong viet lai dinh nghia).
    return filterMyQueue([item], actor, stepRoles).length === 1;
  }

  /** A2: bai cua toi dang bi tra (draft + approval gan nhat la return). */
  private async wA2(actor: DashboardActor) {
    const db: any = this.prisma as any;
    const items: any[] = [];
    for (const meta of DASHBOARD_MODULES) {
      const isRoy = meta.key === 'royalties';
      const drafts = await db[meta.itemModel].findMany({
        where: { status: 'draft', createdBy: actor.id },
        select: isRoy ? { id: true } : { id: true, publicId: true, title: true },
        orderBy: { createdAt: 'desc' },
      }).catch(() => []);
      if (!drafts.length) continue;
      const ids = drafts.map((d: any) => d.id);
      const appr = await db[meta.approvalModel].findMany({
        where: { [meta.approvalFk]: { in: ids } },
        select: { [meta.approvalFk]: true, action: true, actorId: true, actorRole: true, comment: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }).catch(() => []);
      const latest = latestApprovalsByItem(this.toApprovalRows(meta, appr));
      const titles = isRoy
        ? await this.itemTitles(meta, ids)
        : new Map(ids.map((id: string) => [id, drafts.find((d: any) => d.id === id)?.title || '(không tiêu đề)']));
      const names = await this.actorNames([...latest.values()].map((l) => l.actorId));
      for (const d of drafts) {
        const la = latest.get(d.id);
        if (!isReturnedDraft('draft', la)) continue;
        items.push({
          module: meta.key, moduleLabel: meta.label, id: d.id, publicId: d.publicId || null,
          title: titles.get(d.id) || '(không tiêu đề)',
          returnedBy: la!.actorId ? (names.get(la!.actorId) || la!.actorId) : (la!.actorRole || '—'),
          returnedByRole: la!.actorRole || null,
          returnedAt: la!.createdAt.toISOString(), reason: la!.comment || null,
          drill: { route: meta.route, query: this.itemDrillQuery(meta, titles.get(d.id) || '') },
        });
      }
    }
    items.sort((a, b) => b.returnedAt.localeCompare(a.returnedAt));
    return { data: { total: items.length, items }, drill: null };
  }

  /** Query drill ve danh sach cua 1 muc: tim theo tieu de + trang thai nhap. */
  private itemDrillQuery(meta: DashboardModuleMeta, title: string): Record<string, any> {
    const q: Record<string, any> = { q: title };
    if (meta.key === 'royalties') q.royaltyStatus = 'draft';
    else q.status = 'draft';
    return q;
  }

  /** A3: nhap cua toi chua tung gui (hieu chat, loai bai bi tra). */
  private async wA3(actor: DashboardActor) {
    const db: any = this.prisma as any;
    const items: any[] = [];
    const now = Date.now();
    for (const meta of DASHBOARD_MODULES) {
      const isRoy = meta.key === 'royalties';
      const drafts = await db[meta.itemModel].findMany({
        where: { status: 'draft', createdBy: actor.id },
        select: isRoy ? { id: true, createdAt: true } : { id: true, publicId: true, title: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }).catch(() => []);
      if (!drafts.length) continue;
      const ids = drafts.map((d: any) => d.id);
      const submitted = await db[meta.approvalModel].findMany({
        where: { [meta.approvalFk]: { in: ids }, action: 'submit' },
        select: { [meta.approvalFk]: true },
      }).catch(() => []);
      const submittedIds = new Set(submitted.map((s: any) => s[meta.approvalFk]));
      const titles = isRoy
        ? await this.itemTitles(meta, ids)
        : new Map(ids.map((id: string) => [id, drafts.find((d: any) => d.id === id)?.title || '(không tiêu đề)']));
      for (const d of drafts) {
        if (!isStrictDraft('draft', submittedIds.has(d.id))) continue;
        items.push({
          module: meta.key, moduleLabel: meta.label, id: d.id, publicId: d.publicId || null,
          title: titles.get(d.id) || '(không tiêu đề)',
          createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : new Date(d.createdAt).toISOString(),
          over7d: now - new Date(d.createdAt).getTime() > 7 * 24 * 3600_000,
          drill: { route: meta.route, query: this.itemDrillQuery(meta, titles.get(d.id) || '') },
        });
      }
    }
    return { data: { total: items.length, items }, drill: null };
  }

  /** A4: hen xuat ban 24h toi (tin bai / su kien / quang cao + so bao ngay mai).
   *  Pham vi toan toa soan (chuc nang truc ban, khong phai viec ca nhan) —
   *  layout chi mo cho Thu ky toa soan / BBT / full-admin. */
  private async wA4() {
    const db: any = this.prisma as any;
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 3600_000);
    const items: any[] = [];
    const push = (module: string, moduleLabel: string, route: string, id: string, publicId: string | null, title: string, publishAt: string, query: any) => {
      items.push({ module, moduleLabel, id, publicId, title, publishAt, drill: { route, query } });
    };
    for (const meta of [moduleMeta('news'), moduleMeta('events'), moduleMeta('ads')]) {
      const rows = await db[meta.itemModel].findMany({
        where: { status: 'published', publishAt: { gt: now, lte: in24h } },
        select: { id: true, publicId: true, title: true, publishAt: true },
        orderBy: { publishAt: 'asc' },
      }).catch(() => []);
      for (const r of rows) {
        push(meta.key, meta.label, meta.route, r.id, r.publicId || null, r.title || '(không tiêu đề)',
          r.publishAt.toISOString(), { status: 'published', scheduled: 1 });
      }
    }
    // So bao: publishDate = ngay mai (gio VN), chi so da xuat ban.
    const tomorrow = vnDayStrOffset(1);
    const { from: tFrom, to: tTo } = vnDayRange(tomorrow);
    const issues = await db.epaperIssue.findMany({
      where: { status: 'published', publishDate: { gte: tFrom, lt: tTo } },
      select: { id: true, publicId: true, title: true, issueNumber: true, issueType: true, publishDate: true },
      orderBy: { publishDate: 'asc' },
    }).catch(() => []);
    for (const r of issues) {
      push('epaper', 'Báo in', '/bao-in', r.id, r.publicId || null,
        r.title || `Số ${r.issueNumber}`, fmtVnDate(r.publishDate),
        { issueType: r.issueType, issueNumber: r.issueNumber });
    }
    items.sort((a, b) => a.publishAt.localeCompare(b.publishAt));
    return { data: { total: items.length, items }, drill: null };
  }

  // ------------------------------------------------------------------
  // Tang B — dong chay san xuat
  // ------------------------------------------------------------------

  /** B1: pheu bao dien tu + cot bi tra ve + xuat ban / ha xuat ban trong ky. */
  private async wB1(range: { from: Date; to: Date }, line: string) {
    const db: any = this.prisma as any;
    const { labels, roles } = await this.stepMaps();
    if (line !== 'all' && line !== 'online') {
      return { data: null, drill: null, empty: { reason: 'Phễu báo điện tử chỉ áp dụng cho loại hình Báo điện tử' } } as any;
    }
    const steps = [1, 2, 3, 4];
    const counts = await Promise.all(
      steps.map((s) => db.newsArticle.count({ where: { status: 'pending_review', workflowStep: s } }).catch(() => 0)),
    );
    // Cot "Bi tra ve, dang sua": draft + approval gan nhat la return.
    const drafts = await db.newsArticle.findMany({
      where: { status: 'draft' }, select: { id: true },
    }).catch(() => []);
    let returned = 0;
    if (drafts.length) {
      const ids = drafts.map((d: any) => d.id);
      const appr = await db.newsArticleApproval.findMany({
        where: { articleId: { in: ids } },
        select: { articleId: true, action: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }).catch(() => []);
      const latest = latestApprovalsByItem(appr.map((r: any) => ({
        itemId: r.articleId, step: 0, action: r.action, createdAt: r.createdAt,
      })));
      for (const d of drafts) if (isReturnedDraft('draft', latest.get(d.id))) returned += 1;
    }
    const published = await db.newsArticle.count({
      where: { status: 'published', publishAt: { gte: range.from, lt: range.to, lte: new Date() } },
    }).catch(() => 0);
    const unpublished = await db.newsArticleApproval.count({
      where: { action: 'unpublish', createdAt: { gte: range.from, lt: range.to } },
    }).catch(() => 0);
    const stepRows = steps.map((s, i) => ({
      step: s,
      label: labels.news?.[s] || `Bước ${s}`,
      roleName: roles.news?.[s] || null,
      count: counts[i],
      drill: { route: '/tin-bai', query: { workflowStep: s } },
    }));
    const inProcess = counts.reduce((a, b) => a + b, 0) + returned;
    return {
      data: {
        steps: stepRows, returned: { count: returned, drill: { route: '/tin-bai', query: { status: 'draft', returned: 1 } } },
        publishedInPeriod: published, unpublishedInPeriod: unpublished, inProcess,
        publishedDrill: { route: '/tin-bai', query: { status: 'published', publishFrom: range.from.toISOString(), publishTo: range.to.toISOString() } },
      },
      drill: null,
    };
  }

  /** B2: so bao sap phat hanh + so dang nhap + bai bao in cho duyet / cho dan trang.
   *  Cua so "ky toi" la TUONG LAI (khac ky qua khu cua B1/B4/B5): period
   *  'today' -> ngay mai, '7d' -> 7 ngay toi, '30d' -> 30 ngay toi; custom
   *  thi dung from/to nguoi dung chon. */
  private async wB2(q: Record<string, any>, line: string) {
    const db: any = this.prisma as any;
    const { labels } = await this.stepMaps();
    if (line !== 'all' && line !== 'print') {
      return { data: null, drill: null, empty: { reason: 'Báo in kỳ tới chỉ áp dụng cho loại hình Báo in' } } as any;
    }
    let from: Date;
    let to: Date;
    if (q?.period === 'custom' && q?.from) {
      from = vnDayRange(String(q.from)).from;
      to = vnDayRange(String(q.to || q.from)).to;
    } else if (q?.period === 'today') {
      from = vnDayRange(vnDayStrOffset(1)).from;
      to = vnDayRange(vnDayStrOffset(1)).to;
    } else if (q?.period === '7d') {
      from = vnDayRange(vnTodayStr()).from;
      to = vnDayRange(vnDayStrOffset(7)).to;
    } else {
      from = vnDayRange(vnTodayStr()).from;
      to = vnDayRange(vnDayStrOffset(30)).to;
    }
    const issues = await db.epaperIssue.findMany({
      where: { publishDate: { gte: from, lt: to } },
      select: { id: true, publicId: true, title: true, issueNumber: true, issueType: true, publishDate: true, pageCount: true, status: true, workflowStep: true },
      orderBy: { publishDate: 'asc' },
      take: 50,
    }).catch(() => []);
    const [draftIssues, pendingPrint, approvedPrint] = await Promise.all([
      db.epaperIssue.count({ where: { status: 'draft' } }).catch(() => 0),
      db.printArticle.count({ where: { status: 'pending_review' } }).catch(() => 0),
      db.printArticle.count({ where: { status: 'approved' } }).catch(() => 0),
    ]);
    return {
      data: {
        note: 'Số trang là số nhập tay.',
        issues: issues.map((r: any) => ({
          id: r.id, publicId: r.publicId, title: r.title || `Số ${r.issueNumber}`,
          issueNumber: r.issueNumber, issueType: r.issueType,
          publishDate: fmtVnDate(r.publishDate), status: r.status, pageCount: r.pageCount,
          step: r.workflowStep, stepLabel: labels.epaper?.[r.workflowStep] || (r.workflowStep ? `Bước ${r.workflowStep}` : '—'),
          drill: { route: '/bao-in', query: { issueType: r.issueType, issueNumber: r.issueNumber } },
        })),
        draftIssues, pendingPrintArticles: pendingPrint, approvedPrintArticles: approvedPrint,
        printDrill: { route: '/bai-bao-in', query: { status: 'pending_review' } },
        printApprovedDrill: { route: '/bai-bao-in', query: { status: 'approved' } },
      },
      drill: null,
    };
  }

  /** Lay EPG 1 kenh 1 ngay qua TvService, co cache server TTL 12 phut.
   *  Tra ve { programs, source, updatedAt, stale, error }. */
  private async epgDay(publicId: string, day: string): Promise<{ programs: number; source: string; updatedAt: string; stale: boolean; error: string | null }> {
    const key = `${publicId}:${day}`;
    const cached = this.epgCache.get(key);
    if (cached && Date.now() - cached.at < EPG_CACHE_TTL_MS) {
      return { programs: cached.programs, source: cached.source, updatedAt: new Date(cached.at).toISOString(), stale: false, error: null };
    }
    try {
      const res = await this.tv.epg(publicId, day);
      const programs = Array.isArray(res?.timeline) ? res.timeline.length : 0;
      const source = res?.epg_source || 'local';
      if (programs > 0) this.epgCache.set(key, { at: Date.now(), programs, source });
      else if (cached) {
        // AIO tra rong/loi: hien ban cache cuoi kem "cap nhat luc...".
        return { programs: cached.programs, source: cached.source, updatedAt: new Date(cached.at).toISOString(), stale: true, error: null };
      }
      return { programs, source, updatedAt: new Date().toISOString(), stale: false, error: null };
    } catch (e: any) {
      if (cached) {
        return { programs: cached.programs, source: cached.source, updatedAt: new Date(cached.at).toISOString(), stale: true, error: null };
      }
      return { programs: 0, source: 'error', updatedAt: new Date().toISOString(), stale: false, error: e?.message || 'Không lấy được EPG' };
    }
  }

  /** Danh sach kenh tu listGroups (kenh hien) — dung chung cho B3. */
  private async tvChannels(): Promise<Array<{ publicId: string; name: string; group: string; audioOnly: boolean; isCustom: boolean }>> {
    const groups = await this.tv.listGroups().catch(() => ({ groups: [] }));
    const out: Array<{ publicId: string; name: string; group: string; audioOnly: boolean; isCustom: boolean }> = [];
    for (const g of groups.groups || []) {
      for (const c of g.channels || []) {
        out.push({ publicId: c.public_id, name: c.name, group: g.name, audioOnly: !!c.audio_only, isCustom: !!c.is_custom });
      }
    }
    return out;
  }

  /** B3: EPG hom nay + ngay mai cho moi kenh TH/PT. */
  private async wB3(line: string) {
    const today = vnTodayStr();
    const tomorrow = vnDayStrOffset(1);
    let channels = await this.tvChannels();
    if (line === 'tv') channels = channels.filter((c) => !c.audioOnly);
    else if (line === 'radio') channels = channels.filter((c) => c.audioOnly);
    else if (line !== 'all') channels = []; // online/print: B3 la widget TH/PT
    const rows: any[] = [];
    for (const ch of channels) {
      const t = await this.epgDay(ch.publicId, today);
      const m = await this.epgDay(ch.publicId, tomorrow);
      const tState = t.error ? { state: 'error', reason: t.error } : epgDayState(t.programs, ch.audioOnly, t.stale);
      const mState = m.error ? { state: 'error', reason: m.error } : epgDayState(m.programs, ch.audioOnly, m.stale);
      rows.push({
        ...ch,
        today: { programs: t.programs, state: tState.state, reason: tState.reason, updatedAt: t.updatedAt, source: t.source },
        tomorrow: { programs: m.programs, state: mState.state, reason: mState.reason, updatedAt: m.updatedAt, source: m.source },
        drill: { route: '/truyen-hinh', query: { channel: ch.publicId } },
      });
    }
    return {
      data: { today, tomorrow, channels: rows },
      empty: rows.length ? null : { reason: 'Chưa có kênh nào thuộc loại hình đã chọn' },
      drill: null,
    };
  }

  /** B4: san luong xuat ban theo ngay (bu ket theo ngay VN). */
  private async wB4(range: { from: Date; to: Date }, line: string) {
    const db: any = this.prisma as any;
    if (line !== 'all' && line !== 'online') {
      return { data: null, drill: null, empty: { reason: 'Sản lượng xuất bản chỉ áp dụng cho loại hình Báo điện tử' } } as any;
    }
    const rows = await db.newsArticle.findMany({
      where: { status: 'published', publishAt: { gte: range.from, lt: range.to, lte: new Date() } },
      select: { publishAt: true },
    }).catch(() => []);
    const byDay = new Map<string, number>();
    for (const r of rows) {
      if (!r.publishAt) continue;
      const d = vnTodayStr(new Date(r.publishAt));
      byDay.set(d, (byDay.get(d) || 0) + 1);
    }
    const days: any[] = [];
    for (let t = range.from.getTime(); t < range.to.getTime(); t += 24 * 3600_000) {
      const d = vnTodayStr(new Date(t));
      const { from: df, to: dt } = vnDayRange(d);
      days.push({
        date: d, label: fmtVnDate(df), count: byDay.get(d) || 0,
        drill: { route: '/tin-bai', query: { status: 'published', publishFrom: df.toISOString(), publishTo: dt.toISOString() } },
      });
    }
    return { data: { total: rows.length, days }, drill: null };
  }

  /** B5: xuat ban trong ky + dang trong quy trinh, theo chuyen muc. */
  private async wB5(range: { from: Date; to: Date }, line: string) {
    const db: any = this.prisma as any;
    if (line !== 'all' && line !== 'online') {
      return { data: null, drill: null, empty: { reason: 'Theo chuyên mục chỉ áp dụng cho loại hình Báo điện tử' } } as any;
    }
    const cats = await db.newsCategory.findMany({
      select: { id: true, name: true, parentId: true },
      orderBy: { name: 'asc' },
    }).catch(() => []);
    const byId = new Map(cats.map((c: any) => [c.id, c]));
    const published = await db.newsArticle.findMany({
      where: { status: 'published', publishAt: { gte: range.from, lt: range.to, lte: new Date() } },
      select: { categoryId: true },
    }).catch(() => []);
    const pending = await db.newsArticle.findMany({
      where: { status: 'pending_review' },
      select: { categoryId: true },
    }).catch(() => []);
    const agg = new Map<string | null, { published: number; inProcess: number }>();
    const bump = (key: string | null, field: 'published' | 'inProcess') => {
      const cur = agg.get(key) || { published: 0, inProcess: 0 };
      cur[field] += 1;
      agg.set(key, cur);
    };
    for (const r of published) bump(r.categoryId || null, 'published');
    for (const r of pending) bump(r.categoryId || null, 'inProcess');
    const rows: any[] = [];
    for (const [key, v] of agg.entries()) {
      if (!v.published && !v.inProcess) continue;
      const c = key ? byId.get(key) : null;
      const parent = c?.parentId ? byId.get(c.parentId) : null;
      rows.push({
        categoryId: key, name: c ? c.name : 'Chưa xếp chuyên mục',
        parentName: parent ? parent.name : null,
        published: v.published, inProcess: v.inProcess,
        drillPublished: { route: '/tin-bai', query: { status: 'published', publishFrom: range.from.toISOString(), publishTo: range.to.toISOString(), ...(key ? { categoryId: key } : {}) } },
        drillPending: { route: '/tin-bai', query: { status: 'pending_review', ...(key ? { categoryId: key } : {}) } },
      });
    }
    rows.sort((a, b) => b.published - a.published || b.inProcess - a.inProcess);
    return { data: { categories: rows, totalPublished: published.length, totalInProcess: pending.length }, drill: null };
  }

  /** B6: viec treo + thoi gian cho trung vi tung buoc. */
  private async wB6(line: string) {
    const { labels } = await this.stepMaps();
    const modules = this.modulesForLine(line);
    const items: any[] = [];
    const medians: any[] = [];
    for (const meta of modules) {
      const { items: pending, approvals } = await this.pendingWithApprovals(meta);
      const latest = latestApprovalsByItem(this.toApprovalRows(meta, approvals));
      const threshold = STUCK_THRESHOLD_HOURS[meta.key] ?? 4;
      const waitsByStep = new Map<number, number[]>();
      for (const it of pending) {
        const la = latest.get(it.id);
        const enteredAt = la ? la.createdAt : null;
        const w = enteredAt ? waitHours(enteredAt) : null;
        if (w !== null) {
          const arr = waitsByStep.get(it.workflowStep) || [];
          arr.push(w);
          waitsByStep.set(it.workflowStep, arr);
        }
        if (enteredAt && isOverdue(enteredAt, threshold)) {
          items.push({
            module: meta.key, moduleLabel: meta.label, id: it.id, publicId: it.publicId || null,
            title: it.title || '(không tiêu đề)', step: it.workflowStep,
            stepLabel: labels[meta.workflowKey]?.[it.workflowStep] || `Bước ${it.workflowStep}`,
            enteredAt: enteredAt.toISOString(), waitHours: Math.round(w! * 10) / 10, thresholdHours: threshold,
            drill: { route: meta.route, query: { workflowStep: it.workflowStep } },
          });
        }
      }
      for (const [step, waits] of waitsByStep.entries()) {
        const m = median(waits);
        medians.push({
          module: meta.key, moduleLabel: meta.label, step,
          stepLabel: labels[meta.workflowKey]?.[step] || `Bước ${step}`,
          medianHours: m === null ? null : Math.round(m * 10) / 10, count: waits.length,
        });
      }
    }
    // Tieu de nhuan but lay qua bai goc.
    const roy = items.filter((x) => x.module === 'royalties');
    if (roy.length) {
      const titles = await this.itemTitles(moduleMeta('royalties'), roy.map((x) => x.id));
      for (const x of roy) x.title = titles.get(x.id) || '(không tiêu đề)';
    }
    items.sort((a, b) => b.waitHours - a.waitHours);
    medians.sort((a, b) => a.moduleLabel.localeCompare(b.moduleLabel) || a.step - b.step);
    return { data: { total: items.length, items: items.slice(0, 50), medians }, drill: null };
  }

  /** B7: canh bao quy trinh — buoc 1 nguoi / role 0 thanh vien / ngoai le / duyet thay. */
  private async wB7(range: { from: Date; to: Date }, line: string) {
    const db: any = this.prisma as any;
    const defs = await this.definitions();
    const { roles } = await this.stepMaps();
    const modules = this.modulesForLine(line);
    const moduleKeys = new Set(modules.map((m) => m.key));
    // Dem thanh vien theo roleName (khong phan biet hoa/thuong).
    const adminGroups = await db.adminUser.groupBy({ by: ['roleName'], _count: true }).catch(() => []);
    const memberCount = new Map<string, number>();
    for (const g of adminGroups) {
      const name = (g.roleName || '').toLowerCase();
      memberCount.set(name, (memberCount.get(name) || 0) + (g._count || 0));
    }
    const singleMemberSteps: any[] = [];
    const zeroMemberRoles = new Map<string, string[]>();
    for (const d of defs) {
      if (d.enabled === false) continue;
      const meta = DASHBOARD_MODULES.find((m) => m.workflowKey === d.moduleKey);
      if (!meta || !moduleKeys.has(meta.key)) continue;
      for (const s of d.steps || []) {
        const n = memberCount.get((s.roleName || '').toLowerCase()) || 0;
        if (n === 1) {
          singleMemberSteps.push({ module: meta.key, moduleLabel: meta.label, stepLabel: s.label, roleName: s.roleName, memberCount: 1 });
        } else if (n === 0) {
          const arr = zeroMemberRoles.get(s.roleName) || [];
          arr.push(`${meta.label}: ${s.label}`);
          zeroMemberRoles.set(s.roleName, arr);
        }
      }
    }
    // Ngoai le + duyet thay trong ky, tren cac phan he ap dung.
    const exceptions: any[] = [];
    const subRows: Array<{ actorId: string | null; actorRole: string | null; step: number; module: string }> = [];
    for (const meta of modules) {
      const appr = await db[meta.approvalModel].findMany({
        where: { createdAt: { gte: range.from, lt: range.to } },
        select: { [meta.approvalFk]: true, step: true, actorId: true, actorRole: true, action: true, comment: true, isException: true, exceptionReason: true, createdAt: true },
      }).catch(() => []);
      const ids = [...new Set(appr.map((r: any) => r[meta.approvalFk]))];
      const titles = await this.itemTitles(meta, ids);
      for (const r of appr) {
        if (r.isException) {
          exceptions.push({
            module: meta.key, moduleLabel: meta.label, id: r[meta.approvalFk],
            title: titles.get(r[meta.approvalFk]) || '(không tiêu đề)',
            actorId: r.actorId || null, actorRole: r.actorRole || null,
            reason: r.exceptionReason || r.comment || null,
            createdAt: r.createdAt.toISOString(),
            drill: { route: meta.route, query: { q: titles.get(r[meta.approvalFk]) || '' } },
          });
        }
        subRows.push({ actorId: r.actorId || null, actorRole: r.actorRole || null, step: r.step, module: meta.workflowKey });
      }
    }
    const substitutes = groupSubstitutes(subRows, roles, (r: any) => r.module);
    const names = await this.actorNames([
      ...exceptions.map((e) => e.actorId),
      ...substitutes.map((s) => s.actorId),
    ]);
    for (const e of exceptions) e.actorName = e.actorId ? (names.get(e.actorId) || e.actorId) : (e.actorRole || '—');
    const substitutesNamed = substitutes.map((s) => ({
      actorName: s.actorId ? (names.get(s.actorId) || s.actorId) : (s.actorRole || '—'),
      actorRole: s.actorRole, count: s.count,
    }));
    exceptions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      data: {
        singleMemberSteps,
        zeroMemberRoles: [...zeroMemberRoles.entries()].map(([roleName, steps]) => ({ roleName, steps })),
        exceptions: exceptions.slice(0, 50), exceptionCount: exceptions.length,
        substitutes: substitutesNamed,
      },
      drill: { route: '/quy-trinh-duyet', query: {} },
    };
  }

  // ------------------------------------------------------------------
  // Tang D — he thong
  // ------------------------------------------------------------------

  /** D1: trang thai kenh (bat/tat). Giam sat luong la GĐ4, khong co o day.
   *  Noi override voi kenh AIO theo publicId: publicId = hash(tên AIO
   *  uppercase); voi kenh tu them thi hash(displayName || channelKey).
   *  Kenh an khong co trong listGroups nen them tu overrides; audioOnly
   *  cua kenh an suy tu ten (RADIO) vi override khong luu truong nay. */
  private async wD1() {
    const db: any = this.prisma as any;
    const overrides = await db.channelOverride.findMany().catch(() => []);
    const visible = await this.tvChannels();
    const rows = new Map<string, any>();
    for (const c of visible) {
      rows.set(c.publicId, {
        publicId: c.publicId, name: c.name, group: c.group, audioOnly: c.audioOnly, isCustom: c.isCustom,
        isVisible: true, hlsConfigured: !c.isCustom, timeshiftEnabled: false,
      });
    }
    for (const o of overrides) {
      const pid = o.isCustom
        ? channelPublicId(((o.displayName || '').trim() || o.channelKey))
        : channelPublicId(o.channelKey);
      const cur = rows.get(pid);
      if (cur) {
        cur.isVisible = o.isVisible !== false;
        cur.hlsConfigured = !!(o.hlsUrl || !cur.isCustom);
        cur.timeshiftEnabled = !!o.timeshiftEnabled;
        if (o.groupName) cur.group = o.groupName;
      } else {
        const display = (o.displayName || '').trim() || o.channelKey;
        rows.set(pid, {
          publicId: pid, name: display, group: o.groupName || groupForChannel(display),
          audioOnly: groupForChannel(display) === 'RADIO', isCustom: !!o.isCustom,
          isVisible: o.isVisible !== false, hlsConfigured: !!o.hlsUrl,
          timeshiftEnabled: !!o.timeshiftEnabled,
        });
      }
    }
    const channels = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      data: {
        total: channels.length,
        visible: channels.filter((c) => c.isVisible).length,
        hidden: channels.filter((c) => !c.isVisible).length,
        channels,
      },
      drill: { route: '/truyen-hinh', query: {} },
    };
  }

  /** D2: xu ly media — dem tu UploadsService (cung nguon voi files/all de
   *  so widget = so dong danh sach). Dead-letter = error bat dau bang
   *  'dead-letter'. */
  private async wD2() {
    const all = this.uploads.listUploads();
    const counts = { pending: 0, uploaded: 0, processing: 0, done: 0, error: 0, deadLetter: 0 };
    for (const r of all) {
      if (r.status === 'pending') counts.pending += 1;
      else if (r.status === 'uploaded') counts.uploaded += 1;
      else if (r.status === 'processing') counts.processing += 1;
      else if (r.status === 'done') counts.done += 1;
      else if (r.status === 'error') {
        counts.error += 1;
        if (typeof r.error === 'string' && r.error.startsWith('dead-letter')) counts.deadLetter += 1;
      }
    }
    const items = [...all]
      .filter((r) => r.status !== 'done')
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 20)
      .map((r) => ({
        id: r.id, filename: r.filename || r.id, status: r.status,
        attempts: r.attempts ?? 0, nextRetryAt: r.nextRetryAt ? new Date(r.nextRetryAt).toISOString() : null,
        durationSec: r.durationSec ?? null, progress: r.progress ?? null, error: r.error || null,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
        drill: { route: '/tap-tin', query: { status: r.status } },
      }));
    return {
      data: { counts, items },
      drill: { route: '/tap-tin', query: {} },
    };
  }

  /** D4: nhat ky hoat dong (in-memory, tu lan khoi dong gan nhat).
   *  Khong co the dem tong (log mat khi restart nen tong khong co nghia). */
  private async wD4(q: Record<string, any>) {
    const actor = typeof q?.actor === 'string' ? q.actor.trim() : '';
    const action = typeof q?.action === 'string' ? q.action.trim() : '';
    const entries = this.audit.list(200, {
      ...(actor ? { actor } : {}),
      ...(action ? { action } : {}),
    });
    const items = entries.slice(0, 20).map((e: any) => ({
      at: e.at ? new Date(e.at).toISOString() : null,
      actor: e.actor, role: e.role || null, action: e.action, resource: e.resource || null,
    }));
    return {
      data: {
        note: 'Nhật ký từ lần khởi động gần nhất (tối đa 1.000 dòng, mất khi restart).',
        filters: { actor, action },
        items,
      },
      drill: { route: '/nhat-ky', query: { ...(actor ? { actor } : {}), ...(action ? { action } : {}) } },
    };
  }

  /** D5: canh bao van hanh — EPG ngay mai trong, so bao 7 ngay toi chua
   *  duyet, quang cao het han 7 ngay toi. Radio khong co nguon EPG KHONG
   *  ban canh bao (state 'no-source' bi loai). */
  private async wD5() {
    const db: any = this.prisma as any;
    const today = vnTodayStr();
    const tomorrow = vnDayStrOffset(1);
    const channels = await this.tvChannels();
    const epgEmpty: any[] = [];
    for (const ch of channels) {
      const m = await this.epgDay(ch.publicId, tomorrow);
      if (m.error) continue;
      const st = epgDayState(m.programs, ch.audioOnly, m.stale);
      if (st.state === 'empty') {
        epgEmpty.push({
          publicId: ch.publicId, name: ch.name, group: ch.group, date: tomorrow,
          drill: { route: '/truyen-hinh', query: { channel: ch.publicId, date: tomorrow } },
        });
      }
    }
    const { from: wFrom, to: wTo } = { from: vnDayRange(today).from, to: vnDayRange(vnDayStrOffset(OPS_WINDOW_DAYS)).to };
    const issues = await db.epaperIssue.findMany({
      where: { publishDate: { gte: wFrom, lt: wTo }, status: { in: ['draft', 'pending_review'] } },
      select: { id: true, publicId: true, title: true, issueNumber: true, issueType: true, publishDate: true, status: true, workflowStep: true },
      orderBy: { publishDate: 'asc' },
    }).catch(() => []);
    const now = new Date();
    const in7d = new Date(now.getTime() + OPS_WINDOW_DAYS * 24 * 3600_000);
    const ads = await db.newsroomAd.findMany({
      where: { status: 'published', endsAt: { gt: now, lte: in7d } },
      select: { id: true, publicId: true, name: true, placement: true, endsAt: true },
      orderBy: { endsAt: 'asc' },
    }).catch(() => []);
    return {
      data: {
        epgTomorrowEmpty: epgEmpty,
        issuesUnapproved: issues.map((r: any) => ({
          id: r.id, publicId: r.publicId, title: r.title || `Số ${r.issueNumber}`,
          issueNumber: r.issueNumber, issueType: r.issueType, publishDate: fmtVnDate(r.publishDate),
          status: r.status, step: r.workflowStep,
          drill: { route: '/bao-in', query: { issueType: r.issueType, issueNumber: r.issueNumber } },
        })),
        adsExpiring: ads.map((r: any) => ({
          id: r.id, publicId: r.publicId, name: r.name, placement: r.placement,
          endsAt: r.endsAt ? r.endsAt.toISOString() : null,
          drill: { route: '/quang-cao-toa-soan', query: { status: 'published' } },
        })),
      },
      drill: null,
    };
  }
}
