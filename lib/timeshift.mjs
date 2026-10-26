// Timeshift playlist stitching, translated from VTCANY
// backend/src/modules/playback/aio-client.ts (stitchTimeshiftPlaylists,
// absolutizeUri, TIMESHIFT_MAX_MS) into plain Node JS for TSHT.
// The VTCANY backend already stitches server-side for its own
// /timeshift.m3u8 route; this module is used only by TSHT's direct-AIO
// fallback path, where each AIO call is capped at 6 hours.

export const TIMESHIFT_MAX_MS = 6 * 3600 * 1000;

export function absolutizeUri(uri, baseUrl) {
  const u = (uri || "").trim();
  if (!u || /^(https?:)?\/\//i.test(u) || u.startsWith("data:")) return u;
  const base = String(baseUrl || "").replace(/\/$/, "");
  if (!base) return u;
  if (u.startsWith("/")) {
    try { return new URL(base).origin + u; } catch { return u; }
  }
  return `${base}/${u}`;
}

function absolutizeTagUris(tagLine, baseUrl) {
  return tagLine.replace(/URI="([^"]+)"/g, (_m, u) => `URI="${absolutizeUri(u, baseUrl)}"`);
}

// Join several VOD chunk playlists (each <= 6h) into one VOD playlist:
// one header, one ENDLIST, DISCONTINUITY between chunks, KEY/MAP carried
// onto their segment. Throws (status 404) when there are no segments at
// all, so the caller can show "no recording" instead of a spinning player.
export function stitchTimeshiftPlaylists(chunks) {
  const segs = [];
  let maxTarget = 10;
  let firstChunk = true;
  for (const { playlist, baseUrl } of chunks) {
    const chunkSegs = [];
    let pendingKey = null, pendingMap = null, pendingInf = null;
    for (const raw of String(playlist || "").split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#EXT-X-TARGETDURATION:")) {
        const n = Number(line.split(":")[1]);
        if (Number.isFinite(n) && n > maxTarget) maxTarget = n;
        continue;
      }
      if (line.startsWith("#EXT-X-KEY:")) { pendingKey = absolutizeTagUris(line, baseUrl); continue; }
      if (line.startsWith("#EXT-X-MAP:")) { pendingMap = absolutizeTagUris(line, baseUrl); continue; }
      if (line.startsWith("#EXTINF:")) { pendingInf = line; continue; }
      if (line === "#EXT-X-DISCONTINUITY") { chunkSegs.push(line); continue; }
      if (line.startsWith("#")) continue; // chunk header/footer: VERSION, SEQUENCE, ENDLIST...
      if (pendingInf) {
        if (pendingKey) { chunkSegs.push(pendingKey); pendingKey = null; }
        if (pendingMap) { chunkSegs.push(pendingMap); pendingMap = null; }
        chunkSegs.push(pendingInf, absolutizeUri(line, baseUrl));
        pendingInf = null;
      }
    }
    if (chunkSegs.length) {
      if (!firstChunk) segs.push("#EXT-X-DISCONTINUITY");
      segs.push(...chunkSegs);
      firstChunk = false;
    }
  }
  if (!segs.length) {
    throw Object.assign(new Error("aio: khong co ban ghi cho khung gio nay"), { status: 404 });
  }
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    `#EXT-X-TARGETDURATION:${Math.ceil(maxTarget)}`,
    ...segs,
    "#EXT-X-ENDLIST",
  ].join("\n") + "\n";
}
