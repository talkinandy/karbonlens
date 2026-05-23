/**
 * components/landing/HeroCtaSlot.tsx — auth-aware CTA island for the
 * landing hero (SEO Phase 1).
 *
 * Isolates the only `auth()` call on the landing page into its own
 * Suspense-rendered server component. The page hands a <Suspense
 * fallback={<HeroCtaFallback />}> over to <HeroSection>; crawlers and
 * cold-cache visitors see the guest fallback first, then the personalised
 * CTA streams in. Sets up the route for a future Next 16 cacheComponents
 * rollout without changing user-visible behaviour today.
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
