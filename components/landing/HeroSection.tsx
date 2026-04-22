/**
 * components/landing/HeroSection.tsx — T18 landing hero.
 *
 * Server component. Renders the T03 headline/subtitle verbatim, plus an
 * auth-conditional CTA: authenticated users see "Go to dashboard →"; anon
 * visitors see the <SignInButton>. The `session` prop is the full NextAuth
 * session object (or null) so the component can branch internally — the
 * parent page does not have to pick which element to pass.
 */

import Link from 'next/link';
import type { Session } from 'next-auth';
import { SignInButton } from '@/components/auth/SignInButton';

export type HeroSectionProps = {
  session: Session | null;
};

export function HeroSection({ session }: HeroSectionProps) {
  return (
    <header className="kl-page-header">
      <div>
        <p className="kl-section-label">KarbonLens · v0.1 preview</p>
        <h1 className="kl-page-title" style={{ fontSize: 48, maxWidth: 720 }}>
          Indonesia&apos;s carbon market, in one terminal.
        </h1>
        <p
          className="kl-page-subtitle"
          style={{ maxWidth: 560, marginTop: 12 }}
        >
          Satellite MRV, prices, reversal alerts, and regulatory tracking —
          unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.
        </p>
        <div style={{ marginTop: 20 }}>
          {session?.user ? (
            <Link href="/projects" className="kl-btn kl-btn--primary">
              Go to dashboard →
            </Link>
          ) : (
            <SignInButton />
          )}
        </div>
      </div>
    </header>
  );
}
