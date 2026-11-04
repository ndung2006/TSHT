// Fallback + cau hinh tinh cho engine quy trinh dong.
// Khi DB chua co definition cho mot phan he (migration chua chay, hoac
// dong bi xoa tay), backend dung dung cac mang STEPS cung nay — hanh vi
// khong doi mot ly so voi truoc khi co bang dong. Seed SQL trong migration
// phai khop dung du lieu nay (test workflow-seed.test.mjs doi chieu).

import { EPAPER_WORKFLOW_STEPS, EPAPER_WORKFLOW_AUTHOR_LABEL } from '../epaper/epaper-workflow';
import { NEWS_WORKFLOW_STEPS, NEWS_WORKFLOW_AUTHOR_LABEL } from '../news/news-workflow';
import { PRINT_ARTICLE_WORKFLOW_STEPS } from '../print-articles/print-article-workflow';
import { EVENT_WORKFLOW_STEPS, EVENT_WORKFLOW_AUTHOR_LABEL } from '../events/events-workflow';
import { LIVEBLOG_WORKFLOW_STEPS, LIVEBLOG_WORKFLOW_AUTHOR_LABEL } from '../liveblog/liveblog-workflow';
import { AD_WORKFLOW_STEPS, AD_WORKFLOW_AUTHOR_LABEL } from '../ads/ads-workflow';
import { ROYALTY_WORKFLOW_STEPS, ROYALTY_WORKFLOW_AUTHOR_LABEL } from '../royalties/royalties-workflow';
import type { EngineStep, ModuleProfile } from './workflow-engine';

export interface FallbackDefinition {
  moduleKey: string;
  label: string;
  authorRole: string | null;
  authorLabel: string | null;
  enabled: boolean;
  steps: EngineStep[];
  profile: ModuleProfile;
}

function toEngine(steps: { key: string; label: string; roleName: string; roleNames?: string[] }[]): EngineStep[] {
  // Fallback giu dung hanh vi cu: tra ve nhap + khong duyet khan.
  return steps.map((s) => ({ ...s, returnTo: 'creator' as const, allowEmergency: false }));
}

export const WORKFLOW_MODULE_KEYS = [
  'epaper',
  'news',
  'print-article',
  'events',
  'liveblog',
  'ads',
  'royalties',
  'video',
] as const;

export type WorkflowModuleKey = (typeof WORKFLOW_MODULE_KEYS)[number];

export const WORKFLOW_FALLBACKS: Record<WorkflowModuleKey, FallbackDefinition> = {
  epaper: {
    moduleKey: 'epaper',
    label: 'Báo in',
    authorRole: EPAPER_WORKFLOW_AUTHOR_LABEL,
    authorLabel: 'KTV — Kỹ thuật viên (Chế bản/Dàn trang)',
    enabled: true,
    steps: toEngine(EPAPER_WORKFLOW_STEPS),
    profile: { finalStatus: 'published', publishDirectFrom: ['draft'], unpublishTo: 'draft', allowUnlock: false },
  },
  news: {
    moduleKey: 'news',
    label: 'Báo điện tử',
    authorRole: NEWS_WORKFLOW_AUTHOR_LABEL,
    authorLabel: 'PV — Phóng viên (tác giả)',
    enabled: true,
    steps: toEngine(NEWS_WORKFLOW_STEPS),
    profile: { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false },
  },
  'print-article': {
    moduleKey: 'print-article',
    label: 'Bài báo in',
    authorRole: 'PV',
    authorLabel: 'PV — Phóng viên',
    enabled: true,
    steps: toEngine(PRINT_ARTICLE_WORKFLOW_STEPS),
    profile: { finalStatus: 'approved', publishDirectFrom: [], unpublishTo: null, allowUnlock: false },
  },
  events: {
    moduleKey: 'events',
    label: 'Sự kiện tòa soạn',
    authorRole: EVENT_WORKFLOW_AUTHOR_LABEL,
    authorLabel: 'QLSK',
    enabled: true,
    steps: toEngine(EVENT_WORKFLOW_STEPS),
    profile: { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false },
  },
  liveblog: {
    moduleKey: 'liveblog',
    label: 'Tường thuật trực tiếp',
    authorRole: LIVEBLOG_WORKFLOW_AUTHOR_LABEL,
    authorLabel: 'PVTT',
    enabled: true,
    steps: toEngine(LIVEBLOG_WORKFLOW_STEPS),
    profile: { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false },
  },
  ads: {
    moduleKey: 'ads',
    label: 'Quảng cáo tòa soạn',
    authorRole: AD_WORKFLOW_AUTHOR_LABEL,
    authorLabel: 'QL-QC',
    enabled: true,
    steps: toEngine(AD_WORKFLOW_STEPS),
    profile: { finalStatus: 'published', publishDirectFrom: ['draft', 'unpublished'], unpublishTo: 'unpublished', allowUnlock: false },
  },
  royalties: {
    moduleKey: 'royalties',
    label: 'Nhuận bút',
    authorRole: ROYALTY_WORKFLOW_AUTHOR_LABEL,
    authorLabel: 'TP',
    enabled: true,
    steps: toEngine(ROYALTY_WORKFLOW_STEPS),
    profile: { finalStatus: 'approved', publishDirectFrom: [], unpublishTo: null, allowUnlock: true },
  },
  video: {
    moduleKey: 'video',
    label: 'Video/Truyền hình/Phát thanh',
    authorRole: null,
    authorLabel: null,
    // Video mac dinh TAT luong duyet: giu nguyen co che hien thi nhanh.
    enabled: false,
    steps: toEngine([{ key: 'tbt', label: 'TBT — Tổng Biên tập', roleName: 'TBT' }]),
    profile: { finalStatus: 'published', publishDirectFrom: [], unpublishTo: null, allowUnlock: false },
  },
};

export function isWorkflowModuleKey(v: string): v is WorkflowModuleKey {
  return (WORKFLOW_MODULE_KEYS as readonly string[]).includes(v);
}

/**
 * Registry bang luu ho so dang chay theo phan he (phuc vu dem + remap khi
 * doi cau truc buoc). video = null vi video khong co truong workflowStep.
 */
export interface InFlightRegistry {
  /** Ten delegate Prisma, vd 'epaperIssue'. */
  table: string;
  /** Ten delegate bang lich su duyet, vd 'epaperIssueApproval'. */
  approvalTable: string;
  /** Ten field FK trong bang lich su, vd 'issueId'. */
  approvalFk: string;
}

export const WORKFLOW_IN_FLIGHT: Record<string, InFlightRegistry | null> = {
  epaper: { table: 'epaperIssue', approvalTable: 'epaperIssueApproval', approvalFk: 'issueId' },
  news: { table: 'newsArticle', approvalTable: 'newsArticleApproval', approvalFk: 'articleId' },
  'print-article': { table: 'printArticle', approvalTable: 'printArticleApproval', approvalFk: 'articleId' },
  events: { table: 'newsroomEvent', approvalTable: 'newsroomEventApproval', approvalFk: 'eventId' },
  liveblog: { table: 'liveblog', approvalTable: 'liveblogApproval', approvalFk: 'liveblogId' },
  ads: { table: 'newsroomAd', approvalTable: 'newsroomAdApproval', approvalFk: 'adId' },
  royalties: { table: 'articleRoyalty', approvalTable: 'articleRoyaltyApproval', approvalFk: 'royaltyId' },
  video: null,
};
