import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Delta Finance — Agentic treasury your CFO can sign off',
  description:
    'An AI agent pays your approved suppliers in RLUSD on the XRP Ledger. You set the limits, approve the exceptions and can stop it at any time.',
  icons: { icon: '/logo.svg' },
};

export const viewport: Viewport = { themeColor: '#000000', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-df-yellow focus:px-3 focus:py-2 focus:text-black">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
