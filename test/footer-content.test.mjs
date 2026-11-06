// Tests for the shared footer content (portal only): the Dien Bien Phu
// model footer renders its license / editorial-board / contact lines
// from ONE config file (lib/footer-content.mjs), with tel:/mailto:
// links, no old "Tòa soạn hội tụ" link block and no CMS link.
// Run: node --test test/footer-content.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FOOTER_CONTENT, renderFooter, renderFooterContact, renderFooterLicense } from "../lib/footer-content.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const partial = fs.readFileSync(path.join(root, "public/partials/footer.html"), "utf8");

test("footer content: du 3 dong giay phep + ban bien tap du nguoi (gom NGUYEN HUNG CUONG)", () => {
  assert.equal(FOOTER_CONTENT.license.length, 3);
  assert.match(FOOTER_CONTENT.license[0], /725\/GP-BTTTT/);
  assert.match(FOOTER_CONTENT.license[0], /09\/11\/2021/);
  assert.match(FOOTER_CONTENT.license[1], /Bản quyền thuộc về Báo và Phát thanh, Truyền hình Điện Biên/);
  assert.equal(FOOTER_CONTENT.editorInChief, "VŨ VĂN THƯỢNG");
  assert.deepEqual(FOOTER_CONTENT.deputyEditors, ["TRẦN VĂN TOẠI", "NGUYỄN THỊ TƯƠI", "ĐẶNG HẢI TRIỀU", "NGUYỄN HÙNG CƯỜNG"]);
  assert.equal(FOOTER_CONTENT.email, "baodientudbp@gmail.com");
  assert.equal(FOOTER_CONTENT.phones.length, 3);
  assert.match(FOOTER_CONTENT.addressMain, /Số 829, đường Võ Nguyên Giáp/);
  assert.match(FOOTER_CONTENT.addressSecond, /Số 27A, đường Quyết Tiến/);
});

test("renderFooterContact: so dien thoai + email la link bam duoc (tel:/mailto:)", () => {
  const html = renderFooterContact();
  assert.match(html, /<a href="tel:\+842153824624">\(0215\)3824624<\/a>/);
  assert.match(html, /<a href="tel:\+842153835300">\(0215\) 3835300<\/a>/);
  assert.match(html, /<a href="tel:\+842153825357">\(0215\) 3825357<\/a>/);
  assert.match(html, /<a href="mailto:baodientudbp@gmail.com">baodientudbp@gmail.com<\/a>/);
  assert.match(html, /NGUYỄN HÙNG CƯỜNG/);
  assert.match(html, /Trụ sở chính:/);
  assert.match(html, /Cơ sở 2:/);
});

test("renderFooter: chen noi dung vao partial, khong con khoi link cu / CMS", () => {
  assert.match(partial, /<!-- @FOOTER_LICENSE -->/);
  assert.match(partial, /<!-- @FOOTER_CONTACT -->/);
  assert.match(partial, /id="footer-logo-box"/);
  assert.match(partial, /id="to-top"/);
  const html = renderFooter(partial);
  assert.doesNotMatch(html, /@FOOTER_LICENSE|@FOOTER_CONTACT/);
  assert.doesNotMatch(html, /Tòa soạn hội tụ/);
  // Khong con link CMS (chu "CMS" chi duoc xuat hien trong comment code
  // cua partial, khong phai link hay chu hien thi).
  assert.doesNotMatch(html, /admin\.html/);
  assert.doesNotMatch(html, />CMS</);
  assert.match(html, /725\/GP-BTTTT/);
  assert.match(html, /NGUYỄN HÙNG CƯỜNG/);
  assert.match(html, /tel:\+842153824624/);
  assert.match(html, /mailto:baodientudbp@gmail.com/);
});

test("renderFooter: escape HTML trong noi dung cau hinh", () => {
  const evil = {
    ...FOOTER_CONTENT,
    editorInChief: "<script>alert(1)</script>",
    license: ["<b>not bold</b>"],
  };
  assert.doesNotMatch(renderFooterContact(evil), /<script>/);
  assert.match(renderFooterLicense(evil), /&lt;b&gt;not bold&lt;\/b&gt;/);
});
