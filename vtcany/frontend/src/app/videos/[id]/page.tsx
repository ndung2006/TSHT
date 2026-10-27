'use client';
import { use, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { HlsPlayer } from '../../../components/hls-player';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const ORIGIN = API.replace(/\/api\/v1\/?$/, '');

export default function VideoWatch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('Dang lay link phat...');

  useEffect(() => {
    api(`/videos/${id}/play`)
      .then((d) => {
        setUrl(`${ORIGIN}${d.hls_path}`);
        setMsg('');
      })
      .catch((e) => setMsg(`Chua xem duoc: ${e?.message}`));
  }, [id]);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>VOD</h1>
      {msg && <p>{msg}</p>}
      {url && <HlsPlayer key={url} src={url} />}
    </main>
  );
}
