// Cache ngan playlist timeshift (chi RAM server, mat khi restart).
//
// Duong xem lai (tv.js onReplay) fetch cung URL /api/v1/timeshift 2
// lan cho moi cu bam: 1 lan kiem tra truoc (de chac co ban ghi moi
// dung live), roi hls.js loadSource tai lai de phat. Server dung lai
// playlist tu dau ca 2 lan (VTCANY/AIO + stitch, khong cache) nen
// mat ~10s moi co hinh chuyen dong dau tien. Cache nay giu playlist
// vua dung theo khoa channel+start+end (TTL 60s) de lan fetch thu
// hai lay tu RAM thay vi dung lai.
//
// GIOI HAN (ghi ro de khong hieu lam):
// - Chi cache playlist THANH CONG (200). Loi (404/400/502) khong
//   bao gio vao cache: ban ghi thieu van phai thieu, loi thoang qua
//   lan sau phai dung lai. Server.mjs chi goi set() tren duong 200.
// - Client van nhan Cache-Control: no-store (cache chi o server).
// - Khoa dung end DA CLAMP ve now (gio ket thuc chuong trinh da phat
//   thi bang chinh end goc, on dinh giua 2 lan fetch).
// - Toi da 200 muc, muc cu nhat bi xoa khi vuot (Map giu thu tu chen).
export const TIMESHIFT_CACHE_TTL_MS = 60 * 1000;
export const TIMESHIFT_CACHE_MAX = 200;

export function timeshiftCacheKey(channel, startIso, endIso) {
  return String(channel || "").toUpperCase() + "|" + String(startIso || "") + "|" + String(endIso || "");
}

export function createTimeshiftCache({ ttlMs = TIMESHIFT_CACHE_TTL_MS, max = TIMESHIFT_CACHE_MAX, now = () => Date.now() } = {}) {
  const store = new Map(); // key -> { playlist, at }
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return null;
      if (now() - hit.at > ttlMs) {
        store.delete(key);
        return null;
      }
      return hit.playlist;
    },
    set(key, playlist) {
      if (typeof playlist !== "string" || !playlist) return;
      store.set(key, { playlist, at: now() });
      if (store.size > max) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
    },
    clear() {
      store.clear();
    },
    size() {
      return store.size;
    },
  };
}
