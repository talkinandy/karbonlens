/**
 * lib/seo/autopilot/review.ts — shared approve/reject core for the review queue.
 *
 * The dashboard server actions (admin-gated) and the Telegram webhook
 * (allowed-id-gated) both call these. Auth is the caller's responsibility;
 * these just apply the change and return a result (never throw on a normal
 * "already actioned" case, so the caller can report it cleanly).
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { carbonNewsItems, newsPosts, regulatoryEvents, seoJobs } from '@/lib/schema';
import { pingIndexNow } from '@/lib/seo/indexnow';
import { DEFAULT_AUTHOR_SLUG } from '@/lib/authors';

export type ReviewResult = { ok: boolean; status: string; detail: string };

export async function approveJob(id: number): Promise<ReviewResult> {
  const [job] = await db.select().from(seoJobs).where(eq(seoJobs.id, id)).limit(1);
  if (!job) return { ok: false, status: 'not_found', detail: `Job ${id} not found` };
  if (job.status !== 'qa_passed') {
    return { ok: false, status: job.status, detail: `Job ${id} is already ${job.status}` };
  }
  const p = job.payload as Record<string, unknown>;

  // Regulatory: insert deduped events into regulatory_events.
  if (job.jobType === 'regulatory') {
    const events = Array.isArray(p.events) ? (p.events as Array<Record<string, unknown>>) : [];
    let inserted = 0;
    for (const e of events) {
      const title = String(e.title ?? '').trim();
      const eventDate = String(e.eventDate ?? '').trim();
      if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue;
      const docNum = e.documentNumber ? String(e.documentNumber).trim() : '';
      const dup = (await db.execute(sql`
        SELECT 1 FROM regulatory_events
        WHERE (${docNum} <> '' AND lower(document_number) = lower(${docNum}))
           OR lower(title) = lower(${title})
        LIMIT 1
      `)) as unknown as unknown[];
      if (dup.length > 0) continue;
      await db.insert(regulatoryEvents).values({
        eventDate,
        ministry: e.ministry ? String(e.ministry) : null,
        documentType: e.documentType ? String(e.documentType) : null,
        documentNumber: docNum || null,
        title,
        documentUrl: e.documentUrl ? String(e.documentUrl) : null,
        summaryEn: e.summaryEn ? String(e.summaryEn) : null,
        summaryId: e.summaryId ? String(e.summaryId) : null,
        importance: e.importance ? String(e.importance) : null,
        tags: Array.isArray(e.tags) ? (e.tags as unknown[]).map(String) : null,
        isUpcoming: e.isUpcoming === true,
      });
      inserted += 1;
    }
    await db
      .update(seoJobs)
      .set({ status: 'published', resultRef: `${inserted} events`, updatedAt: new Date() })
      .where(eq(seoJobs.id, id));
    revalidatePath('/regulatory');
    revalidatePath('/admin/seo');
    return { ok: true, status: 'published', detail: `Added ${inserted} regulatory event(s) to /regulatory` };
  }

  // Editorial / data report / news brief → insert news_posts.
  const slug = String(p.slug ?? '');
  const kind = String(p.kind ?? '');
  const title = String(p.title ?? '');
  const summary = String(p.summary ?? '');
  const bodyMd = String(p.bodyMd ?? '');
  if (!slug || !kind || !title || !summary || !bodyMd) {
    return { ok: false, status: 'error', detail: 'Stored artifact is incomplete' };
  }

  const ins = await db
    .insert(newsPosts)
    .values({
      slug, kind, title, summary, bodyMd,
      authorSlug: DEFAULT_AUTHOR_SLUG,
      factsJson: { autopilot: true, targetQuery: job.targetQuery ?? null } as Record<string, unknown>,
    })
    .onConflictDoNothing()
    .returning({ id: newsPosts.id });

  if (ins.length === 0) {
    await db
      .update(seoJobs)
      .set({ status: 'skipped', error: 'slug already published (conflict)', updatedAt: new Date() })
      .where(eq(seoJobs.id, id));
    revalidatePath('/admin/seo');
    return { ok: false, status: 'skipped', detail: `Slug '${slug}' already published` };
  }

  revalidatePath('/sitemap.xml');
  revalidatePath('/news');
  revalidatePath(`/news/${slug}`);
  const base = process.env.NEXTAUTH_URL ?? 'https://karbonlens.com';
  try {
    await pingIndexNow([`${base}/news/${slug}`, `${base}/news`]);
  } catch {
    // non-fatal
  }
  await db
    .update(seoJobs)
    .set({ status: 'published', resultRef: slug, updatedAt: new Date() })
    .where(eq(seoJobs.id, id));

  if (job.jobType === 'news_brief') {
    const sources = Array.isArray(p.sources)
      ? (p.sources as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    if (sources.length > 0) {
      await db.update(carbonNewsItems).set({ usedAt: new Date() }).where(inArray(carbonNewsItems.url, sources));
    }
  }
  revalidatePath('/admin/seo');
  return { ok: true, status: 'published', detail: `Published /news/${slug}` };
}

export async function rejectJob(id: number): Promise<ReviewResult> {
  const [job] = await db.select().from(seoJobs).where(eq(seoJobs.id, id)).limit(1);
  if (!job) return { ok: false, status: 'not_found', detail: `Job ${id} not found` };
  if (job.status !== 'qa_passed') {
    return { ok: false, status: job.status, detail: `Job ${id} is already ${job.status}` };
  }
  await db.update(seoJobs).set({ status: 'rejected', updatedAt: new Date() }).where(eq(seoJobs.id, id));
  revalidatePath('/admin/seo');
  return { ok: true, status: 'rejected', detail: `Job ${id} rejected` };
}
