// Logic thuan cho HomeSlotList/HomeSlotItem (Buoc 0 sap xep Noi bat /
// Tieu diem, phuong an A). Khong import Nest/Prisma de test truc tiep
// bang node --test (xem home-slots.test.mjs).
//
// Quyet dinh user da chot:
// - Q1: noi-bat toi da 4, tieu-diem toi da 3; maxSlots doi duoc trong
//   cau hinh (chi zones:publish). Q2: mot bai duoc o ca hai khoi, cam
//   trung trong cung mot khoi. Q6: giam maxSlots xuong duoi so bai dang
//   co -> chan luu, bao go bot truoc. Q9/Q11: chi noi-bat co "Bai chinh"
//   o vi tri 1, nguoi sap xep tu chon.

export const HOME_SLOT_BLOCKS = {
  'noi-bat': {
    key: 'noi-bat',
    label: 'Tin nổi bật',
    flag: 'isFeatured',
    defaultMaxSlots: 4,
    hasMainArticle: true,
  },
  'tieu-diem': {
    key: 'tieu-diem',
    label: 'Tin tiêu điểm',
    flag: 'isSpotlight',
    defaultMaxSlots: 3,
    hasMainArticle: false,
  },
} as const;

export type HomeSlotBlockKey = keyof typeof HOME_SLOT_BLOCKS;

export function isHomeSlotBlockKey(v: any): v is HomeSlotBlockKey {
  return typeof v === 'string' && v in HOME_SLOT_BLOCKS;
}

/** Co tick tren NewsArticle dua bai vao kho cua khoi (Q12: kho chi bai published + publishAt <= now). */
export function blockFlag(blockKey: HomeSlotBlockKey): 'isFeatured' | 'isSpotlight' {
  return HOME_SLOT_BLOCKS[blockKey].flag;
}

export function blockLabel(blockKey: HomeSlotBlockKey): string {
  return HOME_SLOT_BLOCKS[blockKey].label;
}

export function defaultMaxSlots(blockKey: HomeSlotBlockKey): number {
  return HOME_SLOT_BLOCKS[blockKey].defaultMaxSlots;
}

/** Cac publicId trung trong cung mot danh sach (Q2: cam trung trong khoi). Tra ve tung publicId trung mot lan, theo thu tu xuat hien lan 2. */
export function findDuplicatePublicIds(items: string[]): string[] {
  const seen = new Set<string>();
  const dups: string[] = [];
  for (const id of items || []) {
    if (seen.has(id)) {
      if (!dups.includes(id)) dups.push(id);
    } else {
      seen.add(id);
    }
  }
  return dups;
}

/** Khoa lac quan: version gui len phai bang version hien tai, neu khac -> 409 (nguoi khac da luu truoc). */
export function isVersionMatch(sent: any, current: number): boolean {
  return Number(sent) === current;
}

/** Q6: so bai vuot maxSlots -> tra thong bao chan luu; hop le -> null. */
export function maxSlotsError(maxSlots: any, count: number): string | null {
  const max = Number(maxSlots);
  if (!Number.isInteger(max) || max < 1) return 'so vi tri toi da phai la so nguyen >= 1';
  if (count > max) return `danh sach co ${count} bai, vuot qua so vi tri toi da ${max} — hay go bot ${count - max} bai roi luu lai`;
  return null;
}

/** (c) Bai vua la Bai chinh (vi tri 1 khoi noi-bat) vua trong danh sach tieu-diem: trang chu bo link trung do, khong lap bai khac. */
export function isMainArticleInSpotlight(heroFirstPublicId: string | null, spotlightPublicIds: string[]): boolean {
  if (!heroFirstPublicId) return false;
  return (spotlightPublicIds || []).includes(heroFirstPublicId);
}
