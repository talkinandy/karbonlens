/**
 * POST /api/internal/revalidate-sitemap — SEO Phase 1 (B3).
 *
 * Called by `scripts/publish-weekly-wrap.ts` after a successful news_posts
 * insert so the public /sitemap.xml picks up the new /news/<slug> URL
 * without waiting for the 600s ISR revalidation tick. Bing/Yandex
 * IndexNow has already been pinged at this point, but they will refuse to
 * re-fetch a URL that is not yet in the sitemap.
 *
 * Auth: `Authorization: Bearer <SITEMAP_REVALIDATE_SECRET>`. Constant-time
 * compare. Same pattern as /api/digest.
 *
 * Idempotent: revalidatePath is a no-op if no listeners are subscribed.
 * Safe to call repeatedly.
 */

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import crypto from 'node:crypto';

export const runtime = 'nodejs';

function tokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    crypto.timingSafeEqual(a, a);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function extractBearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.SITEMAP_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'Not configured — SITEMAP_REVALIDATE_SECRET missing' },
      { status: 503 },
    );
  }

  const provided = extractBearer(request);
  if (!provided || !tokenEquals(provided, secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/sitemap.xml');
  return NextResponse.json({
    ok: true,
    path: '/sitemap.xml',
    revalidated_at: new Date().toISOString(),
  });
}
