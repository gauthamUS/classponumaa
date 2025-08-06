
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className={`${fontSans.variable} ${fontMono.variable} antialiased`}> {/* Updated font variables */}
        {children}
        <Toaster />
      </body>
    </html>
  );
}

    
