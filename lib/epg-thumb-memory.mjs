// Bo nho chong ghi de anh dai dien chuong trinh EPG (chi RAM server,
// khong DB, khong migration, khong tai anh ve).
//
// AIO chi gan thumbnail/thumbnailSmall cho chuong trinh ~1-2 phut SAU khi
// chuong trinh ket thuc, va anh co the tra rong tam thoi o lan fetch sau
// (vd cache AIO chap chon). Neu tra thang gia tri rong ve frontend thi
// the vua hien anh se mat anh. Bo nho nay giu moi thumbnail khac rong
// tung nhan duoc, theo khoa (kenh, startTime), va dien lai khi lan fetch
// moi tra rong cho cung chuong trinh.
//
// GIOI HAN (ghi ro de khong hieu lam):
// - Mat khi restart server: chap nhan duoc vi URL anh AIO la co dinh,
//   khong het han — lan fetch sau AIO tra lai anh va bo nho day lai.
// - Chi nho toi da 1000 muc, muc qua 3 ngay tu xoa (ban xem lai chi song
//   ~2 ngay nen chuong trinh cu hon khong bao gio render lai).
// - Khong bao gio ghi de anh moi khac rong bang anh cu: chi dien vao cho
//   trong, anh moi ve luon thang.
export const EPG_THUMB_MEMORY_TTL_MS = 3 * 24 * 3600 * 1000;
export const EPG_THUMB_MEMORY_MAX = 1000;

export function createThumbMemoryStore() {
  return new Map();
}

function thumbKey(channelName, startTime) {
  return `${String(channelName || "")}|||${String(startTime || "")}`;
}

function nonEmptyString(v) {
  return typeof v === "string" && v !== "" ? v : "";
}

// Gop anh tu bo nho vao danh sach vua fetch, roi cap nhat bo nho tu
// danh sach da gop. Tra ve chinh mang items (sua tai cho).
export function mergeThumbMemory(store, channelName, items) {
  if (!store || !Array.isArray(items)) return items;
  const now = Date.now();
  // Don muc qua han (lazy, moi lan gop).
  for (const [k, v] of store) {
    if (!v || now - (v.at || 0) > EPG_THUMB_MEMORY_TTL_MS) store.delete(k);
  }
  for (const p of items) {
    if (!p || !p.startTime) continue;
    const key = thumbKey(channelName, p.startTime);
    const mem = store.get(key);
    // Chi dien vao cho trong, khong ghi de anh moi.
    if (mem) {
      if (!nonEmptyString(p.thumbnail) && mem.thumbnail) p.thumbnail = mem.thumbnail;
      if (!nonEmptyString(p.thumbnailSmall) && mem.thumbnailSmall) p.thumbnailSmall = mem.thumbnailSmall;
    }
    // Nho anh vua thay (ca anh moi lan nay va anh vua dien tu bo nho).
    const thumb = nonEmptyString(p.thumbnail);
    const small = nonEmptyString(p.thumbnailSmall);
    if (thumb || small) {
      store.set(key, { thumbnail: thumb, thumbnailSmall: small, at: now });
      if (store.size > EPG_THUMB_MEMORY_MAX) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    }
  }
  return items;
}
