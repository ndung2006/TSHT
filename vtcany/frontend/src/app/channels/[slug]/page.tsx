'use client';
import { use, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api';
import { HlsPlayer } from '../../../components/hls-player';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export default function ChannelDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [detail, setDetail] = useState<any>(null);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('Dang tai chi tiet kenh...');
  const timer = useRef<any>(null);

  useEffect(() => {
    fetch(`${API}/channels/${slug}/detail`)
      .then(async (r) => {
        if (!r.ok) throw new Error('channel failed');
        setDetail(await r.json());
        setMsg('');
      })
      .catch((e) => setMsg(`Loi: ${e?.message}`));
    return () => clearTimeout(timer.current);
  }, [slug]);

  async function play() {
    try {
      const t = await api('/playback/token', {
        method: 'POST',
        body: JSON.stringify({ type: 'live', slug, ttlMinutes: 240 }),
      });
      setUrl(t.hls_url);
      clearTimeout(timer.current);
      timer.current = setTimeout(play, (t.ttl_seconds - 1800) * 1000);
    } catch (e: any) {
      setMsg(`Loi lay link: ${e?.message}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>Kenh {slug?.toUpperCase()}</h1>
      {msg && <p>{msg}</p>}
      {detail?.epgNow && (
        <p>
          Dang phat: <b>{detail.epgNow.title}</b>
        </p>
      )}
      <button onClick={play}>Play</button>
      {url && <HlsPlayer key={url} src={url} />}
      {detail?.timeline?.length > 0 && (
        <>
          <h2>Lich phat song</h2>
          <ul>
            {detail.timeline.map((t: any, i: number) => (
              <li key={i}>
                {t.time} — {t.title} [{t.status}]
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
