// Goi 1D — SEO: meta bai viet, sitemap, robots. Toan ham thuan, khong doc
// file/khong goi backend, de test bang node --test. Phia server (server.mjs)
// chi goi cac ham nay + fetch du lieu tu backend qua proxy san co.

// Escape cho ca noi dung the lan gia tri thuoc tinh (title, description,
// canonical, og:*). Khong dung cho URL nguyen (loc URL nam o buildSitemapXml).
export function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Mo ta meta: sapo gom khoang trang, cat 160 ky tu, uu tien cat o khoang
// trang cuoi truoc gioi han de khong dut nua tu (khong cat nua tu neu tu
// dai hon gioi han thi cat cung).
export function truncateDescription(sapo, max = 160) {
  const t = String(sapo ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max / 2 ? cut.slice(0, sp) : cut).trim();
}

// Origin cong khai cho canonical/OG/sitemap: uu tien env PUBLIC_ORIGIN
// (neu Coolify dat), neu khong lay Host header (site chay sau Cloudflare,
// luon HTTPS), cuoi cung mac dinh ve domain chinh.
export function publicOrigin(headers, envOrigin) {
  if (envOrigin) return String(envOrigin).replace(/\/+$/, '');
  const host = headers && headers.host ? String(headers.host).split(':')[0] : '';
  return host ? `https://${host}` : 'https://tsht.vtctech.xyz';
}

// The meta cho trang bai viet: title, description, canonical, Open Graph
// (type article, url, image neu co bia, published_time, section). Tra ve
// chuoi the HTML, de server.mjs chen vao <head> cua article.html.
export function buildArticleMeta({ title, sapo, coverUrl, categoryName, publishAt, canonicalUrl }) {
  const desc = truncateDescription(sapo);
  const tags = [];
  tags.push(`<meta name="description" content="${escapeXml(desc)}">`);
  if (canonicalUrl) tags.push(`<link rel="canonical" href="${escapeXml(canonicalUrl)}">`);
  tags.push(`<meta property="og:type" content="article">`);
  tags.push(`<meta property="og:title" content="${escapeXml(title)}">`);
  if (desc) tags.push(`<meta property="og:description" content="${escapeXml(desc)}">`);
  if (canonicalUrl) tags.push(`<meta property="og:url" content="${escapeXml(canonicalUrl)}">`);
  if (coverUrl) tags.push(`<meta property="og:image" content="${escapeXml(coverUrl)}">`);
  if (categoryName) tags.push(`<meta property="article:section" content="${escapeXml(categoryName)}">`);
  if (publishAt) tags.push(`<meta property="article:published_time" content="${escapeXml(publishAt)}">`);
  return tags.join('\n');
}

// Sitemap XML: urls = [{ loc, lastmod? }]. lastmod dang YYYY-MM-DD (cat
// gio neu truyen ISO day du). Loc URL khong hop le (khong bat dau http)
// bi bo qua de sitemap khong bao gio chua URL rac.
export function buildSitemapXml(urls) {
  const out = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'];
  const seen = new Set();
  for (const u of urls || []) {
    if (!u || typeof u.loc !== 'string' || !/^https?:\/\//.test(u.loc) || seen.has(u.loc)) continue;
    seen.add(u.loc);
    out.push('  <url>');
    out.push(`    <loc>${escapeXml(u.loc)}</loc>`);
    if (u.lastmod) out.push(`    <lastmod>${escapeXml(String(u.lastmod).slice(0, 10))}</lastmod>`);
    out.push('  </url>');
  }
  out.push('</urlset>');
  return out.join('\n');
}

// robots.txt: cho phep tat ca, chi ve sitemap dong cua chinh site.
export function buildRobotsTxt(siteUrl) {
  return `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
}

// Lam phang cay chuyen muc hien cua backend ({ slug, children[] }) thanh
// danh sach slug, giu thu tu hien thi (cha truoc, con theo sau).
export function flattenCategorySlugs(tree) {
  const out = [];
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n && n.slug) out.push(n.slug);
      walk(n.children);
    }
  };
  walk(tree);
  return out;
}
