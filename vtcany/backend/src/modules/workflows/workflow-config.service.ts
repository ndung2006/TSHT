// Dich vu cau hinh quy trinh duyet dong.
//
// Doc cau hinh theo 2 lop:
// - Ghi (admin luu) luon xuong DB, xong refresh cache ngay.
// - Doc trong luong duyet (service goi dong bo tu toItem/approve/return)
//   lay tu cache nap luc khoi dong + sau moi lan ghi. Neu DB chua co
//   definition (migration chua chay) hoac doc DB loi thi dung mang cung
//   cu — hanh vi khong doi. Chi sua DB truc tiep moi can restart de nap
//   lai cache; sua qua API thi cache tuoi ngay lap tuc.
//
// An toan ho so dang chay (workflowStep > 0):
// - Sua metadata buoc (label, roleName, returnTo, allowEmergency) thi chi
//   doi dinh nghia, khong dong workflowStep cua ho so.
// - Doi cau truc (them/xoa/doi thu tu key) thi remap workflowStep theo
//   KEY: giu key thi nhan vi tri moi; buoc bi xoa ma ho so dang dung thi
//   ve nhap kem dong lich su ghi chu he thong.

import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  engineCanApprove,
  engineStepLabel,
  engineTransition,
  remapStep,
  type EngineAction,
  type EngineStep,
  type ModuleProfile,
  type WorkflowState,
} from './workflow-engine';
import {
  WORKFLOW_FALLBACKS,
  WORKFLOW_IN_FLIGHT,
  isWorkflowModuleKey,
  type WorkflowModuleKey,
} from './workflow-fallback';

interface CachedDefinition {
  label: string;
  authorRole: string | null;
  authorLabel: string | null;
  enabled: boolean;
  steps: EngineStep[];
  source: 'db' | 'fallback';
}

/** Chuan hoa roleNames luu JSON ve mang chuoi; rong/khong hop le -> [roleName]. */
function normalizeRoleNames(raw: unknown, roleName: string): string[] {
  const arr = Array.isArray(raw) ? raw : [];
  const names = [...new Set(arr.map((r) => String(r).trim()).filter(Boolean))];
  if (names.length) {
    if (!names.some((n) => n.toLowerCase() === String(roleName).toLowerCase())) names.unshift(roleName);
    return names;
  }
  return [roleName];
}

export interface SaveStepInput {
  key?: string;
  label?: string;
  roleName?: string;
  /** Cac Role duoc duyet buoc nay; thieu/rong = [roleName]. */
  roleNames?: string[];
  returnTo?: string;
  allowEmergency?: boolean;
}

export interface SaveDefinitionInput {
  label?: string;
  authorRole?: string | null;
  authorLabel?: string | null;
  enabled?: boolean;
  steps?: SaveStepInput[];
}

@Injectable()
export class WorkflowConfigService implements OnModuleInit {
  private cache = new Map<string, CachedDefinition>();

