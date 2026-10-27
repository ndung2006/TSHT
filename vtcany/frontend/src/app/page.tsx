'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface Block {
  order: number;
  type: string;
  title?: string;
  items: Array<{ id: string; title: string; subtitle?: string; action: string; target_id: string }>;
}

export default function Home() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [msg, setMsg] = useState('Dang tai trang chu...');

  useEffect(() => {
    // Public API - khong can login.
    fetch(`${API}/layout/home?platform=WEB`)
      .then(async (r) => {
        if (!r.ok) throw new Error('layout failed');
        const data = await r.json();
        setBlocks((data.layout_blocks || []).filter((b: Block) => b.items.length > 0));
        setMsg('');
      })
      .catch((e) => setMsg(`Loi: ${e?.message}`));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>VTC ANY</h1>
      {msg && <p>{msg}</p>}
      {blocks.map((b) => (
        <section key={b.order} style={{ marginTop: 24 }}>
          {b.type === 'BANNER_SLIDER' ? (
            <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
              {b.items.map((it) => (
                <Link
                  key={it.id}
                  href={`/channels/${it.target_id}`}
                  style={{ minWidth: 280, padding: 20, background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none' }}
                >
                  <b>{it.title}</b>
                  <br />
                  <small>{it.subtitle}</small>
                </Link>
              ))}
            </div>
          ) : (
            <>
              <h2>{b.title}</h2>
              <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
                {b.items.map((it) => (
                  <Link
                    key={it.id}
                    href={it.action === 'OPEN_CHANNEL' ? `/channels/${it.target_id}` : '#'}
                    style={{ minWidth: 180, padding: 12, border: '1px solid #ccc', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}
                  >
                    <b>{it.title}</b>
                    <br />
                    <small>{it.subtitle}</small>
                  </Link>
                ))}
              </div>
            </>
          )}
        </section>
      ))}
      <p style={{ marginTop: 32 }}>
        <Link href="/live">Xem nhanh Live PHUTHO</Link> · <Link href="/cms">CMS duyet bai</Link>
      </p>
    </main>
  );
}
