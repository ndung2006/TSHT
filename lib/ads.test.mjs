import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sanitizePlacement, isSafeLinkUrl, adDisplayItem } from "./ads.mjs";

const resolveImage = (p) => (p.startsWith("/") ? "https://backend.example" + p : p);

test("sanitizePlacement: khoa hop le, rong, khong hop le", () => {
  assert.equal(sanitizePlacement("article_sidebar"), "article_sidebar");
  assert.equal(sanitizePlacement("home-top_1"), "home-top_1");
  assert.equal(sanitizePlacement(""), "");
  assert.equal(sanitizePlacement(null), "");
  assert.equal(sanitizePlacement(undefined), "");
  assert.equal(sanitizePlacement("  home_top  "), "home_top");
  assert.equal(sanitizePlacement("a b"), null);
  assert.equal(sanitizePlacement("a/b"), null);
  assert.equal(sanitizePlacement("a.b"), null);
  assert.equal(sanitizePlacement("a?b=1"), null);
  assert.equal(sanitizePlacement("x".repeat(65)), null);
  assert.equal(sanitizePlacement("quảng cáo"), null);
});

test("isSafeLinkUrl: chi http(s) moi duoc boc link", () => {
  assert.equal(isSafeLinkUrl("https://vtcany.vn"), true);
  assert.equal(isSafeLinkUrl("http://example.com/a?b=1"), true);
  assert.equal(isSafeLinkUrl("  HTTPS://example.com  "), true);
  assert.equal(isSafeLinkUrl("javascript:alert(1)"), false);
  assert.equal(isSafeLinkUrl("data:text/html,<script>"), false);
  assert.equal(isSafeLinkUrl("vbscript:msgbox"), false);
  assert.equal(isSafeLinkUrl("//evil.example"), false);
  assert.equal(isSafeLinkUrl("/duong-dan-tuong-doi"), false);
  assert.equal(isSafeLinkUrl(""), false);
  assert.equal(isSafeLinkUrl(null), false);
  assert.equal(isSafeLinkUrl(undefined), false);
});

test("adDisplayItem: whitelist loai truong noi bo, tach image/html", () => {
  const raw = {
    id: "uuid-noi-bo", publicId: "2f6d538aba0f1364840c7250", name: "QC anh",
    placement: "article_sidebar", type: "image", imagePath: "/images/img-x.png",
    linkUrl: "https://vtcany.vn", htmlContent: "<b>leak?</b>", sortOrder: 2,
    status: "published", createdBy: "admin-id", updatedByRole: "TBT",
    workflowStep: 1, publishAt: "2026-10-30T00:00:00Z", approvals: [{ actor: "x" }],
  };
  const out = adDisplayItem(raw, resolveImage);
  assert.deepEqual(Object.keys(out).sort(), ["htmlContent", "imagePath", "linkUrl", "name", "placement", "publicId", "sortOrder", "type"]);
  assert.equal(out.imagePath, "https://backend.example/images/img-x.png");
  assert.equal(out.linkUrl, "https://vtcany.vn");
  assert.equal(out.htmlContent, "");
  assert.equal(out.sortOrder, 2);
});

test("adDisplayItem: html chi giu htmlContent; link khong an toan bi loai", () => {
  const html = adDisplayItem({ publicId: "p1", type: "html", htmlContent: "<script>alert(1)</script>", imagePath: "/images/x.png", linkUrl: "https://x.vn", sortOrder: 0 }, resolveImage);
  assert.equal(html.htmlContent, "<script>alert(1)</script>");
  assert.equal(html.imagePath, "");
  assert.equal(html.linkUrl, "");
  const bad = adDisplayItem({ publicId: "p2", type: "image", imagePath: "/images/y.png", linkUrl: "javascript:alert(1)" }, resolveImage);
  assert.equal(bad.linkUrl, "");
  assert.equal(bad.imagePath, "https://backend.example/images/y.png");
});

test("adDisplayItem: type la hoac thieu truong -> null", () => {
  assert.equal(adDisplayItem({ publicId: "p3", type: "video" }, resolveImage), null);
  assert.equal(adDisplayItem({ publicId: "p4" }, resolveImage), null);
  assert.equal(adDisplayItem(null, resolveImage), null);
  assert.equal(adDisplayItem("chuoi", resolveImage), null);
});

test("client ads.js: html KHONG BAO GIO vao DOM qua innerHTML; iframe sandbox dung", () => {
  const src = readFileSync(new URL("../public/js/ads.js", import.meta.url), "utf8");
  assert.ok(!/\.innerHTML\s*=/.test(src), "ads.js khong duoc gan innerHTML");
  assert.ok(src.includes("srcdoc"), "html phai render qua srcdoc");
  // Chi xet gia tri thuoc tinh sandbox thuc te (chu thich co the nhac
  // ten allow-same-origin de giai thich viec KHONG dung no).
  const sandboxAttrs = [...src.matchAll(/setAttribute\("sandbox",\s*"([^"]*)"\)/g)].map((m) => m[1]);
  assert.ok(sandboxAttrs.length > 0, "phai co setAttribute sandbox");
  assert.ok(sandboxAttrs.every((s) => !s.includes("allow-same-origin")), "sandbox KHONG duoc co allow-same-origin");
  assert.ok(sandboxAttrs.some((s) => s.includes("allow-scripts") && s.includes("allow-popups")), "sandbox phai co allow-scripts + allow-popups");
});

test("server.mjs: co route proxy /api/v2/ads", () => {
  const src = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.ok(src.includes('u.pathname === "/api/v2/ads"'), "thieu route /api/v2/ads");
  assert.ok(src.includes("adDisplayItem"), "route phai map qua whitelist adDisplayItem");
});
