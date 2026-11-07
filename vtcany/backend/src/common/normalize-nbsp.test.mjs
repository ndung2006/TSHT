// Test cho normalize-nbsp.ts — chuan hoa khoang trang khong ngat dong
// (&nbsp; / U+00A0) thanh khoang trang thuong ngay khi LUU noi dung
// Quill, tru ben trong so dien thoai va giua so voi don vi (giu nguyen
// khong ngat de cum so + don vi thanh 1 khoi).
//
// Chay: node --test --import=./test-hooks-register.mjs \
//        src/common/normalize-nbsp.test.mjs   (tu vtcany/backend)

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeNbspForSave,
  normalizeNbspFields,
  NBSP_KEPT_UNITS,
} from './normalize-nbsp.ts';
// Cung mau nhan dien so nhu portal (lib/sanitize-html.mjs): sau khi
// chuan hoa, so dien thoai van phai duoc PHONE_RE nhan ra. PHONE_RE la
// bien noi bo cua lib nen test qua API cong khai linkifyFooterHtml:
// so phai duoc gan thanh link tel:.
import { linkifyFooterHtml } from '../../../../lib/sanitize-html.mjs';

test('doi &nbsp; / &#160; / &#xa0; / ky tu U+00A0 thanh khoang trang thuong', () => {
  assert.equal(normalizeNbspForSave('TỔNG\u00A0BIÊN\u00A0TẬP'), 'TỔNG BIÊN TẬP');
  assert.equal(normalizeNbspForSave('TỔNG&nbsp;BIÊN&nbsp;TẬP'), 'TỔNG BIÊN TẬP');
  assert.equal(normalizeNbspForSave('a&#160;b&#xa0;c'), 'a b c');
  assert.equal(normalizeNbspForSave('a&NBSP;b'), 'a b');
  assert.equal(normalizeNbspForSave('a&nbsp;&nbsp;b'), 'a  b'); // khong gop khoang trang
});

test('khong doi gi khac: &amp;nbsp; (escape kep), dau tieng Viet, the HTML', () => {
  assert.equal(normalizeNbspForSave('&amp;nbsp;'), '&amp;nbsp;');
  assert.equal(normalizeNbspForSave('không có gì lạ'), 'không có gì lạ');
  assert.equal(normalizeNbspForSave('<p class="x">a</p>'), '<p class="x">a</p>');
  assert.equal(normalizeNbspForSave(''), '');
  assert.equal(normalizeNbspForSave(null), null);
  assert.equal(normalizeNbspForSave(undefined), undefined);
});

test('khong dung vao thuoc tinh the HTML', () => {
  assert.equal(
    normalizeNbspForSave('<img src="a&nbsp;b.jpg" alt="x">'),
    '<img src="a&nbsp;b.jpg" alt="x">',
  );
});

test('mo ta footer Quill: &nbsp; giua moi tu -> khoang trang, so dien thoai giu nguyen 1 khoi', () => {
  const input =
    '<p>TỔNG&nbsp;BIÊN&nbsp;TẬP:&nbsp;VŨ&nbsp;VĂN&nbsp;THƯỢNG</p>' +
    '<p>Điện thoại:&nbsp;0215&nbsp;3824624</p>';
  const expected =
    '<p>TỔNG BIÊN TẬP: VŨ VĂN THƯỢNG</p>' +
    '<p>Điện thoại: 0215\u00A03824624</p>';
  assert.equal(normalizeNbspForSave(input), expected);
});

test('so dien thoai: doi entity &nbsp; thanh ky tu U+00A0, giu nguyen khong ngat', () => {
  assert.equal(
    normalizeNbspForSave('Gọi +84&nbsp;912&nbsp;345&nbsp;678 nhé'),
    'Gọi +84\u00A0912\u00A0345\u00A0678 nhé',
  );
  assert.equal(
    normalizeNbspForSave('0901&nbsp;234&nbsp;567'),
    '0901\u00A0234\u00A0567',
  );
  assert.equal(
    normalizeNbspForSave('(0215)&nbsp;3824624'),
    '(0215)\u00A03824624',
  );
  // Khoang trang thuong trong so dien thoai: giu nguyen (khong them &nbsp; moi)
  assert.equal(normalizeNbspForSave('0215 3824624'), '0215 3824624');
  // So trong the <a> tel: van duoc bao ve
  assert.equal(
    normalizeNbspForSave('<a href="tel:02153824624">0215&nbsp;382&nbsp;4624</a>'),
    '<a href="tel:02153824624">0215\u00A0382\u00A04624</a>',
  );
});

