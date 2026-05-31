import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Stratus',
  description: 'Stratus — DeFi suite on IOPN testnet (Lend + Swap + Leveraged LP composer)',
  icons: {
    icon: '/stratus-mark.svg',
    apple: '/stratus-mark.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-black min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
