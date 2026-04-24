/**
 * GET /llms-full.txt — expanded LLM-facing descriptor (T31 / T32).
 *
 * Mirrors `/llms.txt` (the small, hand-curated file) but appends a
 * "## Projects" section that enumerates every Indonesian project with a
 * canonical URL and integrity score. This is the file that retrieval LLMs
 * use when answering "list every Verra REDD+ project in Indonesia and
 * their integrity scores" — llms.txt is too thin for that.
 *
 * The score join picks the latest score row per project via a correlated
 * subquery; project_scores is keyed by (project_id, score_date) so MAX is
 * the v1 source of truth. If a project has no scored row yet, we render
 * the score as an em-dash rather than 0 — explicit "unknown" beats a
 * misleading zero.
 *
 * Defensive: if the DB is unreachable (cold deploy, Postgres restart) we
 * fall back to the static section only. Better than 500ing on a public
 * crawler-facing URL.
 *
 * Cache: 6 hours — the underlying SQL hits ~200 rows + a correlated
 * subquery per row (~400 lookups), so it's noticeably more expensive than
 * /llms.txt. Six hours is the same cadence as the nightly score re-run
 * plus a small jitter window.
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const STATIC_SECTION = `# KarbonLens

> Indonesian carbon-market intelligence. Reconciled SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace. Primary data covers ~200 projects, monthly IDXCarbon prices, and weekly satellite alerts.

## Project Registry

- [Projects explorer](https://karbonlens.com/projects): Filterable registry of Indonesian carbon projects across Verra, Gold Standard, CDM, and SRN-PPI.
- [Methodology](https://karbonlens.com/methodology): How the v1 integrity score is calculated — validation recency, reversal risk, community, transparency.

## Market data

- [IDXCarbon prices](https://karbonlens.com/prices): Monthly volume and price snapshots from Indonesia's carbon exchange.

## Regulatory

- [Regulatory timeline](https://karbonlens.com/regulatory): Indonesian carbon-market regulations since Perpres 98/2021.

## Site policies

- [Privacy](https://karbonlens.com/privacy)
- [Terms](https://karbonlens.com/terms)
`;

type ProjectRow = {
  slug: string;
  name_canonical: string;
  score: string | null;
};

async function fetchProjectRows(): Promise<ProjectRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      p.slug,
      p.name_canonical,
      ps.integrity_score::text AS score
    FROM projects p
    LEFT JOIN project_scores ps
      ON ps.project_id = p.id
     AND ps.score_date = (
       SELECT MAX(score_date)
       FROM project_scores
       WHERE project_id = p.id
     )
    WHERE p.country = 'ID'
    ORDER BY p.name_canonical
  `)) as unknown as ProjectRow[];
  return rows;
}

function renderProjectsSection(rows: ProjectRow[]): string {
  if (rows.length === 0) return '';
  const lines = rows.map((r) => {
    const score = r.score ?? '—';
    return `- [${r.name_canonical}](https://karbonlens.com/projects/${r.slug}): score ${score} / 100`;
  });
  return `\n## Projects\n\n${lines.join('\n')}\n`;
}

export async function GET(): Promise<Response> {
  let body = STATIC_SECTION;
  try {
    const rows = await fetchProjectRows();
    body += renderProjectsSection(rows);
  } catch {
    // DB unavailable — return the static section only. A 500 here would
    // poison a public crawler-facing URL; a thin-but-valid file does not.
  }
  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=21600',
    },
  });
}

// 6 hours — see file header. Matches Cache-Control above.
export const revalidate = 21600;
