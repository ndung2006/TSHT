'use client';
import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

// Player HLS: trinh duyet desktop (Chrome/Firefox) khong doc duoc m3u8
// bang <video> thuong - hls.js demux + feed MSE. Safari dung native.
export function HlsPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !src) return;
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 30 });
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_ev, data) => {
        // 403 giua chung = token het han -> component cha mint lai qua key change.
        if (data.fatal) hls?.destroy();
      });
    } else {
      video.src = src; // Safari native HLS
    }
    video.play().catch(() => undefined);
    return () => hls?.destroy();
  }, [src]);

  return <video ref={ref} controls style={{ width: '100%', maxWidth: 720, marginTop: 12, background: '#000' }} />;
}
