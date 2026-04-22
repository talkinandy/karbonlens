// This route exists solely to verify Sentry is receiving events. Safe to trigger repeatedly.
//
// Behaviour:
//   - Unauthenticated requests never reach this handler — `proxy.ts`
//     matches `/api/admin/:path*` and redirects to `/?signin=1`.
//   - Authenticated non-admin users get a 403 so we don't reveal whether
//     the route exists (defence-in-depth behind the middleware gate).
//   - Admin users hit the deliberate `throw` below: Next.js surfaces it
//     as a 500, the `onRequestError` hook forwards it to Sentry.

import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();

  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  // The response is never reached — the throw propagates to Next.js's
  // error boundary and becomes a 500. This is intentional; see the
  // T22 runbook for the Phase B verification flow.
  throw new Error('Sentry test — safe to trigger');
}
