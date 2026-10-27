// VOD tu host: chon file da transcode xong tu thu vien Tap tin + lay link phat.
// Dung cho form Tap phim / Short / Video: videoFileId luu chinh la uploadId.
export function useVodFiles() {
  const api = useApi();
  const files = ref<any[]>([]);
  const loadingFiles = ref(false);

  async function loadDoneFiles() {
    loadingFiles.value = true;
    try {
      const r = await api.get<any>('/admin/catalog/files/all', { page: 1, limit: 100 });
      files.value = (r.data || []).filter((f: any) => f.transcode === 'done' || f.status === 'done');
    } catch { files.value = []; }
    finally { loadingFiles.value = false; }
  }

  function fileLabel(f: any): string {
    return `${f.filename || f.id} (${f.id})`;
  }

  // Link phat cong khai (chi thanh cong khi noi dung da xuat ban + HLS san sang).
  async function playUrl(kind: 'episode' | 'video' | 'short', id: string): Promise<string> {
    const r = await api.get<any>(`/vod/${kind}/${id}/play`);
    return r.hls_path as string;
  }

  return { files, loadingFiles, loadDoneFiles, fileLabel, playUrl };
}
