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
  //
  // postgres.js wraps ECONNREFUSED inside an AggregateError whose `.message`
  // is empty; the code lives on `err.cause.code` and/or `err.cause.errors[].code`.
  // So we must inspect `.code` fields alongside messages — the previous
  // message-only walk missed this case (audit B2, 2026-04-21).
  const signals: string[] = [];
  let current: unknown = err;
  for (let i = 0; i < 6 && current; i++) {
    const c = current as {
      message?: unknown;
      code?: unknown;
      errors?: unknown;
      cause?: unknown;
    };
    if (typeof c.message === 'string') signals.push(c.message.toLowerCase());
    if (typeof c.code === 'string') signals.push(c.code.toLowerCase());
    if (Array.isArray(c.errors)) {
      for (const e of c.errors) {
        const sub = e as { code?: unknown; message?: unknown };
        if (typeof sub?.code === 'string') signals.push(sub.code.toLowerCase());
        if (typeof sub?.message === 'string') signals.push(sub.message.toLowerCase());
      }
    }
    current = c.cause;
  }
  const signal = signals.join(' | ');
  if (signal.includes('econnrefused') || signal.includes('econnreset')) {
    return 'connection refused';
  }
  if (signal.includes('connection') && (signal.includes('refused') || signal.includes('reset'))) {
    return 'connection refused';
  }
  if (signal.includes('password') || signal.includes('authentication')) return 'auth failed';
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