test('so + don vi: giu nguyen khong ngat (entity -> ky tu U+00A0)', () => {
  assert.equal(normalizeNbspForSave('5&nbsp;kg'), '5\u00A0kg');
  assert.equal(normalizeNbspForSave('2,5&nbsp;kg gạo'), '2,5\u00A0kg gạo');
  assert.equal(normalizeNbspForSave('100&nbsp;km'), '100\u00A0km');
  assert.equal(normalizeNbspForSave('25&nbsp;%'), '25\u00A0%');
  assert.equal(normalizeNbspForSave('37,5&nbsp;°C'), '37,5\u00A0°C');
  assert.equal(normalizeNbspForSave('1.000&nbsp;đồng'), '1.000\u00A0đồng');
  assert.equal(normalizeNbspForSave('5&nbsp;m'), '5\u00A0m');
  assert.equal(normalizeNbspForSave('Diện tích 12&nbsp;m²'), 'Diện tích 12\u00A0m²');
  assert.equal(normalizeNbspForSave('Tốc độ 60&nbsp;km/h'), 'Tốc độ 60\u00A0km/h');
});

test('so + tu KHONG phai don vi: van doi thanh khoang trang thuong', () => {
  assert.equal(normalizeNbspForSave('5&nbsp;mới'), '5 mới');
  assert.equal(normalizeNbspForSave('100&nbsp;người'), '100 người');
  assert.equal(normalizeNbspForSave('3&nbsp;lần'), '3 lần');
  assert.equal(normalizeNbspForSave('5&nbsp;kg và 10&nbsp;người'), '5\u00A0kg và 10 người');
  // Khoang trang thuong giua so va don vi: khong them &nbsp; moi
  assert.equal(normalizeNbspForSave('5 kg'), '5 kg');
});

test('danh sach don vi giu lai co cac don vi pho bien', () => {
  for (const u of ['kg', 'g', 'km', 'm', 'cm', 'mm', 'ha', '%', '°C', 'm²', 'km/h', 'đồng', 'tỷ', 'triệu', 'l', 'ml']) {
    assert.ok(NBSP_KEPT_UNITS.includes(u), `thieu don vi ${u}`);
  }
});

test('sau khi chuan hoa, portal van gan link tel: cho so dien thoai', () => {
  const cases = [
    ['0215\u00A03824624', 'tel:+842153824624'],
    ['+84\u00A0912\u00A0345\u00A0678', 'tel:+84912345678'],
    ['0901\u00A0234\u00A0567', 'tel:+84901234567'],
    ['(0215)\u00A03824624', 'tel:+842153824624'],
    ['0215\u00A0382\u00A04624', 'tel:+842153824624'],
  ];
  for (const [phone, href] of cases) {
    const out = linkifyFooterHtml(`Điện thoại: ${phone}`);
    assert.ok(
      out.includes(`<a href="${href}">${phone}</a>`),
      `khong gan link ${href} cho ${JSON.stringify(phone)} — duoc: ${out}`,
    );
  }
  // Va ca dang goc (&nbsp;) cung duoc gan link — hanh vi hien tai cua portal
  const orig = linkifyFooterHtml('Điện thoại: 0215&nbsp;3824624');
  assert.ok(orig.includes('href="tel:+842153824624"'), `dang goc khong gan link: ${orig}`);
  // Email van duoc gan mailto: sau khi chuan hoa
  const mail = linkifyFooterHtml(normalizeNbspForSave('Liên hệ&nbsp;abc@xyz.vn'));
  assert.ok(mail.includes('<a href="mailto:abc@xyz.vn">abc@xyz.vn</a>'), mail);
});

test('normalizeNbspFields: chi chuan hoa cac truong da liet ke, bo qua undefined/null', () => {
  const obj = {
    title: 'a&nbsp;b',
    sapo: undefined,
    body: null,
    other: 'c&nbsp;d',
  };
  const out = normalizeNbspFields(obj, ['title', 'sapo', 'body']);
  assert.equal(out, obj); // sua tai cho, tra ve cung doi tuong
  assert.equal(obj.title, 'a b');
  assert.equal(obj.sapo, undefined);
  assert.equal(obj.body, null);
  assert.equal(obj.other, 'c&nbsp;d');
});
