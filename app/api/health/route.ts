/**
 * GET /api/health — DB connectivity probe.
 *
 * Positive: `SELECT 1` succeeds → 200 `{ ok: true, db: 'connected' }`.
 * Negative: any failure → 503 `{ ok: false, db: 'error', error: <classifier> }`
 *   where <classifier> is one of 'connection refused' | 'auth failed' |
 *   'unknown'. Raw error messages are never returned — they may leak the
 *   connection string, Postgres version banner, or a stack trace.
 *
 * `dynamic = 'force-dynamic'` prevents Next.js from invoking this at build
 * time (which would fail when the DB is not available during `next build`).
 */

import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function classifyDbError(err: unknown): 'connection refused' | 'auth failed' | 'unknown' {
  // Drizzle wraps driver errors as DrizzleQueryError with the original
  // postgres.js error on `.cause`. Walk the chain so we classify the root
  // cause, not the generic "Failed query: ..." wrapper message.
  const messages: string[] = [];
  let current: unknown = err;
  for (let i = 0; i < 5 && current; i++) {
    const m = (current as { message?: unknown })?.message;
    if (typeof m === 'string') messages.push(m.toLowerCase());
    current = (current as { cause?: unknown })?.cause;
  }
  const msg = messages.join(' | ');
  if (msg.includes('econnrefused')) return 'connection refused';
  if (msg.includes('connection') && (msg.includes('refused') || msg.includes('reset'))) {
    return 'connection refused';
  }
  if (msg.includes('password') || msg.includes('authentication')) return 'auth failed';
  return 'unknown';
}

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: 'connected' });
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: 'error', error: classifyDbError(err) },
      { status: 503 },
    );
  }
}
