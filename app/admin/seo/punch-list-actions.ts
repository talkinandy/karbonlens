/**
 * Server actions for the SEO punch-list tile (admin only).
 */

'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { seoTasks, type SeoTaskStatus } from '@/lib/schema';
import { sql } from 'drizzle-orm';

const ALLOWED_STATUSES: SeoTaskStatus[] = ['pending', 'in_progress', 'completed', 'wontfix'];

export async function updateSeoTaskStatus(formData: FormData): Promise<void> {
  const session = await auth();
  if (!isAdmin(session)) {
    throw new Error('Forbidden');
  }
  const code = String(formData.get('code') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim() as SeoTaskStatus;
  if (!code || !ALLOWED_STATUSES.includes(status)) {
    throw new Error('Invalid input');
  }
  const closedAt = status === 'completed' || status === 'wontfix' ? new Date() : null;
  const closedBy = closedAt ? (session?.user?.email ?? null) : null;

  await db
    .insert(seoTasks)
    .values({ code, status, closedAt, closedBy })
    .onConflictDoUpdate({
      target: seoTasks.code,
      set: {
        status,
        closedAt: sql`${closedAt}`,
        closedBy: sql`${closedBy}`,
      },
    });

  revalidatePath('/admin/seo');
}
