import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AlyraX — Private Archive',
  description: 'A premium AI companion platform. 20 archetypes. One perfect match.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full flex overflow-hidden" style={{ background: 'var(--onyx)' }}>
        {children}
      </body>
    </html>
  );
}