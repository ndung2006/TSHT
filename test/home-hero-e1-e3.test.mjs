// Test E1 (srcset anh bia) + E3 (tieu de "Tin nổi bật") — pin o muc source.
// home.js/article.js render bang innerHTML string nen khong co harness
// stub-DOM (giong B2: thumb-fallback.test.mjs pin o muc source).
// Run: node --test test/home-hero-e1-e3.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const homeJs = fs.readFileSync(path.join(root, "public/js/home.js"), "utf8");
const articleJs = fs.readFileSync(path.join(root, "public/js/article.js"), "utf8");
const homeCss = fs.readFileSync(path.join(root, "public/css/home.css"), "utf8");
const homeHtml = fs.readFileSync(path.join(root, "public/home.html"), "utf8");
const articleHtml = fs.readFileSync(path.join(root, "public/article.html"), "utf8");
const server = fs.readFileSync(path.join(root, "server.mjs"), "utf8");

test("E3: tieu de 'Tin nổi bật' ngay truoc .hero-left trong renderHeroBlock", () => {
  // Trong source home.js, dau " duoc escape (\") vi chuoi dung ".
  assert.ok(homeJs.includes('<div class=\\"hero-left-title\\"><h2>Tin nổi bật</h2></div>'), "thieu div hero-left-title");
  const titleIdx = homeJs.indexOf("hero-left-title");
  const leftIdx = homeJs.indexOf('<div class=\\"hero-left\\">', titleIdx);
  assert.ok(titleIdx > 0 && leftIdx > titleIdx, "tieu de phai dung ngay truoc .hero-left");
  // E3 khong them link "Xem thêm" cho khoi Noi bat (link Xem thêm cua
  // khoi chuyen muc catBlockHtml la co san, khong tinh).
  const heroHtml = homeJs.slice(titleIdx, homeJs.indexOf("hero-center", titleIdx));
  assert.ok(!heroHtml.includes("Xem thêm"), "khoi hero khong duoc co link Xem thêm");
});

test("E3: home.css ha .hero-left 639->592px, .hero-scroll top 47px, them .hero-left-title", () => {
  assert.ok(homeCss.includes(".hero-left-title { border-bottom: 2px solid #c00;"), "thieu .hero-left-title");
  assert.ok(homeCss.includes(".hero-left-title h2 { margin: 0; border-left: 4px solid #c00;"), "thieu .hero-left-title h2");
  assert.ok(homeCss.includes("height: 592px;"), ".hero-left phai la 592px");
  assert.ok(!/\.hero-left \{[^}]*height: 639px/.test(homeCss), ".hero-left khong duoc con 639px");
  assert.ok(homeCss.includes(".hero-scroll { position: absolute; top: 47px;"), ".hero-scroll phai top 47px");
});

test("E1: home.js imgTag dung srcset + sizes; hero dau eager (fetchpriority, khong lazy)", () => {
  assert.ok(homeJs.includes("function imgTag(it, sizes, eager)"), "thieu helper imgTag");
  assert.ok(homeJs.includes('srcset=\\"'), "imgTag phai co srcset");
  assert.ok(homeJs.includes('fetchpriority=\\"high\\"'), "anh hero dau phai co fetchpriority high");
  assert.ok(homeJs.includes('imgTag(hero, "(max-width: 900px) 100vw, 640px", true)'), "hero center phai eager + sizes 640px");
  assert.ok(homeJs.includes('imgTag(it, "200px")'), "the nho cot trai/phai phai co sizes 200px");
  assert.ok(homeJs.includes('imgTag(feat, "(max-width: 900px) 100vw, 600px")'), "bai lon khoi chuyen muc phai co sizes 600px");
  assert.ok(homeJs.includes('imgTag(it, "300px")'), "hang khoi chuyen muc phai co sizes 300px");
  // Anh hero dau khong con loading=lazy (chi 1 anh hero, cac anh khac van lazy qua imgTag).
  assert.ok(!homeJs.includes('<img src=\\" + esc(hero.cover)'), "hero center khong duoc render img tho khong srcset");
});

test("E1: article.js bia trang doc + the lien quan dung srcset", () => {
  assert.ok(articleJs.includes("function coverImg(it, cls, sizes, lazy)"), "thieu helper coverImg");
  assert.ok(articleJs.includes('coverImg(it, "article-cover", "(max-width: 900px) 100vw, 800px", false)'), "bia trang doc phai co srcset sizes 800px, khong lazy");
  assert.ok(articleJs.includes('coverImg(it, "", "300px", true)'), "the lien quan phai co srcset sizes 300px, lazy");
});

test("E1: server.mjs proxy coverSrcset qua resolveSrcset (ghep origin backend)", () => {
  assert.ok(server.includes("function resolveSrcset(ss)"), "thieu helper resolveSrcset");
  assert.ok(server.includes("coverSrcset: resolveSrcset(it.coverSrcset)"), "newsListItem phai tra coverSrcset da resolve");
});

test("E1+E3: bump ?v= (home.css 20261107-3, home.js 20261107-5, article.js 20261108-1)", () => {
  assert.ok(homeHtml.includes("/css/home.css?v=20261107-3"), "home.css ?v= phai la 20261107-3");
  assert.ok(homeHtml.includes("/js/home.js?v=20261107-5"), "home.js ?v= phai la 20261107-5");
  assert.ok(articleHtml.includes("/js/article.js?v=20261108-1"), "article.js ?v= phai la 20261108-1");
});
