// Parse + hang so cho POST /internal/cleanup-stale-chunks (worker don chunk
// do dang >24h, GĐ3 Buoc 0 / B1): worker quet dia, gui { op: 'fail', ids } —
// backend chi doi trang thai DB, khong tu quet dia (khong can op 'list':
// worker da biet chinh xac id nao vua don tu dia; backend khong biet mtime
// chunk). Chi 1 op 'fail' thay vi cap list/fail nhu
// /internal/cleanup-old-comment-meta — vi ben do backend can loc theo
// cutoff truoc khi clear, con o day worker da loc xong o dia.
//
// Trang thai dich la 'error' (chuan cua UploadStatus), KHONG phai 'failed':
// 'failed' la gia tri ngoai enum (ban ghi duy nhat ngay 09/11 da sua ve
// 'error' trong DB) — Thu vien/D2/bo loc files/all chi nhan 'error' nen
// 'failed' hien nham thanh pending.
export const STALE_CHUNK_FAIL_MESSAGE = 'Tải lên dở dang quá 24 giờ, đã hủy';

export const STALE_CHUNK_FAIL_MAX_IDS = 1000;

export function parseStaleChunkFailRequest(body: any): { op: 'fail'; ids: string[] } {
  const err = (code: string, message: string) => {
    const e = new Error(message) as Error & { code: string; status: number };
    e.code = code;
    e.status = 400;
    return e;
  };
  if (!body || typeof body !== 'object') throw err('bad_request', 'Body phải là object');
  if (body.op !== 'fail') throw err('invalid_op', "op phải là 'fail'");
  if (!Array.isArray(body.ids)) throw err('invalid_ids', 'ids phải là mảng');
  if (body.ids.length > STALE_CHUNK_FAIL_MAX_IDS) {
    throw err('invalid_ids', `ids tối đa ${STALE_CHUNK_FAIL_MAX_IDS}`);
  }
  const ids = body.ids.filter((x: any) => typeof x === 'string' && x.length > 0);
  if (ids.length !== body.ids.length) {
    throw err('invalid_ids', 'ids phải là mảng chuỗi không rỗng');
  }
  return { op: 'fail', ids };
}
