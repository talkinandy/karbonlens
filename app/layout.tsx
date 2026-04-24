import type { Metadata } from "next";
import { Suspense } from "react";
import { IBM_Plex_Sans, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { SignInRequiredModal } from "@/components/auth/SignInRequiredModal";
import { JsonLd } from "@/components/seo/JsonLd";

/**
 * Site-wide schema.org blocks (T31). Single Organization + WebSite pair
 * renders on every page so LLMs and Google can resolve the publisher
 * across any entry URL. `sameAs` is intentionally empty for v0.1 — add
 * Wikipedia/LinkedIn/Crunchbase URLs as they go live to compound the
 * E-E-A-T signal.
 */
const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "KarbonLens",
  url: "https://karbonlens.com",
  logo: "https://karbonlens.com/brand/karbonlens-mark.svg",
  description:
    "Indonesian carbon-market intelligence — reconciled SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace.",
  areaServed: "ID",
  sameAs: [] as string[],
};
const WEBSITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "KarbonLens",
  url: "https://karbonlens.com",
  inLanguage: "en",
  publisher: { "@type": "Organization", name: "KarbonLens" },
  potentialAction: {
    "@type": "SearchAction",
    target: "https://karbonlens.com/projects?q={query}",
    "query-input": "required name=query",
  },
};

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
  verification: {
    google: 'pmkyMzw-qY8lf21oEc8EMLsnJAknYWG1huO4JL7LQoQ',
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
      <body className="min-h-full flex flex-col">
        {children}
        <Suspense fallback={null}>
          <SignInRequiredModal />
        </Suspense>
        <JsonLd data={ORGANIZATION_SCHEMA} id="ld-organization" />
        <JsonLd data={WEBSITE_SCHEMA} id="ld-website" />
      </body>
    </html>
  );
}
