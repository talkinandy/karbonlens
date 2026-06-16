/**
 * POST /api/seo/autopilot/publish — SEO Autopilot publish endpoint (for N8N).
 *
 * Receives an LLM-generated artifact (+ the grounding facts it was given),
 * runs the hard fact-check GATE (lib/seo/autopilot/gate.ts), and ONLY on a
 * full pass applies the change live. Every call writes a seo_jobs row so the
 * /admin/seo Autopilot tab shows the whole pipeline — including rejections.
 *
 * The user chose auto-publish-behind-a-gate, no human click. So this route is
 * the trust boundary: the gate re-verifies every claimed number against the DB
 * before anything ships. A rejected artifact is recorded as `qa_failed` with
 * the per-check report and returns 422 — never silently dropped.
 *
 * Auth: Authorization: Bearer <SEO_AUTOPILOT_SECRET>.
 *
 * Currently applies `editorial` jobs (insert news_posts → revalidate sitemap →
 * IndexNow). meta / glossary artifacts are rejected with 400 until their
 * apply-surfaces land; their opportunities still surface in the feed.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { seoJobs } from '@/lib/schema';
import { authorizeAutopilot } from '@/lib/seo/autopilot/auth';
import { runEditorialGate } from '@/lib/seo/autopilot/gate';
import type { EditorialArtifact, GroundingFact } from '@/lib/seo/autopilot/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublishBody = EditorialArtifact & { grounding?: GroundingFact[] };

function bad(detail: string, status = 400): Response {
  return NextResponse.json({ ok: false, error: detail }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeAutopilot(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: PublishBody;
  try {
    body = (await request.json()) as PublishBody;
  } catch {
    return bad('Invalid JSON body');
  }

  if (body.jobType !== 'editorial') {
    return bad(
      `Apply surface for job_type '${body.jobType}' is not enabled yet — only 'editorial' publishes today.`,
    );
  }

  // Minimal shape validation before the (heavier) gate runs.
  const required: Array<keyof EditorialArtifact> = ['slug', 'title', 'summary', 'bodyMd', 'kind'];
  for (const f of required) {
    if (!body[f]) return bad(`Missing required field '${String(f)}'`);
  }
  // Harden `kind`: LLMs occasionally emit an off-list label (e.g. "guide").
  // Rather than 400 and lose the whole generation, coerce unknown kinds to a
  // safe default so the gate still decides on the substance.
  const ALLOWED_KINDS = ['explainer', 'evergreen', 'comparison', 'investigation', 'market_report'];
  if (!ALLOWED_KINDS.includes(body.kind)) {
    body.kind = 'explainer';
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) {
    return bad(`Slug '${body.slug}' must be lowercase kebab-case`);
  }

  // Run the gate. It reads art.grounding for claim verification + DB reverify.
  const art = { ...body, claims: body.claims ?? [], grounding: body.grounding ?? [] } as EditorialArtifact;
  const qa = await runEditorialGate(art as EditorialArtifact & { grounding: GroundingFact[] });

  const baseRow = {
    jobType: 'editorial' as const,
    targetQuery: body.targetQuery ?? null,
    targetUrl: `/news/${body.slug}`,
    title: body.title,
    payload: { ...body } as Record<string, unknown>,
    grounding: { facts: body.grounding ?? [] } as Record<string, unknown>,
    qa,
    llmModel: body.llmModel ?? null,
    tokensIn: body.tokensIn ?? null,
    tokensOut: body.tokensOut ?? null,
    externalId: body.externalId ?? null,
  };

  if (!qa.passed) {
    await db.insert(seoJobs).values({ ...baseRow, status: 'qa_failed' });
    return NextResponse.json({ ok: false, published: false, qa }, { status: 422 });
  }

  // Gate passed — but the autopilot no longer auto-publishes (WS2a). Park the
  // artifact as qa_passed for a human to Approve/Reject on /admin/seo. The
  // full artifact lives in payload; approval inserts news_posts + revalidates +
  // pings IndexNow (see app/admin/seo/autopilot-actions.ts).
  const [job] = await db
    .insert(seoJobs)
    .values({ ...baseRow, status: 'qa_passed' })
    .returning({ id: seoJobs.id });

  return NextResponse.json(
    {
      ok: true,
      published: false,
      queuedForReview: true,
      status: 'qa_passed',
      jobId: job?.id ?? null,
      qa,
    },
    { status: 202 },
  );
}
