// Endpoint dem gop sidebar dot 2: GET /admin/sidebar-counts — tra moi so
// dem sidebar trong 1 lan goi, chi cac muc user co quyen module, kem
// truong scope ('wide'|'mine') cho moi so de CMS ghi tooltip pham vi.
//
// Pham vi (cung quy tac voi danh sach, xem sidebar-scope.ts — so tren
// menu PHAI bang so dong danh sach khi bam):
// - Role rong (NEWSROOM_WIDE_ROLES hoac '*'): dem toan cuc.
// - Role hep: draft = chi cua minh; pending_review = cua minh HOAC dang
//   o buoc minh duoc duyet; published/approved/tong danh sach = toan cuc
//   (danh sach cac trang thai nay khong gioi han).
// - "Bai cua toi" / "Nhap cua toi": luon cua minh (moi role).
// - "Bi tra ve": role rong = returned toan cuc; role hep = mine + returned.
// - So ghim "Cho toi duyet": tong A1 (filterMyQueue, qua DashboardService).
// - Cache 60 giay theo user (sidebar-counts-cache.ts); xoa chu dong o
//   cuoi transition/tap moi (writeApproval + create cua 7 phan he) chi
//   de tuc thi — TTL da du cho nghiem thu 60 giay.

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RolesService } from '../auth/roles.service';
import { fallbackPermissionMap } from '../auth/admin-token';
import { type PermissionMap } from '../auth/permissions.catalog';
import { WorkflowConfigService } from '../workflows/workflow-config.service';
import { DashboardService, type DashboardActor } from './dashboard.service';
import { drillReturnedIds } from './dashboard-queries';
import { isNewsroomWide } from './dashboard-layout.config';
import { isNarrowScopeActor, myStepNumbers } from './sidebar-scope';
import { getSidebarCountsCache, setSidebarCountsCache } from './sidebar-counts-cache';
import { NewsService } from '../news/news.service';

export interface CountCell {
  value: number;
  scope: 'wide' | 'mine';
}

function hasModulePerm(map: PermissionMap | null | undefined, module: string): boolean {
  if (!map) return false;
  if (map['*']?.includes('*')) return true;
  return (map[module]?.length ?? 0) > 0;
}

@Injectable()
export class SidebarCountsService {
  constructor(
    private prisma: PrismaService,
    private roles: RolesService,
    private wf: WorkflowConfigService,
    private dashboard: DashboardService,
    private news: NewsService,
  ) {}

