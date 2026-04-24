/**
 * components/landing/HeroSection.tsx — T25 landing hero (left column).
 *
 * Renders the kicker, Instrument Serif H1 ("Every credit, every policy, one
 * lens."), EN tagline, ID tagline ("Platform intelijen pasar karbon
 * Indonesia …"), primary CTAs, and the three-figure hero stats strip.
 *
 * Auth-aware CTA behaviour per T25 §3.1 and AC-8:
 *   - Guest: primary CTA "Open the terminal →" + "Read Permenhut 6/2026".
 *     A secondary `<SignInButton>` ("Sign in with Google to save alerts")
 *     is rendered below .lp-cta. It does NOT gate any content.
 *   - Signed in: primary CTA text changes to "Open your dashboard →" (same
 *     `/projects` href). The "Read Permenhut 6/2026" button stays. The
 *     `<SignInButton>` is NOT rendered.
 *
 * Server Component. Hero right column (satellite map + caption) is rendered
 * by the parent page.
 */

import Link from 'next/link';
import type { Session } from 'next-auth';
import { SignInButton } from '@/components/auth/SignInButton';
import type { LandingStats } from '@/lib/queries/landing-stats';

export type HeroSectionProps = {
  session: Session | null;
  stats: LandingStats;
};

function dash(v: string | null | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : v;
}

export function HeroSection({ session, stats }: HeroSectionProps) {
  const isSignedIn = Boolean(session?.user);

  const primaryLabel = isSignedIn ? 'Open your dashboard →' : 'Open the terminal →';

  const projectsFormatted = stats.projectCount.toLocaleString('en-US');
  const priceLabel = stats.latestPeriod
    ? `IDXCarbon avg · ${stats.latestPeriod}`
    : 'IDXCarbon avg';
  const priceValue = dash(stats.latestAvgPriceIdr);
  const vcusYtd = dash(stats.vcusTradedYtd);

  return (
    <div className="lp-hero-left">
      <div className="lp-kicker">
        <span className="lp-kicker-dot" aria-hidden="true" />
        <span>Indonesia carbon market intelligence</span>
        <span className="lp-kicker-sep">·</span>
        <span>Beta · Jakarta</span>
      </div>

      <h1 className="lp-h1">
        Every credit,
        <br />
        every policy,
        <br />
        <em className="lp-h1-em">one lens.</em>
      </h1>

      <p className="lp-tag-en">
        KarbonLens turns SRN-PPI, IDXCarbon, Verra, Sentinel, and JDIH into a
        single workspace for the people building — and buying from —
        Indonesia&apos;s carbon market.
      </p>
      <p className="lp-tag-id">
        Platform intelijen pasar karbon Indonesia. Registri, harga, regulasi,
        dan pemantauan satelit dalam <em>satu layar</em>.
      </p>

      <div className="lp-cta">
        <Link href="/projects" className="kl-btn kl-btn--primary">
          {primaryLabel}
        </Link>
        <Link
          href="/regulatory?focus=permenhut-6-2026"
          className="kl-btn"
        >
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

      <div className="lp-hero-stats">
        <div>
          <div className="lp-hs-v">{projectsFormatted}</div>
          <div className="lp-hs-l">Projects tracked</div>
        </div>
        <div>
          <div className="lp-hs-v">{priceValue}</div>
          <div className="lp-hs-l">{priceLabel}</div>
        </div>
        <div>
          <div className="lp-hs-v">{vcusYtd}</div>
          <div className="lp-hs-l">VCUs traded · YTD</div>
        </div>
      </div>
    </div>
  );
}
