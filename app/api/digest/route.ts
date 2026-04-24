/**
 * POST /api/digest — T17 weekly-digest cron endpoint.
 *
 * Authoritative contract: `docs/stories/T17-weekly-digest-email.md`.
 *
 * Auth: `Authorization: Bearer <DIGEST_CRON_SECRET>` header. Constant-time
 * comparison via `crypto.timingSafeEqual`. Returns:
 *   - 503 if `RESEND_API_KEY` or `DIGEST_CRON_SECRET` env var is missing
 *     (misconfiguration — explicit signal for the operator).
 *   - 401 if the header is absent or the token does not match.
 *   - 200 on success with a per-user summary payload.
 *
 * Dry-run mode (`?dryRun=true`): skips the Resend send, returns the per-user
 * counts that WOULD be sent. Useful for Phase-A verification before any
 * real Resend API key exists.
 *
 * Cron trigger: Monday 00:00 UTC (= 07:00 WIB). T19 installs the curl
 * entry on the VPS; this endpoint only exposes the handler.
 *
 * Observability: emits a single structured-JSON log line to stderr per run
 * so the cron log captures `{ users_processed, emails_sent, skipped,
 * errors, ts }` for post-hoc review.
 *
 * Idempotence: after a successful `sendEmail`, the route calls
 * `markNotificationsDigested` which sets `digested_at = NOW()` on every
 * notification included in the digest. The 7-day window query filters on
 * `digested_at IS NULL`, so re-running the cron in the same week (or near
 * a week boundary) sends 0 emails for already-digested notifications.
 * Dry-run skips the mark so re-runs stay read-only.
 */

import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import {
  buildDigestForUser,
  listOptedInUsers,
  markNotificationsDigested,
  type DigestUser,
} from '@/lib/queries/digest';
import { renderDigestEmail } from '@/lib/email/digest-template';
import { isEmailConfigured, sendEmail } from '@/lib/email/resend';

type UserOutcome = {
  user_id: string;
  email: string;
  status: 'sent' | 'skipped' | 'error' | 'dry-run';
  notification_count: number;
  project_count?: number;
  message_id?: string;
  error?: string;
};

type DigestRunSummary = {
  users_processed: number;
  emails_sent: number;
  skipped: number;
  errors: number;
  dry_run: boolean;
  ran_at: string;
  outcomes: UserOutcome[];
};

// Ensure the route runs on the Node.js runtime (we need `postgres`,
// `crypto.timingSafeEqual`, and stderr logging — none of which work on
// the Edge runtime).
export const runtime = 'nodejs';

/** Constant-time token compare. `crypto.timingSafeEqual` throws on
 * length mismatch, so we pad first to a common length. */
function tokenEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Still perform a constant-time compare against `a` itself to avoid
    // any timing channel from an early length-mismatch return.
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

function getAppUrl(): string {
  const raw = process.env.NEXTAUTH_URL ?? 'https://karbonlens.netlify.app';
  return raw.replace(/\/+$/, '');
}

async function handle(request: Request): Promise<Response> {
  const cronSecret = process.env.DIGEST_CRON_SECRET;
  const url = new URL(request.url);
  const dryRun = url.searchParams.get('dryRun') === 'true';

  // Misconfiguration: surface 503 so the cron logs show an unambiguous
  // signal instead of a confusing 500 stack trace.
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'Digest not configured — DIGEST_CRON_SECRET missing' },
      { status: 503 },
    );
  }
  if (!dryRun && !isEmailConfigured()) {
    return NextResponse.json(
      { error: 'Digest not configured — RESEND_API_KEY missing' },
      { status: 503 },
    );
  }

  const provided = extractBearer(request);
  if (!provided || !tokenEquals(provided, cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appUrl = getAppUrl();
  const users: DigestUser[] = await listOptedInUsers();

  const outcomes: UserOutcome[] = [];
  let emails_sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of users) {
    try {
      const bundle = await buildDigestForUser(user);
      if (!bundle || bundle.totalCount === 0) {
        skipped += 1;
        outcomes.push({
          user_id: user.id,
          email: user.email,
          status: 'skipped',
          notification_count: 0,
        });
        continue;
      }

      if (dryRun) {
        outcomes.push({
          user_id: user.id,
          email: user.email,
          status: 'dry-run',
          notification_count: bundle.totalCount,
          project_count: bundle.projectCount,
        });
        continue;
      }

      const rendered = renderDigestEmail({ bundle, appUrl });
      const result = await sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (result.ok) {
        emails_sent += 1;
        // Mark all notifications in this digest as digested so they are
        // excluded from the next run (idempotence — audit F2).
        await markNotificationsDigested(user.id, bundle.allIds);
        outcomes.push({
          user_id: user.id,
          email: user.email,
          status: 'sent',
          notification_count: bundle.totalCount,
          project_count: bundle.projectCount,
          message_id: result.id,
        });
      } else {
        errors += 1;
        outcomes.push({
          user_id: user.id,
          email: user.email,
          status: 'error',
          notification_count: bundle.totalCount,
          error: result.error,
        });
      }
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      outcomes.push({
        user_id: user.id,
        email: user.email,
        status: 'error',
        notification_count: 0,
        error: msg,
      });
    }
  }

  const summary: DigestRunSummary = {
    users_processed: users.length,
    emails_sent,
    skipped,
    errors,
    dry_run: dryRun,
    ran_at: new Date().toISOString(),
    outcomes,
  };

  // One structured-JSON line per run. `console.error` goes to stderr on
  // both Node and Netlify's function runtime so the cron log captures it.
  const logPayload = {
    event: 'digest_run',
    users_processed: summary.users_processed,
    emails_sent: summary.emails_sent,
    skipped: summary.skipped,
    errors: summary.errors,
    dry_run: summary.dry_run,
    ran_at: summary.ran_at,
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(logPayload));

  return NextResponse.json(summary, { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
