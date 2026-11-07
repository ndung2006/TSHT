// Test nut "Xoa" trang Tin bai CMS — pin o muc source.
// Nguyen nhan goc: removeItem dung window.confirm (dialog goc cua
// trinh duyet) — tu dong hoa KHONG chap nhan duoc dialog goc nen bam
// nut Xoa khong co phan hoi gi (khong hop thoai, khong toast). Trang
// nay la trang duy nhat trong CMS dung window.confirm de xoa bai;
// cac trang khac (vd bai-bao-in.vue) dung PrimeVue confirm.require
// (dialog DOM, <ConfirmDialog /> da dang ky toan cuc o
// layouts/admin.vue:91) nen bam duoc ca bang tay lan tu dong hoa.
// Fix: doi removeItem sang confirm.require + doc loi bang
// apiErrDetail (e.data.error.message truoc, nhu 5 handler kia).
// Run: node --test test/cms-tin-bai-delete.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = fs.readFileSync(
  path.join(root, "vtcany/apps/cms/pages/tin-bai.vue"),
  "utf8",
);

// Cat than ham removeItem (tu "function removeItem" den het ham,
// ngay truoc khoi "// --- Quy trinh duyet ---").
const start = src.indexOf("function removeItem");
assert.ok(start > 0, "thieu ham removeItem");
const end = src.indexOf("// --- Quy trinh duyet ---", start);
assert.ok(end > start, "khong tim duoc cuoi ham removeItem");
const fn = src.slice(start, end);

test("tin-bai.vue: khong con window.confirm (dialog goc tu dong hoa khong chap nhan duoc)", () => {
  assert.ok(!src.includes("window.confirm"), "van con window.confirm trong tin-bai.vue");
});

test("tin-bai.vue: dung PrimeVue useConfirm", () => {
  assert.ok(
    src.includes("import { useConfirm } from 'primevue/useconfirm';"),
    "thieu import useConfirm tu primevue/useconfirm",
  );
  assert.ok(src.includes("const confirm = useConfirm();"), "thieu const confirm = useConfirm()");
});

test("removeItem: hien hop xac nhan PrimeVue, chap nhan thi goi API xoa roi tai lai danh sach", () => {
  assert.ok(fn.includes("confirm.require({"), "removeItem phai goi confirm.require");
  assert.ok(fn.includes("`Xóa bài \"${it.title}\"?`"), "thieu message xac nhan ten bai");
  assert.ok(fn.includes("acceptLabel: 'Xóa'"), "thieu acceptLabel 'Xóa'");
  assert.ok(fn.includes("rejectLabel: 'Hủy'"), "thieu rejectLabel 'Hủy'");
  assert.ok(
    fn.includes("await api.del(`/admin/news/${it.publicId}`)"),
    "accept phai goi api.del /admin/news/:publicId",
  );
  assert.ok(fn.includes("load(meta.value.page)"), "sau khi xoa phai tai lai danh sach");
  assert.ok(fn.includes("toast.add({ severity: 'success', summary: 'Đã xóa'"), "thieu toast 'Đã xóa'");
});

test("removeItem: toast loi doc dung apiErrDetail (e.data.error.message truoc)", () => {
  assert.ok(
    fn.includes("apiErrDetail(e, 'Xóa thất bại')"),
    "toast loi phai dung apiErrDetail(e, 'Xóa thất bại')",
  );
  assert.ok(
    !fn.includes("e?.response?.data?.message"),
    "removeItem van doc loi theo mau cu e.response.data",
  );
});

test("nut Xoa van chi hien khi co quyen articles:delete va bai o trang thai nhap / da ha xuat ban", () => {
  assert.ok(
    src.includes(
      "v-if=\"can('articles:delete') && (data.status === 'draft' || data.status === 'unpublished')\"",
    ),
    "dieu kien hien nut Xoa bi doi",
  );
});
