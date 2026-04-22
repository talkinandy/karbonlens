'use client';

/**
 * LandingHeroMap — client wrapper around the landing-hero MapLibre composition.
 *
 * Responsibilities:
 *   1. Dynamically import `LandingHeroMapInner` with `ssr: false` so the
 *      `maplibre-gl` bundle stays out of the initial HTML and is code-split
 *      into its own chunk. Next.js 16 disallows `ssr: false` dynamic imports
 *      from Server Components — hence this "use client" wrapper.
 *   2. Render a skeleton placeholder while the inner chunk loads.
 *   3. Catch constructor-level MapLibre errors via a `MapErrorBoundary`
 *      class component defined below. `MapLibreBase` renders its own
 *      "Map unavailable" state on `new maplibregl.Map(...)` throws and does
 *      NOT re-throw, so the boundary only fires on true crashes (WebGL
 *      unsupported + throw, module load failure, etc.) — but we wrap it
 *      regardless for defence-in-depth.
 *   4. Emit a `<noscript>` fallback that renders a static image for clients
 *      without JavaScript. We keep this on the T25-owned file rather than
 *      the global `app/layout.tsx` (not T25-owned) so the scope is narrow.
 *
 * Per T25 §3.1 / §7 edge-case (iii). Ownership: T25.
 */

import {
  Component,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import type { LandingHeroMapInnerProps } from './LandingHeroMapInner';

const FALLBACK_IMG = '/og-image.png';
const FALLBACK_ALT = 'Katingan Peatland satellite view';

const LandingHeroMapInner = dynamic<LandingHeroMapInnerProps>(
  () => import('./LandingHeroMapInner'),
  {
    ssr: false,
    loading: () => <MapSkeleton />,
  },
);

function MapSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="kl-map animate-pulse"
      style={{
        width: '100%',
        aspectRatio: '16 / 10',
        minHeight: 320,
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius-lg)',
      }}
    />
  );
}

function MapFallbackImg() {
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={FALLBACK_IMG}
      alt={FALLBACK_ALT}
      className="lp-map-fallback"
    />
  );
}

type BoundaryState = { hasError: boolean };

class MapErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { hasError: false };

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('[T25] LandingHeroMap error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <MapFallbackImg />;
    }
    return this.props.children;
  }
}

export type LandingHeroMapProps = LandingHeroMapInnerProps;

export default function LandingHeroMap(props: LandingHeroMapProps) {
  return (
    <>
      <MapErrorBoundary>
        <Suspense fallback={<MapSkeleton />}>
          <LandingHeroMapInner {...props} />
        </Suspense>
      </MapErrorBoundary>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FALLBACK_IMG}
          alt={FALLBACK_ALT}
          className="lp-map-fallback"
        />
      </noscript>
    </>
  );
}
