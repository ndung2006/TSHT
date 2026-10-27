'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { HlsPlayer } from '../../components/hls-player';

export default function LivePage() {
  const [url, setUrl] = useState('');
  const [info, setInfo] = useState('Nhan Play de lay link TTL 10 phut. Session tu gia han.');
  const timer = useRef<any>(null);

  async function mint() {
    try {
      const t = await api('/playback/token', {
        method: 'POST',
        body: JSON.stringify({ type: 'live', slug: 'PHUTHO', ttlMinutes: 240 }),
      });
      setUrl(t.hls_url);
      clearTimeout(timer.current);
      // Docs 25-VTC-ANY: TTL 240p, xin lai cham nhat phut 210.
      const waitMs = t.ttl_seconds > 3600 ? (t.ttl_seconds - 1800) * 1000 : (t.ttl_seconds * 1000 * 2) / 3;
      timer.current = setTimeout(mint, waitMs);
      setInfo(`Da cap link TTL ${Math.round(t.ttl_seconds / 60)} phut, tu xin lai sau ${Math.round(waitMs / 60000)} phut.`);
    } catch (e: any) {
      setInfo(`Loi: ${e?.message}`);
    }
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Live PHUTHO</h1>
      <p>{info}</p>
      <button onClick={mint}>Play</button>
      {url && <HlsPlayer key={url} src={url} />}
    </main>
  );
}
