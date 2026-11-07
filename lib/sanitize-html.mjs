// Loc HTML chan trang tu CMS (footer.description, Editor Quill) +
// tu dong gan link dien thoai/email vao chu.
// - Chi cho phep the dinh dang co ban: p, br, strong, b, em, i, u, s,
//   a, ul, ol, li, span. Moi the khac bi xoa.
// - The script/style/iframe/object/embed/form/input/button/select/
//   textarea/link/meta/title/base/noscript/template/svg/math/video/
//   audio/img bi xoa CA the lan noi dung con ben trong.
// - The khac (div, h1, table...) chi bi xoa the, giu chu con.
// - Chi giu thuoc tinh href cua <a>, va chi voi http/https/mailto/tel
//   (giai entity so truoc khi kiem scheme de khong bi lua bang
//   javascript: viet dang &#106;...). Moi thuoc tinh khac bi xoa.
// - Xoa comment HTML. Giu nguyen entity (&nbsp;...) trong chu vi
//   Quill da escape san; chu tho khong duoc escape lai.

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "span"]);
// The co the chua chu con doc hai (script, style...) hoac khong co chu
// con dang ke (img, input...): xoa ca khoi. The void trong nhom nay
// (img, input, link, meta, base, embed) khong co the dong nen khong
// dem do sau.
const DROP_ENTIRE = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "button", "select", "textarea", "link", "meta", "title", "base", "noscript", "template", "svg", "math", "video", "audio", "img"]);
const DROP_VOID = new Set(["img", "input", "link", "meta", "base", "embed"]);

const TAG_RE = /<!--[\s\S]*?-->|<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)?\/?>/g;

// "<" lac trong chu thuong ma co the bi trinh duyet doc thanh the
// (vd <a href="... mo ngoac khong dong) thi escape de no chi la chu.
function escapeStrayLt(s) {
  return s.replace(/<(?=[a-zA-Z/!])/g, "&lt;");
}

function parseTag(token) {
  const m = token.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const closing = token[1] === "/";
  const selfClosing = /\/\s*>$/.test(token);
  let attrPart = token.slice(m[0].length, token.length - 1);
  if (selfClosing) attrPart = attrPart.replace(/\/\s*$/, "");
  return { name, closing, selfClosing, attrPart: attrPart || "" };
}

function getHref(attrPart) {
  const m = attrPart.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  if (!m) return null;
  return m[1] !== undefined ? m[1] : (m[2] !== undefined ? m[2] : m[3]);
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Chi chap nhan http/https/mailto/tel. Tra "" khi scheme khac, khong
// co scheme (link tuong doi), hoac khong co href.
function cleanHref(raw) {
  if (raw == null) return "";
  let v = String(raw).trim();
  // Giai entity so truoc khi kiem scheme.
  v = v
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
  v = v.replace(/[\u0000-\u0020]+/g, "");
  const m = v.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (!m) return "";
  const scheme = m[1].toLowerCase();
  if (scheme !== "http" && scheme !== "https" && scheme !== "mailto" && scheme !== "tel") return "";
  return v;
}

// Cat comment mo khong co dong (<!-- ... het chuoi): trinh duyet se
// coi phan con lai la comment, nen cat bo luon cho chac.
function dropUnterminatedComment(src) {
  let out = src;
  let pos = 0;
  for (;;) {
    const ci = out.indexOf("<!--", pos);
    if (ci < 0) return out;
    const end = out.indexOf("-->", ci + 4);
    if (end < 0) return out.slice(0, ci);
    pos = end + 3;
  }
}

export function sanitizeFooterHtml(html) {
  let src = dropUnterminatedComment(String(html ?? ""));
  let out = "";
  let last = 0;
  let dropDepth = 0;
  let dropTag = "";
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(src)) !== null) {
    const token = m[0];
    if (dropDepth === 0) out += escapeStrayLt(src.slice(last, m.index));
    last = m.index + token.length;
    if (token.startsWith("<!--")) continue; // xoa comment
    const tag = parseTag(token);
    if (!tag) {
      if (dropDepth === 0) out += token;
      continue;
    }
    if (dropDepth > 0) {
      // Dang o trong the bi xoa ca khoi: chi dem do sau cua cung ten the.
      if (tag.name === dropTag) {
        if (tag.closing) dropDepth -= 1;
        else if (!tag.selfClosing) dropDepth += 1;
      }
      continue;
    }
    if (DROP_ENTIRE.has(tag.name)) {
      if (!tag.closing && !tag.selfClosing && !DROP_VOID.has(tag.name)) {
        dropDepth = 1;
        dropTag = tag.name;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(tag.name)) continue; // xoa the, giu chu con
    if (tag.closing) {
      out += `</${tag.name}>`;
      continue;
    }
    if (tag.name === "br") {
      out += "<br>";
      continue;
    }
    if (tag.name === "a") {
      const href = cleanHref(getHref(tag.attrPart));
      out += href ? `<a href="${escapeAttr(href)}">` : "<a>";
      continue;
    }
    out += `<${tag.name}>`;
  }
  if (dropDepth === 0) out += escapeStrayLt(src.slice(last));
  return out;
}