  constructor(private prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.refresh();
    } catch (e: any) {
      // DB chua co bang (migration chua chay) hoac loi ket noi: giu
      // fallback, khong lam hong khoi dong backend.
      console.warn('[workflows] khong nap duoc cau hinh tu DB, dung fallback:', e?.message || e);
    }
  }

  /** Nap lai toan bo definition tu DB vao cache. */
  async refresh(): Promise<void> {
    const rows = await this.prisma.workflowDefinition.findMany({
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    const next = new Map<string, CachedDefinition>();
    for (const key of Object.keys(WORKFLOW_FALLBACKS)) {
      const fb = WORKFLOW_FALLBACKS[key as WorkflowModuleKey];
      next.set(key, {
        label: fb.label,
        authorRole: fb.authorRole,
        authorLabel: fb.authorLabel,
        enabled: fb.enabled,
        steps: fb.steps,
        source: 'fallback',
      });
    }
    for (const row of rows) {
      if (!isWorkflowModuleKey(row.moduleKey)) continue;
      next.set(row.moduleKey, {
        label: row.label,
        authorRole: row.authorRole,
        authorLabel: row.authorLabel,
        enabled: row.enabled,
        steps: row.steps.map((s) => ({
          key: s.key,
          label: s.label,
          roleName: s.roleName,
          // roleNames luu JSON: chuan hoa ve mang chuoi, rong -> [roleName].
          roleNames: normalizeRoleNames((s as any).roleNames, s.roleName),
          returnTo: s.returnTo === 'previous' ? 'previous' : 'creator',
          allowEmergency: !!s.allowEmergency,
        })),
        source: 'db',
      });
    }
    this.cache = next;
  }

  private cached(key: string): CachedDefinition {
    const hit = this.cache.get(key);
    if (hit) return hit;
    // FallbackDefinition khong co field `source` (co them moduleKey/profile)
    // nen khong cast truc tiep ca map sang CachedDefinition duoc (TS2352):
    // dung entry fallback de dung 1 CachedDefinition voi source 'fallback'.
    const fb = isWorkflowModuleKey(key) ? WORKFLOW_FALLBACKS[key] : undefined;
    if (fb) {
      return {
        label: fb.label,
        authorRole: fb.authorRole,
        authorLabel: fb.authorLabel,
        enabled: fb.enabled,
        steps: fb.steps,
        source: 'fallback',
      };
    }
    throw new NotFoundException('phan he quy trinh khong ton tai');
  }

  private profile(key: string): ModuleProfile {
    return WORKFLOW_FALLBACKS[key as WorkflowModuleKey].profile;
  }

  // ---------- Doc dong bo cho luong duyet (service goi) ----------

  steps(key: string): EngineStep[] {
    return this.cached(key).steps;
  }

  stepLabel(key: string, step: number): string | null {
    return engineStepLabel(this.steps(key), step);
  }

  totalSteps(key: string): number {
    return this.steps(key).length;
  }

  canApprove(key: string, actorRoleName: string | null, isFullAdmin: boolean, step: number): boolean {
    return engineCanApprove(this.steps(key), actorRoleName, isFullAdmin, step);
  }

  stepAllowsEmergency(key: string, step: number): boolean {
    return this.steps(key)[step - 1]?.allowEmergency === true;
  }

  transition(key: string, state: WorkflowState, action: EngineAction): WorkflowState {
    return engineTransition(this.profile(key), this.steps(key), state, action);
  }

  authorLabel(key: string): string | null {
    return this.cached(key).authorLabel;
  }

  authorRole(key: string): string | null {
    return this.cached(key).authorRole;
  }

  /** Video dung cong tac nay; cac luong loi luon coi nhu bat. */
  enabled(key: string): boolean {
    if (key === 'video') return this.cached(key).enabled;
    return true;
  }

  source(key: string): 'db' | 'fallback' {
    return this.cached(key).source;
  }

  // ---------- API quan tri (async, doc truc tiep DB) ----------

  async list(): Promise<any[]> {
    const rows = await this.prisma.workflowDefinition.findMany({
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { moduleKey: 'asc' },
    });
    const byKey = new Map(rows.map((r) => [r.moduleKey, r]));
    const out: any[] = [];
    for (const key of Object.keys(WORKFLOW_FALLBACKS)) {
      const fb = WORKFLOW_FALLBACKS[key as WorkflowModuleKey];
      const row: any = byKey.get(key);
      out.push({
        moduleKey: key,
        label: row?.label ?? fb.label,
        authorRole: row?.authorRole ?? fb.authorRole,
        authorLabel: row?.authorLabel ?? fb.authorLabel,
        enabled: row?.enabled ?? fb.enabled,
        source: row ? 'db' : 'fallback',
        structureChangedAt: (row as any)?.structureChangedAt ?? null,
        inFlight: await this.countInFlight(key),
        steps: (row?.steps ?? fb.steps).map((s: any, i: number) => ({
          id: s.id ?? null,
          key: s.key,
          label: s.label,
          roleName: s.roleName,
          roleNames: s.roleNames?.length ? s.roleNames : [s.roleName],
          sortOrder: s.sortOrder ?? i,
          returnTo: s.returnTo ?? 'creator',
          allowEmergency: !!s.allowEmergency,
        })),
      });
    }
    return out;
  }

  async get(key: string): Promise<any> {
    if (!isWorkflowModuleKey(key)) throw new NotFoundException('phan he quy trinh khong ton tai');
    const row = await this.prisma.workflowDefinition.findUnique({
      where: { moduleKey: key },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
    const fb = WORKFLOW_FALLBACKS[key];
    if (!row) {
      return {
        moduleKey: key,
        label: fb.label,
        authorRole: fb.authorRole,
        authorLabel: fb.authorLabel,
        enabled: fb.enabled,
        source: 'fallback',
        steps: fb.steps.map((s, i) => ({ id: null, ...s, sortOrder: i })),
      };
    }
    return {
      moduleKey: key,
      label: row.label,
      authorRole: row.authorRole,
      authorLabel: row.authorLabel,
      enabled: row.enabled,
      source: 'db',
      structureChangedAt: (row as any).structureChangedAt ?? null,
      steps: row.steps.map((s) => ({
        id: s.id,
        key: s.key,
        label: s.label,
        roleName: s.roleName,
        roleNames: normalizeRoleNames((s as any).roleNames, s.roleName),
        sortOrder: s.sortOrder,
        returnTo: s.returnTo,
        allowEmergency: s.allowEmergency,
      })),
    };
  }

  async roles(): Promise<{ id: string; name: string }[]> {
    return this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async inFlight(key: string): Promise<{ count: number; byStep: { step: number; count: number }[] }> {
    const reg = WORKFLOW_IN_FLIGHT[key];
    if (!reg) return { count: 0, byStep: [] };
    const rows = await (this.prisma as any)[reg.table].findMany({
      where: { workflowStep: { gt: 0 } },
      select: { workflowStep: true },
    });
    const byStep = new Map<number, number>();
    for (const r of rows) byStep.set(r.workflowStep, (byStep.get(r.workflowStep) || 0) + 1);
    return {
      count: rows.length,
      byStep: [...byStep.entries()].map(([step, count]) => ({ step, count })).sort((a, b) => a.step - b.step),
    };
  }

  private async countInFlight(key: string): Promise<number> {
    try {
      return (await this.inFlight(key)).count;
    } catch {
      return 0;
    }
  }

  /**
   * Luu dinh nghia phan he. Tra ve so ho so dang chay truoc khi luu,
   * so dong duoc remap va so dong bi dua ve nhap (khi doi cau truc).
   */
  async save(key: string, input: SaveDefinitionInput): Promise<any> {
    if (!isWorkflowModuleKey(key)) throw new NotFoundException('phan he quy trinh khong ton tai');
    const fb = WORKFLOW_FALLBACKS[key];
    if (key !== 'video' && input.enabled === false) {
      throw new BadRequestException('khong the tat luong duyet loi cua phan he nay (chi video moi co cong tac bat/tat)');
    }

    const stepsIn = input.steps ?? null;
    let normSteps: EngineStep[] | null = null;
    if (stepsIn) {
      if (!stepsIn.length) throw new BadRequestException('quy trinh phai co it nhat 1 buoc duyet');
      const seen = new Set<string>();
      for (const s of stepsIn) {
        if (!s.key || !String(s.key).trim()) throw new BadRequestException('moi buoc phai co key on dinh');
        if (seen.has(s.key)) throw new BadRequestException(`trung key buoc: ${s.key}`);
        seen.add(s.key);
        if (!s.label || !String(s.label).trim()) throw new BadRequestException(`buoc ${s.key} thieu ten hien thi`);
        if (!s.roleName || !String(s.roleName).trim()) throw new BadRequestException(`buoc ${s.key} thieu Role duyet`);
        if (s.roleNames !== undefined && (!Array.isArray(s.roleNames) || !s.roleNames.length)) {
          throw new BadRequestException(`buoc ${s.key} co danh sach Role duyet rong`);
        }
        if (s.returnTo !== undefined && s.returnTo !== 'creator' && s.returnTo !== 'previous') {
          throw new BadRequestException(`buoc ${s.key} co huong tra lai khong hop le`);
        }
      }
      // Role phai ton tai trong DB (dropdown o CMS da chan, day la lop chan
      // thu hai o API de khong bao gio luu ten Role go sai). Kiem ca
      // roleName chinh va moi Role trong roleNames.
      const names = [...new Set(stepsIn.flatMap((s) => [s.roleName as string, ...((s.roleNames as string[]) || [])]))];
      const found = await this.prisma.role.findMany({ where: { name: { in: names } }, select: { name: true } });
      const have = new Set(found.map((r) => r.name.toLowerCase()));
      const missing = names.filter((n) => !have.has(n.toLowerCase()));
      if (missing.length) throw new BadRequestException(`Role chua ton tai trong DB: ${missing.join(', ')} (hay tao Role truoc)`);
      normSteps = stepsIn.map((s) => ({
        key: s.key as string,
        label: String(s.label).trim(),
        roleName: s.roleName as string,
        roleNames: normalizeRoleNames(s.roleNames, s.roleName as string),
        returnTo: s.returnTo === 'previous' ? 'previous' : 'creator',
        allowEmergency: !!s.allowEmergency,
      }));
    }

    const old = await this.get(key);
    const oldSteps: EngineStep[] = old.steps;
    const oldKeySeq = oldSteps.map((s) => s.key).join('|');
    const newKeySeq = normSteps ? normSteps.map((s) => s.key).join('|') : oldKeySeq;
    const structureChanged = normSteps !== null && newKeySeq !== oldKeySeq;

    const inFlightBefore = await this.countInFlight(key);
    let remapped = 0;
    let resetToDraft = 0;

    const reg = WORKFLOW_IN_FLIGHT[key];
    const ops: any[] = [];
    if (structureChanged && reg && normSteps) {
      const rows = await (this.prisma as any)[reg.table].findMany({
        where: { workflowStep: { gt: 0 } },
        select: { id: true, workflowStep: true },
      });
      for (const row of rows) {
        const r = remapStep(oldSteps, normSteps, row.workflowStep);
        if (r.resetToDraft) {
          resetToDraft += 1;
          const oldLabel = oldSteps[row.workflowStep - 1]?.label || `buoc ${row.workflowStep}`;
          ops.push(
            (this.prisma as any)[reg.table].update({
              where: { id: row.id },
              data: { status: 'draft', workflowStep: 0 },
            }),
            (this.prisma as any)[reg.approvalTable].create({
              data: {
                [reg.approvalFk]: row.id,
                step: row.workflowStep,
                stepLabel: oldLabel,
                actorId: null,
                actorRole: 'Hệ thống',
                action: 'return',
                comment: `Hệ thống tự động trả về nháp do cấu trúc quy trình thay đổi (bước "${oldLabel}" đã bị xóa).`,
              },
            }),
          );
        } else if (r.step !== row.workflowStep) {
          remapped += 1;
          ops.push(
            (this.prisma as any)[reg.table].update({
              where: { id: row.id },
              data: { workflowStep: r.step },
            }),
          );
        }
      }
    }

    const defData = {
      label: input.label?.trim() ? input.label.trim() : old.label,
      authorRole: input.authorRole !== undefined ? input.authorRole : old.authorRole,
      authorLabel: input.authorLabel !== undefined ? input.authorLabel : old.authorLabel,
      enabled: input.enabled !== undefined ? !!input.enabled : old.enabled,
      // Chi khi cau truc that su doi (key/thu tu buoc) moi ghi moc: B7
      // dung moc nay de bo qua approval cu (so buoc cu khong map dung
      // buoc moi). Doi metadata (label/role) khong ghi moc.
      ...(structureChanged ? { structureChangedAt: new Date() } : {}),
    };
    ops.unshift(
      this.prisma.workflowDefinition.upsert({
        where: { moduleKey: key },
        create: { moduleKey: key, ...defData },
        update: defData,
      }),
    );
    if (normSteps) {
      // Ghi lai toan bo buoc theo thu tu moi (xoa + tao lai): don gian va
      // khong lo thung key cu sot lai.
      ops.push(
        this.prisma.workflowStep.deleteMany({ where: { definition: { moduleKey: key } } }),
        ...normSteps.map((s, i) =>
          this.prisma.workflowStep.create({
            data: {
              definition: { connect: { moduleKey: key } },
              key: s.key,
              label: s.label,
              roleName: s.roleName,
              roleNames: s.roleNames as any,
              sortOrder: i,
              returnTo: s.returnTo,
              allowEmergency: s.allowEmergency,
            },
          }),
        ),
      );
    }
    // Thu tu ops: upsert definition truoc, roi remap, roi ghi buoc. Vi
    // deleteMany/createMany buoc khong phu thuoc remap nen de chung 1
    // transaction van an toan (remap chi doc workflowStep cu truoc khi luu).
    await this.prisma.$transaction(ops);
    await this.refresh();

    return { ...(await this.get(key)), inFlightBefore, remapped, resetToDraft, structureChanged };
  }
}
