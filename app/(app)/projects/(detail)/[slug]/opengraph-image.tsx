/**
 * T26 — dynamic OG image for /projects/[slug].
 *
 * 1200×630 PNG generated on-demand via `next/og` (Satori). Social crawlers
 * (Slack, WhatsApp, Twitter/X, LinkedIn, iMessage) unfurl project links using
 * this image. Served at `/projects/[slug]/opengraph-image` by the Next.js
 * file-convention router.
 *
 * Runtime: Node (no `export const runtime = 'edge'`). `lib/db.ts` uses
 * `postgres-js` which creates a Node.js `net.Socket` and is incompatible with
 * Vercel/Netlify Edge runtime. On the Hetzner VPS (persistent Node process)
 * this is fine; if v0.2 moves to an edge platform this file must be rewritten
 * to fetch summary data via an internal HTTP API route.
 *
 * Fallback: try/catch wraps the entire render. Unknown slug → minimal
 * wordmark-only image (still 200/1200×630, never 500, never redirect). Render
 * crash (Satori bug, DB timeout) → same fallback image.
 */

import { ImageResponse } from 'next/og';
import { getProjectSummary } from '@/lib/queries/project-summary';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'KarbonLens project summary';
export const revalidate = 3600; // 1-hour CDN cache (no-op without a CDN layer)

// Design tokens — mirror app/globals.css light-mode palette, applied against
// the dark OG canvas (`#0F1411`). Score bucket thresholds mirror ScoreCard.
const BG = '#0F1411';
const FG = '#fafaf7';
const MUTED = '#888780';
const FOOTER = '#5f5e5a';
const SUCCESS = '#0f6e56';
const WARNING = '#854f0b';
const DANGER = '#a32d2d';

function fallback() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 1200,
          height: 630,
          background: BG,
          color: SUCCESS,
          fontSize: 48,
          fontWeight: 500,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        KarbonLens
      </div>
    ),
    { width: 1200, height: 630 },
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  try {
    const { slug } = await params;
    const project = await getProjectSummary(slug);
    if (!project) return fallback();

    const scoreText =
      project.score != null ? project.score.toFixed(1) : null;

    // Bucket → pill colour. Mirrors the ScoreCard thresholds in T12.
    const pillColor =
      scoreText == null
        ? MUTED
        : Number(scoreText) >= 70
          ? SUCCESS
          : Number(scoreText) >= 40
            ? WARNING
            : DANGER;

    // Name truncation — 56 px Noto Sans on 1200 px canvas fits ~25–30 chars
    // per line. Cap at 60 chars and append the Unicode ellipsis. The style
    // below allows two lines, which handles typical Indonesian project names.
    const name =
      project.name.length > 60
        ? project.name.slice(0, 57) + '…'
        : project.name;

    const subline = [
      project.province ?? 'Indonesia',
      project.hectares != null
        ? `${Number(project.hectares).toLocaleString('en-ID')} ha`
        : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 1200,
            height: 630,
            background: BG,
            padding: '56px 72px',
          }}
        >
          {/* Top: wordmark */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: SUCCESS,
              fontSize: 20,
              fontWeight: 600,
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            KarbonLens
          </div>

          {/* Centre: project name + score pill + location subline */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 28,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: FG,
                fontSize: 56,
                fontWeight: 500,
                lineHeight: 1.1,
                letterSpacing: '-0.5px',
              }}
            >
              {name}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: pillColor + '22',
                  border: `1.5px solid ${pillColor}`,
                  borderRadius: 8,
                  padding: '8px 18px',
                  color: pillColor,
                  fontSize: 22,
                  fontWeight: 600,
                }}
              >
                {scoreText != null ? `Score ${scoreText}` : 'Score —'}
              </div>

              <div
                style={{
                  display: 'flex',
                  color: MUTED,
                  fontSize: 22,
                }}
              >
                {subline}
              </div>
            </div>
          </div>

          {/* Bottom: URL footer */}
          <div
            style={{
              display: 'flex',
              color: FOOTER,
              fontSize: 18,
              letterSpacing: '0.3px',
            }}
          >
            karbonlens.com
          </div>
        </div>
      ),
      { ...size },
    );
  } catch {
    return fallback();
  }
}
