'use client';
import { useState } from 'react';
import { api, authHeaders } from '../../lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
const CHUNK = 5 * 1024 * 1024;

export default function CmsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>(null);
  const [title, setTitle] = useState('Ban tin toi');
  const [msg, setMsg] = useState('Nhap lieu -> upload file -> Kiem duyet -> Xuat ban.');
  const [uploadId, setUploadId] = useState('');
  const [progress, setProgress] = useState('');

  async function uploadFile(videoId: string, file: File) {
    try {
      setProgress('Xin upload...');
      const init = await api('/uploads/init', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, sizeBytes: file.size, contentType: file.type || 'video/mp4', videoId }),
      });
      const n = init.chunks;
      for (let i = 0; i < n; i++) {
        setProgress(`Dang gui chunk ${i + 1}/${n}...`);
        const blob = file.slice(i * CHUNK, (i + 1) * CHUNK);
        const h = await authHeaders();
        const res = await fetch(`${API}/storage-local/raw/${init.id}/chunks/${i}`, {
          method: 'PUT',
          headers: { ...h, 'Content-Type': 'application/octet-stream' },
          body: blob,
        });
        if (!res.ok) throw new Error(`chunk ${i} failed`);
      }
      setProgress('Gop file + day transcode...');
      await api(`/uploads/${init.id}/complete`, { method: 'POST' });
      setUploadId(init.id);
      setProgress(`Xong upload ${init.id} - worker dang transcode, xem duoc o /videos/${videoId} khi xong.`);
      await refresh();
    } catch (e: any) {
      setProgress(`Loi upload: ${e?.message}`);
    }
  }

  async function refresh(page = 1) {
    try {
      const res = await api(`/videos?page=${page}&limit=20`);
      setItems(res.data || res);
      setMeta(res.meta || null);
    } catch (e: any) {
      setMsg(`Loi: ${e?.message}`);
    }
  }

  async function create() {
    try {
      await api('/videos', { method: 'POST', body: JSON.stringify({ title }) });
      await refresh();
    } catch (e: any) {
      setMsg(`Loi: ${e?.message}`);
    }
  }

  async function act(id: string, action: 'submit' | 'publish' | 'reject') {
    try {
      await api(`/videos/${id}/${action}`, { method: 'POST' });
      await refresh();
    } catch (e: any) {
      setMsg(`Loi: ${e?.message}`);
    }
  }

  return (
    <main style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>CMS - Duyet bai</h1>
      <p>{msg} {meta && `(tong ${meta.total})`}</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: 320 }} />
      <button onClick={create}>Nhap lieu</button>
      <button onClick={() => refresh()}>Tai lai</button>
      <ul>
        {items.map((v) => (
          <li key={v.id} style={{ marginBottom: 8 }}>
            {v.title} [{v.status}] <a href={`/videos/${v.id}`}>Xem</a>
            <button onClick={() => act(v.id, 'submit')}>Trinh duyet</button>
            <button onClick={() => act(v.id, 'publish')}>Xuat ban</button>
            <button onClick={() => act(v.id, 'reject')}>Tu choi</button>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(v.id, f);
              }}
            />
          </li>
        ))}
      </ul>
      {progress && <p>{progress}</p>}
      {uploadId && <p>Upload ID: {uploadId}</p>}
    </main>
  );
}
