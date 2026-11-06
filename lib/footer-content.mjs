// Noi dung chan trang portal (mau bao Dien Bien Phu) — 1 cho duy nhat
// cho NOI DUNG DU PHONG. Noi dung chinh lay tu CMS (Quan ly giao dien
// > Footer: footer.description/copyright) qua renderFooterFromCms;
// khi CMS loi/trong thi dung FOOTER_CONTENT nay de chan trang khong
// bao gio trong. Logo lay tu CMS (footer.logo) qua header.js, khong
// nam o day.
import { renderFooterCopyright, renderFooterDescription } from "./sanitize-html.mjs";
export const FOOTER_CONTENT = {
  license: [
    "Giấy phép hoạt động số: 725/GP-BTTTT do Bộ Thông tin và Truyền thông cấp ngày 09/11/2021",
    "© Bản quyền thuộc về Báo và Phát thanh, Truyền hình Điện Biên.",
    "Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản.",
  ],
  editorInChief: "VŨ VĂN THƯỢNG",
  deputyEditors: ["TRẦN VĂN TOẠI", "NGUYỄN THỊ TƯƠI", "ĐẶNG HẢI TRIỀU", "NGUYỄN HÙNG CƯỜNG"],
  phones: [
    { display: "(0215)3824624", tel: "+842153824624" },
    { display: "(0215) 3835300", tel: "+842153835300" },
    { display: "(0215) 3825357", tel: "+842153825357" },
  ],
  email: "baodientudbp@gmail.com",
  addressMain: "Số 829, đường Võ Nguyên Giáp, phường Điện Biên Phủ, tỉnh Điện Biên",
  addressSecond: "Số 27A, đường Quyết Tiến, phường Điện Biên Phủ, tỉnh Điện Biên.",
};

function escHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Cot trai chan trang: giay phep + ban quyen (dung 3 dong theo mau).
export function renderFooterLicense(content = FOOTER_CONTENT) {
  return (content.license || []).map((line) => `<p>${escHtml(line)}</p>`).join("");
}

// Cot phai chan trang: ban bien tap + lien he. So dien thoai va email
// la link bam duoc (tel: / mailto:) de goi / gui thu ngay tren dien thoai.
export function renderFooterContact(content = FOOTER_CONTENT) {
  const phones = (content.phones || [])
    .map((p) => `<a href="tel:${escHtml(p.tel)}">${escHtml(p.display)}</a>`)
    .join("; ");
  return [
    `<p>TỔNG BIÊN TẬP: ${escHtml(content.editorInChief)}</p>`,
    `<p>PHÓ TỔNG BIÊN TẬP: ${(content.deputyEditors || []).map(escHtml).join(", ")}</p>`,
    `<p>Điện thoại: ${phones}</p>`,
    `<p>Email: <a href="mailto:${escHtml(content.email)}">${escHtml(content.email)}</a></p>`,
    `<p>Trụ sở chính: ${escHtml(content.addressMain)}</p>`,
    `<p>Cơ sở 2: ${escHtml(content.addressSecond)}</p>`,
  ].join("");
}

// Chen noi dung cau hinh vao partial chan trang (public/partials/
// footer.html): thay 2 token <!-- @FOOTER_LICENSE --> va
// <!-- @FOOTER_CONTACT --> bang HTML da render. Partial giu nguyen
// khung + logo + nut Ve dau trang.
export function renderFooter(partial, content = FOOTER_CONTENT) {
  return String(partial ?? "")
    .replace("<!-- @FOOTER_LICENSE -->", renderFooterLicense(content))
    .replace("<!-- @FOOTER_CONTACT -->", renderFooterContact(content));
}

// Chen noi dung chan trang tu CMS vao partial: cot trai = copyright
// CMS (text thuong, xuong dong -> <p>), cot phai = description CMS
// (HTML Quill da loc + tu gan link tel:/mailto:). Cot nao trong thi
// dung noi dung mac dinh FOOTER_CONTENT cua cot do.
export function renderFooterFromCms(partial, cmsFooter) {
  const cms = cmsFooter || {};
  const license = renderFooterCopyright(cms.copyright);
  const contact = renderFooterDescription(cms.description);
  return String(partial ?? "")
    .replace("<!-- @FOOTER_LICENSE -->", license || renderFooterLicense(FOOTER_CONTENT))
    .replace("<!-- @FOOTER_CONTACT -->", contact || renderFooterContact(FOOTER_CONTENT));
}
