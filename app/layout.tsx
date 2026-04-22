import type { Metadata } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://karbonlens.com'),
  title: {
    default: 'KarbonLens',
    template: '%s · KarbonLens',
  },
  description:
    'Satellite MRV, prices, reversal alerts, and regulatory tracking — unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.',
  openGraph: {
    siteName: 'KarbonLens',
    type: 'website',
    locale: 'en_US',
    alternateLocale: ['id_ID'],
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'KarbonLens satellite monitor — Katingan peatland with live deforestation alerts',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${plexMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