// ---- Tu dong gan link dien thoai/email (chi trong chu thuong) ----

// So VN: +84..., (0xxx)..., 0xxx... (co hoac khong co dau cach/cham/
// gach — ke ca &nbsp; vi Quill hay chen &nbsp; giua ma vung va so).
// Khong khop nam/thang hay so giay phep (khong bat dau bang 0, hoac co dau /).
const SEP = "(?:\\s|&nbsp;)*";
const SEP1 = "(?:\\s|&nbsp;)?";
const PHONE_RE = new RegExp(
  "(?:\\+84" + SEP1 + "\\d{2,3}" + SEP1 + "\\d{3,4}" + SEP1 + "\\d{3,4}" +
  "|\\(0\\d{2,3}\\)" + SEP + "\\d(?:[\\d\\s.-]|&nbsp;){5,9}\\d" +
  "|\\b0\\d{2,3}" + SEP1 + "\\d{3,4}" + SEP1 + "\\d{3,4}\\b)",
  "g"
);
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

function phoneToTel(display) {
  const d = String(display).replace(/[^\d+]/g, "");
  if (d.startsWith("+84")) return "tel:" + d;
  if (d.startsWith("84")) return "tel:+84" + d.slice(2);
  if (d.startsWith("0")) return "tel:+84" + d.slice(1);
  return "";
}

function linkifyEmails(text) {
  EMAIL_RE.lastIndex = 0;
  return text.replace(EMAIL_RE, (em) => `<a href="mailto:${em}">${em}</a>`);
}

function linkifyText(text) {
  // Chu da loc san chi con entity + ky tu thuong: escape < > lac
  // (neu co) de khong tao the moi; giu nguyen &nbsp; &amp; ...
  const escLtGt = (s) => s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const parts = [];
  let last = 0;
  PHONE_RE.lastIndex = 0;
  let m;
  while ((m = PHONE_RE.exec(text)) !== null) {
    parts.push({ phone: false, s: text.slice(last, m.index) });
    parts.push({ phone: true, s: m[0] });
    last = m.index + m[0].length;
  }
  parts.push({ phone: false, s: text.slice(last) });
  return parts
    .map((p) => {
      if (p.phone) {
        const tel = phoneToTel(p.s);
        return tel ? `<a href="${tel}">${escLtGt(p.s)}</a>` : escLtGt(p.s);
      }
      return linkifyEmails(escLtGt(p.s));
    })
    .join("");
}

// Gan link dien thoai/email vao cac doan chu KHONG nam trong the <a>
// (khong gan lai link da co, khong dung vao thuoc tinh href).
export function linkifyFooterHtml(html) {
  const src = String(html ?? "");
  let out = "";
  let last = 0;
  let aDepth = 0;
  TAG_RE.lastIndex = 0;
  let m;
  while ((m = TAG_RE.exec(src)) !== null) {
    const token = m[0];
    const text = src.slice(last, m.index);
    if (text) out += aDepth > 0 ? text : linkifyText(text);
    last = m.index + token.length;
    out += token;
    if (!token.startsWith("<!--")) {
      const tag = parseTag(token);
      if (tag && tag.name === "a") {
        if (tag.closing) aDepth = Math.max(0, aDepth - 1);
        else if (!tag.selfClosing) aDepth += 1;
      }
    }
  }
  const tail = src.slice(last);
  if (tail) out += aDepth > 0 ? tail : linkifyText(tail);
  return out;
}

// Cot trai chan trang: text thuong (CMS Textarea), xuong dong -> <p>.
export function renderFooterCopyright(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  const esc = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return linkifyFooterHtml(lines.map((l) => `<p>${esc(l)}</p>`).join(""));
}

// Quill chen &nbsp; giua moi tu (vd "TỔNG&nbsp;BIÊN&nbsp;TẬP:") nen moi <p>
// thanh 1 dong khong the ngat: tren dien thoai dong dai tran khoi man
// hinh, ma chan trang mobile lai can giua nen chu bi cat ca 2 ben
// (anh user gui 2026-11-07). Doi &nbsp; thanh khoang trang thuong de
// dong xuong dong binh thuong, TRU ben trong the <a> (so dien thoai
// giu nguyen 1 khoi, khong tach giua ma vung va so).
function unwrapNbspOutsideLinks(html) {
  return String(html ?? "")
    .split(/(<a\b[^>]*>[\s\S]*?<\/a>)/gi)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/&nbsp;|&#160;|&#xa0;/gi, " ")))
    .join("");
}

// Cot phai chan trang: HTML Quill -> loc + gan link. Tra "" khi khong
// con chu hien thi (vd Editor rong "<p><br></p>").
export function renderFooterDescription(html) {
  const clean = linkifyFooterHtml(sanitizeFooterHtml(html));
  const visible = clean
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
  if (!visible) return "";
  return unwrapNbspOutsideLinks(clean);
}
