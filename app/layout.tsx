import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TwinMind — Live Suggestions',
  description: 'Real-time meeting copilot powered by Groq.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect so the first Groq call is a single round-trip. */}
        <link rel="preconnect" href="https://api.groq.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://api.groq.com" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  );
}
