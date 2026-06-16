/**
 * lib/seo/autopilot/auth.ts — bearer auth for the autopilot endpoints.
 *
 * Both /api/seo/opportunities and /api/seo/autopilot/publish authenticate N8N
 * with `Authorization: Bearer <SEO_AUTOPILOT_SECRET>`, constant-time compared.
 * Same pattern as /api/internal/revalidate-sitemap and /api/digest.
 */

import crypto from 'node:crypto';

function tokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still run a compare to keep timing uniform, then fail.
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

export type AuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

/** Returns {ok:true} only if the request carries the configured secret. */
export function authorizeAutopilot(request: Request): AuthResult {
  const secret = process.env.SEO_AUTOPILOT_SECRET;
  if (!secret) {
    return { ok: false, status: 503, error: 'Not configured — SEO_AUTOPILOT_SECRET missing' };
  }
  const provided = extractBearer(request);
  if (!provided || !tokenEquals(provided, secret)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}
