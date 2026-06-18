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
import { seoJobs, type SeoJobQa, type SeoJobType } from '@/lib/schema';
import { authorizeAutopilot } from '@/lib/seo/autopilot/auth';
import { runEditorialGate } from '@/lib/seo/autopilot/gate';
import { runNewsBriefGate } from '@/lib/seo/autopilot/news-gate';
import { runRegulatoryGate } from '@/lib/seo/autopilot/regulatory-gate';
import { notifyReviewQueued } from '@/lib/telegram';
import type {
  EditorialArtifact,
  NewsBriefArtifact,
  RegulatoryArtifact,
  GroundingFact,
} from '@/lib/seo/autopilot/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PublishBody =
  | (EditorialArtifact & { grounding?: GroundingFact[] })
  | NewsBriefArtifact
  | RegulatoryArtifact;

type BaseRow = {
  jobType: SeoJobType;
  targetQuery: string | null;
  targetUrl: string | null;
  title: string;
  payload: Record<string, unknown>;
  grounding: Record<string, unknown>;
  qa: SeoJobQa;
  llmModel: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  externalId: string | null;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ALLOWED_EDITORIAL_KINDS = [
  'explainer', 'evergreen', 'comparison', 'investigation', 'market_report', 'analysis',
];

function bad(detail: string, status = 400): Response {
  return NextResponse.json({ ok: false, error: detail }, { status });
}

/** Validate + gate an editorial artifact, returning the seo_jobs base row. */
async function prepEditorial(body: EditorialArtifact & { grounding?: GroundingFact[] }): Promise<BaseRow | Response> {
  for (const f of ['slug', 'title', 'summary', 'bodyMd', 'kind'] as const) {
    if (!body[f]) return bad(`Missing required field '${String(f)}'`);
  }
  // Harden `kind`: coerce off-list LLM labels to a safe default rather than 400.
  if (!ALLOWED_EDITORIAL_KINDS.includes(body.kind)) body.kind = 'explainer';
  if (!SLUG_RE.test(body.slug)) return bad(`Slug '${body.slug}' must be lowercase kebab-case`);

  const art = { ...body, claims: body.claims ?? [], grounding: body.grounding ?? [] } as EditorialArtifact;
  const qa = await runEditorialGate(art as EditorialArtifact & { grounding: GroundingFact[] });
  return {
    jobType: 'editorial',
    targetQuery: body.targetQuery ?? null,
    targetUrl: `/news/${body.slug}`,
    title: body.title,
    payload: { ...body },
    grounding: { facts: body.grounding ?? [] },
    qa,
    llmModel: body.llmModel ?? null,
    tokensIn: body.tokensIn ?? null,
    tokensOut: body.tokensOut ?? null,
    externalId: body.externalId ?? null,
  };
}

/** Validate + citation-gate a Carbon News Brief artifact. */
async function prepNewsBrief(body: NewsBriefArtifact): Promise<BaseRow | Response> {
  for (const f of ['slug', 'title', 'summary', 'bodyMd'] as const) {
    if (!body[f]) return bad(`Missing required field '${String(f)}'`);
  }
  if (!Array.isArray(body.sources) || body.sources.length === 0) {
    return bad('news_brief requires a non-empty sources[] of cited article URLs');
  }
  if (!SLUG_RE.test(body.slug)) return bad(`Slug '${body.slug}' must be lowercase kebab-case`);
  body.kind = 'news_brief';

  const qa = await runNewsBriefGate(body);
  return {
    jobType: 'news_brief',
    targetQuery: body.targetQuery ?? 'carbon-news-brief',
    targetUrl: `/news/${body.slug}`,
    title: body.title,
    payload: { ...body },
    grounding: { sources: body.sources },
    qa,
    llmModel: body.llmModel ?? null,
    tokensIn: body.tokensIn ?? null,
    tokensOut: body.tokensOut ?? null,
    externalId: body.externalId ?? null,
  };
}

/** Validate + gate a batch of extracted regulatory events. */
async function prepRegulatory(body: RegulatoryArtifact): Promise<BaseRow | Response> {
  if (!Array.isArray(body.events) || body.events.length === 0) {
    return bad('regulatory requires a non-empty events[]');
  }
  const qa = await runRegulatoryGate(body);
  // Human-readable digest into summary so the review card shows every event.
  const digest = body.events
    .map((e) => `• ${e.eventDate} — ${e.title}${e.documentNumber ? ` (${e.documentNumber})` : ''} [${e.documentUrl}]`)
    .join('\n');
  return {
    jobType: 'regulatory',
    targetQuery: body.targetQuery ?? 'regulatory-update',
    targetUrl: '/regulatory',
    title: `Regulatory update — ${body.events.length} event(s)`,
    payload: { ...body, kind: 'regulatory', summary: digest },
    grounding: { events: body.events.length },
    qa,
    llmModel: body.llmModel ?? null,
    tokensIn: body.tokensIn ?? null,
    tokensOut: body.tokensOut ?? null,
    externalId: body.externalId ?? null,
  };
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

  let prepared: BaseRow | Response;
  if (body.jobType === 'editorial') {
    prepared = await prepEditorial(body);
  } else if (body.jobType === 'news_brief') {
    prepared = await prepNewsBrief(body);
  } else if (body.jobType === 'regulatory') {
    prepared = await prepRegulatory(body);
  } else {
    const jt = (body as { jobType?: string }).jobType;
    return bad(
      `Apply surface for job_type '${jt}' is not enabled yet — only 'editorial', 'news_brief', and 'regulatory' publish today.`,
    );
  }
  if (prepared instanceof Response) return prepared;

  const baseRow = prepared;
  const qa = baseRow.qa;

  if (!qa.passed) {
    await db.insert(seoJobs).values({ ...baseRow, status: 'qa_failed' });
    return NextResponse.json({ ok: false, published: false, qa }, { status: 422 });
  }

  // Gate passed — park as qa_passed for human Approve/Reject on /admin/seo
  // (WS2a). Approval inserts news_posts + revalidates + pings IndexNow, and for
  // news briefs marks the cited carbon_news_items used (autopilot-actions.ts).
  const [job] = await db
    .insert(seoJobs)
    .values({ ...baseRow, status: 'qa_passed' })
    .returning({ id: seoJobs.id });

  // Ping the admin on Telegram with Approve/Reject buttons (fail-soft).
  if (job?.id) {
    try {
      await notifyReviewQueued({
        id: job.id,
        jobType: baseRow.jobType,
        title: baseRow.title,
        summary: typeof baseRow.payload.summary === 'string' ? baseRow.payload.summary : '',
        body: typeof baseRow.payload.bodyMd === 'string' ? baseRow.payload.bodyMd : null,
      });
    } catch {
      // notification failure must not fail the publish
    }
  }

  return NextResponse.json(
    { ok: true, published: false, queuedForReview: true, status: 'qa_passed', jobId: job?.id ?? null, qa },
    { status: 202 },
  );
}
