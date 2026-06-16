/**
 * GET /api/seo/opportunities — SEO Autopilot opportunity feed (for N8N).
 *
 * Returns ranked candidate jobs across the live detectors (editorial, meta,
 * glossary), each with the REAL DB facts the LLM is permitted to cite. N8N
 * picks the top candidate(s), generates an artifact, and posts it to
 * /api/seo/autopilot/publish.
 *
 * Auth: Authorization: Bearer <SEO_AUTOPILOT_SECRET>.
 * Query params: ?type=editorial|meta|glossary (filter), ?limit=N (default 8).
 *
 * Read-only — never mutates. Safe to poll.
 */

import { NextResponse } from 'next/server';
import { authorizeAutopilot } from '@/lib/seo/autopilot/auth';
import { allOpportunities } from '@/lib/seo/autopilot/opportunities';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = authorizeAutopilot(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get('limit')) || 8));

  try {
    const bundle = await allOpportunities(limit);
    const opportunities = type
      ? bundle.opportunities.filter((o) => o.jobType === type)
      : bundle.opportunities;
    return NextResponse.json({ ...bundle, opportunities });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'opportunity scan failed' },
      { status: 500 },
    );
  }
}