  async counts(userId: string | null, jwtUser: any): Promise<any> {
    if (!userId) return { scope: 'mine', myQueue: { value: 0, scope: 'mine' as const } };
    const cached = getSidebarCountsCache(userId);
    if (cached) return cached;
    const actor: DashboardActor = await this.dashboard.actor(userId);
    let permMap: PermissionMap | null = null;
    try {
      permMap = await this.roles.permissionMapForAdmin(userId);
    } catch { /* fallback duoi */ }
    if (!permMap) permMap = fallbackPermissionMap(jwtUser);
    const wide = isNewsroomWide(actor.roleName, actor.isFullAdmin);
    const scope: 'wide' | 'mine' = wide ? 'wide' : 'mine';
    const narrow = isNarrowScopeActor(actor);
    const mySteps = (key: string) => myStepNumbers(this.wf.steps(key), actor.roleName);

    const out: any = { scope, myQueue: { value: await this.dashboard.myQueueTotal(actor), scope: 'mine' as const } };

    // Tin bai (module articles): countsAdmin da sua pham vi hep cho 2
    // ngan draft/pending; myCounts cho "cua toi"; returned tinh rieng.
    if (hasModulePerm(permMap, 'articles')) {
      const [c, my] = await Promise.all([
        this.news.countsAdmin({ actorId: actor.id, actorRoleName: actor.roleName, actorIsFullAdmin: actor.isFullAdmin }),
        this.news.myCounts(actor.id),
      ]);
      const draftIds = await (this.prisma as any).newsArticle.findMany({
        where: { status: 'draft', ...(narrow && actor.id ? { createdBy: actor.id } : {}) },
        select: { id: true },
      });
      const returnedIds = await drillReturnedIds(this.prisma, 'newsArticleApproval', 'articleId', draftIds.map((d: any) => d.id));
      out.news = {
        draft: { value: c.draft, scope },
        authored: { value: my.authored, scope: 'mine' as const },
        draftMine: { value: my.draft, scope: 'mine' as const },
        returned: { value: returnedIds.length, scope },
        pending: { value: c.pending_review, scope },
        published: { value: c.published, scope: 'wide' as const },
      };
    }

    // Bai bao in / tuong thuat: groupBy theo pham vi + returned rieng.
    if (hasModulePerm(permMap, 'print_articles')) {
      out.printArticle = await this.moduleCounts('printArticle', 'printArticleApproval', 'articleId', 'print-article', actor, narrow, mySteps('print-article'), ['draft', 'pending', 'approved']);
    }
    if (hasModulePerm(permMap, 'liveblog')) {
      out.liveblog = await this.moduleCounts('liveblog', 'liveblogApproval', 'liveblogId', 'liveblog', actor, narrow, mySteps('liveblog'), ['draft', 'pending', 'published']);
    }

    // So bao (module epaper): tong danh sach toan cuc (list khong loc)
    // + cho duyet theo pham vi.
    if (hasModulePerm(permMap, 'epaper')) {
      const steps = mySteps('epaper');
      const pendingWhere: any = { status: 'pending_review' };
      if (narrow && actor.id) {
        pendingWhere.AND = [{ OR: [{ createdBy: actor.id }, ...(steps.length ? [{ workflowStep: { in: steps } }] : [])] }];
      }
      const [total, pending] = await Promise.all([
        (this.prisma as any).epaperIssue.count(),
        (this.prisma as any).epaperIssue.count({ where: pendingWhere }),
      ]);
      out.epaper = {
        total: { value: total, scope: 'wide' as const },
        pending: { value: pending, scope },
      };
    }

    setSidebarCountsCache(userId, out);
    return out;
  }

  /**
   * Dem theo trang thai cho 1 phan he co workflow (bai bao in, tuong
   * thuat). keys: ['draft','pending','approved'|'published'] — 'pending'
   * map sang status 'pending_review'; 'approved'/'published' toan cuc.
   */
  private async moduleCounts(
    itemModel: string,
    approvalModel: string,
    fk: string,
    workflowKey: string,
    actor: DashboardActor,
    narrow: boolean,
    steps: number[],
    keys: string[],
  ): Promise<Record<string, CountCell>> {
    const db: any = this.prisma as any;
    const scope: 'wide' | 'mine' = narrow ? 'mine' : 'wide';
    const draftWhere: any = { status: 'draft', ...(narrow && actor.id ? { createdBy: actor.id } : {}) };
    const pendingWhere: any = { status: 'pending_review' };
    if (narrow && actor.id) {
      pendingWhere.AND = [{ OR: [{ createdBy: actor.id }, ...(steps.length ? [{ workflowStep: { in: steps } }] : [])] }];
    }
    const jobs: Record<string, Promise<number>> = {};
    if (keys.includes('draft')) jobs.draft = db[itemModel].count({ where: draftWhere });
    if (keys.includes('pending')) jobs.pending = db[itemModel].count({ where: pendingWhere });
    if (keys.includes('approved')) jobs.approved = db[itemModel].count({ where: { status: 'approved' } });
    if (keys.includes('published')) jobs.published = db[itemModel].count({ where: { status: 'published' } });
    const draftIdsPromise = db[itemModel].findMany({ where: draftWhere, select: { id: true } });
    const [counts, draftIds] = await Promise.all([
      Promise.all(Object.entries(jobs).map(async ([k, p]) => [k, await p] as const)),
      draftIdsPromise,
    ]);
    const returnedIds = await drillReturnedIds(this.prisma, approvalModel, fk, draftIds.map((d: any) => d.id));
    const out: Record<string, CountCell> = {};
    for (const [k, v] of counts) out[k] = { value: v, scope: (k === 'approved' || k === 'published') ? 'wide' : scope };
    out.returned = { value: returnedIds.length, scope };
    return out;
  }
}
