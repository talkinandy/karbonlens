/**
 * Server actions for the SEO Autopilot review queue (admin only, WS2a).
 *
 * The publish endpoint parks gate-passed artifacts as seo_jobs.status =
 * 'qa_passed'. These actions are the human gate: Approve inserts the post into
 * news_posts (then revalidates + pings IndexNow, exactly as the old auto-publish
 * path did), Reject marks it 'rejected'. Both are admin-gated.
 */

'use server';

import { revalidatePath } from 'next/cache';
import { eq, inArray, sql } from 'drizzle-orm';

import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { carbonNewsItems, newsPosts, regulatoryEvents, seoJobs } from '@/lib/schema';
import { pingIndexNow } from '@/lib/seo/indexnow';
import { DEFAULT_AUTHOR_SLUG } from '@/lib/authors';

async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session)) throw new Error('Forbidden');
}

function jobId(formData: FormData): number {
  const id = Number(String(formData.get('id') ?? '').trim());
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid job id');
  return id;
}

export async function approveAutopilotJob(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = jobId(formData);

  const [job] = await db.select().from(seoJobs).where(eq(seoJobs.id, id)).limit(1);
  if (!job) throw new Error('Job not found');
  if (job.status !== 'qa_passed') throw new Error(`Job ${id} is not awaiting review (${job.status})`);

  const p = job.payload as Record<string, unknown>;

  // Regulatory jobs insert into regulatory_events (not news_posts).
  if (job.jobType === 'regulatory') {
    const events = Array.isArray(p.events) ? (p.events as Array<Record<string, unknown>>) : [];
    let insertedCount = 0;
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
      insertedCount += 1;
    }
    await db
      .update(seoJobs)
      .set({ status: 'published', resultRef: `${insertedCount} events`, updatedAt: new Date() })
      .where(eq(seoJobs.id, id));
    revalidatePath('/regulatory');
    revalidatePath('/admin/seo');
    return;
  }

  const slug = String(p.slug ?? '');
  const kind = String(p.kind ?? '');
  const title = String(p.title ?? '');
  const summary = String(p.summary ?? '');
  const bodyMd = String(p.bodyMd ?? '');
  if (!slug || !kind || !title || !summary || !bodyMd) {
    throw new Error('Stored artifact is incomplete');
  }

  // Insert the post; ON CONFLICT (slug) guards a slug taken since the gate ran.
  const inserted = await db
    .insert(newsPosts)
    .values({
      slug,
      kind,
      title,
      summary,
      bodyMd,
      authorSlug: DEFAULT_AUTHOR_SLUG,
      factsJson: { autopilot: true, targetQuery: job.targetQuery ?? null } as Record<
        string,
        unknown
      >,
    })
    .onConflictDoNothing()
    .returning({ id: newsPosts.id });

  if (inserted.length === 0) {
    await db
      .update(seoJobs)
      .set({ status: 'skipped', error: 'slug already published (conflict)', updatedAt: new Date() })
      .where(eq(seoJobs.id, id));
    revalidatePath('/admin/seo');
    return;
  }

  // Make it crawlable, then ping IndexNow (failure must not fail the approval).
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

  // For a Carbon News Brief: mark the cited items used so the next brief only
  // covers fresh news.
  if (job.jobType === 'news_brief') {
    const sources = Array.isArray(p.sources)
      ? (p.sources as unknown[]).filter((u): u is string => typeof u === 'string')
      : [];
    if (sources.length > 0) {
      await db
        .update(carbonNewsItems)
        .set({ usedAt: new Date() })
        .where(inArray(carbonNewsItems.url, sources));
    }
  }

  revalidatePath('/admin/seo');
}

export async function rejectAutopilotJob(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = jobId(formData);
  await db
    .update(seoJobs)
    .set({ status: 'rejected', updatedAt: new Date() })
    .where(eq(seoJobs.id, id));
  revalidatePath('/admin/seo');
}
