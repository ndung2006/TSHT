// E2 — bat buoc chuyen muc khi gui duyet / xuat ban tin bai.
// Helper thuan (khong phu thuoc Nest/Prisma) de test duoc bang node --test.
// Nhap chua co chuyen muc la hop le — chi goi helper nay tai cac diem
// gui duyet / xuat ban (submitForReview, setPublished khi publish=true,
// approveStep khi ket qua transition la published, ke ca duyet khan),
// KHONG goi o create/patch.
export const PUBLISH_WITHOUT_CATEGORY_MESSAGE = 'Chọn chuyên mục';

/** Tra cau loi khi bai thieu chuyen muc, null khi du dieu kien xuat ban. */
export function publishCategoryError(categoryId: string | null | undefined): string | null {
  return categoryId ? null : PUBLISH_WITHOUT_CATEGORY_MESSAGE;
}
