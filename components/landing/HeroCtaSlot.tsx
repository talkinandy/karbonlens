/**
 * components/landing/HeroCtaSlot.tsx — auth-aware CTA island for the
 * landing hero (SEO Phase 1).
 *
 * Isolates the only `auth()` call on the landing page into its own server
 * component so the parent route can be PPR-prerendered with this slot
 * streamed in dynamically. Static crawlers see the guest CTAs in the
 * prerendered shell — that's the correct SEO surface.
 */

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { SignInButton } from '@/components/auth/SignInButton';

export async function HeroCtaSlot() {
  const session = await auth();
  const isSignedIn = Boolean(session?.user);
  const primaryLabel = isSignedIn ? 'Open your dashboard →' : 'Open the terminal →';

  return (
    <>
      <div className="lp-cta">
        <Link href="/projects" className="kl-btn kl-btn--primary">
          {primaryLabel}
        </Link>
        <Link href="/regulatory?focus=permenhut-6-2026" className="kl-btn">
          Read Permenhut 6/2026
        </Link>
      </div>

      {!isSignedIn ? (
        <div style={{ marginBottom: 28 }}>
          <SignInButton className="kl-btn">
            Sign in with Google to save alerts
          </SignInButton>
        </div>
      ) : null}
    </>
  );
}

export function HeroCtaFallback() {
  return (
    <>
      <div className="lp-cta">
        <Link href="/projects" className="kl-btn kl-btn--primary">
          Open the terminal →
        </Link>
        <Link href="/regulatory?focus=permenhut-6-2026" className="kl-btn">
          Read Permenhut 6/2026
        </Link>
      </div>
      <div style={{ marginBottom: 28 }}>
        <SignInButton className="kl-btn">
          Sign in with Google to save alerts
        </SignInButton>
      </div>
    </>
  );
}
