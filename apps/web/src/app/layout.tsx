import './globals.css';
import type { Metadata } from 'next';
import { Providers } from '../components/providers';
import { Header } from '../components/header';

export const metadata: Metadata = {
  title: 'LumenFlow – Non-Custodial Stellar Swaps & Offramp',
  description: 'Fast, secure, non-custodial swaps and bridges on Stellar Testnet.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-50 antialiased font-sans selection:bg-blue-500 selection:text-white">
        <Providers>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <footer className="border-t border-slate-800/60 py-6 text-center text-xs text-slate-500">
              LumenFlow Stellar Platform • Non-Custodial • Testnet Only
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
