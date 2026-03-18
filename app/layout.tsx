import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MarketIntel — M&A Intelligence for Any Industry',
  description: 'Upload your company and location data. Get a professional market map in seconds.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Syne:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
