/**
 * lib/email/resend.ts — thin wrapper around the Resend SDK.
 *
 * The Resend client is instantiated lazily so routes that never call `send()`
 * (or run in environments without `RESEND_API_KEY`) do not throw at import
 * time. The wrapper also exposes a `isEmailConfigured()` helper that the
 * digest route uses to short-circuit to 503 without touching Resend.
 *
 * From-address: v0.1 uses Resend's default sandbox sender
 * (`onboarding@resend.dev`) because KarbonLens does not yet own a verified
 * domain. When `karbonlens.id` (or equivalent) is added to Resend, swap the
 * `FROM_ADDRESS` constant or lift it to `DIGEST_FROM_ADDRESS` env var in a
 * follow-up.
 */

import { Resend } from 'resend';

const DEFAULT_FROM = 'KarbonLens <onboarding@resend.dev>';

let cached: Resend | null = null;

/** Returns true when `RESEND_API_KEY` is set and non-empty. */
export function isEmailConfigured(): boolean {
  return typeof process.env.RESEND_API_KEY === 'string'
    && process.env.RESEND_API_KEY.length > 0;
}

/** Returns the shared Resend client, or throws if unconfigured. Call
 * `isEmailConfigured()` first in endpoint paths that want to respond 503
 * instead of bubbling an exception. */
export function getResendClient(): Resend {
  if (!isEmailConfigured()) {
    throw new Error('RESEND_API_KEY is not set — email sending is not configured.');
  }
  if (!cached) {
    cached = new Resend(process.env.RESEND_API_KEY);
  }
  return cached;
}

export type SendEmailArgs = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  from?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

/** Send a single email via Resend. Returns a result object rather than
 * throwing — callers iterate over multiple recipients and must not be
 * aborted by one bad address. */
export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  if (!isEmailConfigured()) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  try {
    const resend = getResendClient();
    const response = await resend.emails.send({
      from: args.from ?? DEFAULT_FROM,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    // Resend SDK returns { data, error } shape. On error, `data` is null
    // and `error` carries `{ name, message }`.
    if (response.error) {
      return { ok: false, error: response.error.message ?? response.error.name ?? 'unknown' };
    }
    if (!response.data?.id) {
      return { ok: false, error: 'Resend returned no id' };
    }
    return { ok: true, id: response.data.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
