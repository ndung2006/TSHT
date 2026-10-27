import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'VTC ANY' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
