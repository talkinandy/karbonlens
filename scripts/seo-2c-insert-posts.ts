/**
 * One-shot inserter for the 5 editorial posts (SEO Phase 2C).
 * Run via tsx from /opt/karbonlens/app so it picks up the live db connection.
 *
 *   sudo -u karbonlens env $(cat /opt/karbonlens/.env | grep -v '^#') \
 *     /opt/karbonlens/app/node_modules/.bin/tsx /tmp/insert-posts.ts
 */

import { readFileSync } from 'node:fs';
import { db } from '@/lib/db';
import { newsPosts } from '@/lib/schema';
import { sql } from 'drizzle-orm';

type PostInput = {
  file: string;
  slug: string;
  kind: 'explainer' | 'evergreen' | 'comparison' | 'investigation';
  title: string;
  summary: string;
  publishedAt: Date;
};

const TODAY = new Date('2026-05-23T09:00:00Z');

const POSTS: PostInput[] = [
  {
    file: '/tmp/karbonlens-drafts/01-permenhut.md',
    slug: 'permenhut-6-2026-dijelaskan',
    kind: 'explainer',
    title: 'Permenhut 6/2026 Dijelaskan: Babak Baru Karbon Hutan Indonesia',
    summary:
      'Permenhut 6/2026 buka jalur SPE GRK dan non-SPE GRK untuk karbon kehutanan, perluas pelaku ke perhutanan sosial. Apa yang berubah dan masih kabur.',
    publishedAt: new Date(TODAY.getTime() + 0 * 3600_000),
  },
  {
    file: '/tmp/karbonlens-drafts/02-prices.md',
    slug: 'harga-karbon-indonesia-2025-2026',
    kind: 'evergreen',
    title: 'Harga Karbon Indonesia 2025–2026: Data Bulanan IDXCarbon dan Apa Artinya',
    summary:
      'Analisis bulanan harga karbon IDXCarbon 2025-2026, anomali Feb 2026, lonjakan volume Desember pasca Perpres 110/2025, dan posisi pasar Indonesia versus EU ETS, K-ETS, NZ ETS.',
    publishedAt: new Date(TODAY.getTime() + 2 * 3600_000),
  },
  {
    file: '/tmp/karbonlens-drafts/03-registry-comparison.md',
    slug: 'verra-srn-ppi-idxcarbon-comparison',
    kind: 'comparison',
    title: 'Verra vs SRN-PPI vs IDXCarbon: The Three-Layer Stack Behind Indonesian Carbon Credits',
    summary:
      "Verra is a standard, SRN-PPI is Indonesia's national registry, IDXCarbon is the exchange. They stack, not compete. Here is how a credit moves through all three and where buyers get burned.",
    publishedAt: new Date(TODAY.getTime() + 4 * 3600_000),
  },
  {
    file: '/tmp/karbonlens-drafts/04-central-kalimantan.md',
    slug: 'proyek-karbon-kalimantan-tengah-2026',
    kind: 'investigation',
    title: 'Proyek karbon di Kalimantan Tengah: update 2026',
    summary:
      'Kalimantan Tengah memegang 7 proyek karbon (355.405 ha), terbanyak di Indonesia. Permenhut 6/2026, Perpres 110/2025, dan ribuan alert satelit menentukan arah berikutnya.',
    publishedAt: new Date(TODAY.getTime() + 6 * 3600_000),
  },
  {
    file: '/tmp/karbonlens-drafts/05-satellite-alerts.md',
    slug: 'satellite-alerts-mapped-to-verra-indonesia-247k',
    kind: 'investigation',
    title: '247,000 satellite alerts, 200 carbon projects: the uneven map of Indonesian REDD+ risk',
    summary:
      'KarbonLens mapped 247,000 GFW satellite alerts to Indonesian Verra polygons. Alert density varies 280x across the top 10 projects. Here is what that tells buyers.',
    publishedAt: new Date(TODAY.getTime() + 8 * 3600_000),
  },
];

function logJson(obj: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...obj }));
}

async function main(): Promise<void> {
  for (const p of POSTS) {
    const bodyMd = readFileSync(p.file, 'utf8').replace(/^# .+\n/, '').trim();
    if (bodyMd.length < 500) {
      logJson({ event: 'skip', reason: 'body too short', slug: p.slug });
      continue;
    }

    const inserted = await db
      .insert(newsPosts)
      .values({
        slug: p.slug,
        kind: p.kind,
        title: p.title,
        summary: p.summary,
        bodyMd,
        publishedAt: p.publishedAt,
        factsJson: { source: 'editorial', writer: 'expert-content-agent', phase: '2C' } as Record<string, unknown>,
      })
      .onConflictDoNothing()
      .returning({ id: newsPosts.id, slug: newsPosts.slug });

    if (inserted.length === 0) {
      logJson({ event: 'duplicate', slug: p.slug, reason: 'already exists' });
    } else {
      logJson({
        event: 'inserted',
        slug: inserted[0].slug,
        id: inserted[0].id,
        kind: p.kind,
        body_chars: bodyMd.length,
        published_at: p.publishedAt.toISOString(),
      });
    }
  }

  // Trigger sitemap revalidation so the next IndexNow nightly picks up the
  // new URLs without waiting for the 600s ISR tick.
  const base = process.env.NEXTAUTH_URL ?? 'https://karbonlens.com';
  const revalidateSecret = process.env.SITEMAP_REVALIDATE_SECRET;
  if (revalidateSecret) {
    try {
      const res = await fetch(`${base}/api/internal/revalidate-sitemap`, {
        method: 'POST',
        headers: { authorization: `Bearer ${revalidateSecret}` },
        signal: AbortSignal.timeout(10_000),
      });
      logJson({ event: 'sitemap_revalidate', status: res.status });
    } catch (e) {
      logJson({ event: 'sitemap_revalidate_fail', error: String(e) });
    }
  } else {
    logJson({ event: 'sitemap_revalidate_skip', reason: 'no SITEMAP_REVALIDATE_SECRET' });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ ts: new Date().toISOString(), event: 'insert_fail', error: msg }));
    process.exit(1);
  });
