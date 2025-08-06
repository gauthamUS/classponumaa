
import type {Metadata} from 'next';
import { Inter, Roboto_Mono } from 'next/font/google'; // Changed from Geist_Sans, Geist_Mono
import './globals.css';
import { Toaster } from "@/components/ui/toaster";

const fontSans = Inter({ // Changed from Geist_Sans to Inter
  variable: '--font-sans', // Changed variable name
  subsets: ['latin'],
});

const fontMono = Roboto_Mono({ // Changed from Geist_Mono to Roboto_Mono
  variable: '--font-mono', // Changed variable name
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Attendance Ally',
  description: 'Check your exam eligibility based on attendance.',
  icons: {
    icon: '/icon.png', // Or /favicon.ico if you use that name
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Apple iOS support */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon-192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />

        {/* PWA support */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#000000" />
      </head>
      <body>{children}</body>
    </html>
  );
}    
