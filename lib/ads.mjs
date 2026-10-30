// Pure helpers cho hien thi quang cao tren portal (goi tiep noi 2B,
// kieu 1E). Khong import gi: server.mjs import nhu lib/vtcany.mjs.
// API cong khai cua backend (GET /api/v1/ads) chi tra quang cao dang
// chay (da xuat ban + trong lich), nhung TSHT van doi hinh dang qua
// whitelist rieng de khong bao gio lo truong noi bo ra trinh duyet.

// Placement la khoa chuoi tu do phia backend, nhung proxy chi chap
// nhan dang an toan: chu cai/so/gach ngang/gach duoi, toi da 64 ky tu.
// Tra "" khi khong truyen placement, null khi placement khong hop le.
export function sanitizePlacement(raw) {
  if (raw === null || raw === undefined || raw === "") return "";
  const s = String(raw).trim();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(s)) return null;
  return s;
}

// Chi boc <a> khi link bat dau bang http:// hoac https:// (sau trim,
// khong phan biet hoa thuong). Moi dang khac — javascript:, data:,
// vbscript:, duong dan tuong doi, protocol-relative //... — deu khong
// duoc boc link (anh van hien, khong bam duoc).
export function isSafeLinkUrl(u) {
  if (typeof u !== "string") return false;
  return /^https?:\/\//i.test(u.trim());
}

// Whitelist truong hien thi cho mot quang cao tu API cong khai.
// - Chi giu: publicId, name, placement, type, imagePath, linkUrl,
//   htmlContent, sortOrder. Moi truong noi bo (id, status, createdBy,
//   workflowStep, publishAt, approvals...) deu bi loai.
// - type la: chi "image" hoac "html" duoc chap nhan; type la -> null
//   (khong render kieu khong biet).
// - image: giu imagePath (da ghep origin backend qua resolveImage),
//   giu linkUrl CHI khi an toan, htmlContent rong.
// - html: giu htmlContent, imagePath/linkUrl rong (phia hien thi PHAI
//   nhung trong iframe sandbox, xem public/js/ads.js).
export function adDisplayItem(it, resolveImage) {
  if (!it || typeof it !== "object") return null;
  if (it.type !== "image" && it.type !== "html") return null;
  const type = it.type;
  return {
    publicId: it.publicId || null,
    name: it.name || "",
    placement: it.placement || "",
    type,
    imagePath: type === "image" && it.imagePath ? resolveImage(it.imagePath) : "",
    linkUrl: type === "image" && isSafeLinkUrl(it.linkUrl) ? it.linkUrl.trim() : "",
    htmlContent: type === "html" ? (it.htmlContent || "") : "",
    sortOrder: Number.isFinite(Number(it.sortOrder)) ? Number(it.sortOrder) : 0,
  };
}
