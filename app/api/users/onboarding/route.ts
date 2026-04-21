import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';

const ALLOWED_PERSONAS = new Set([
  'buyer',
  'broker',
  'corporate',
  'researcher',
  'developer',
  'other',
]);

type Body = {
  persona?: unknown;
  organization?: unknown;
};

/**
 * POST /api/users/onboarding
 *
 * Body: { persona: string; organization?: string | null }
 * Requires an authenticated session.
 *
 * Writes persona + organization to the caller's users row. Idempotent.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { persona, organization } = body;

  if (typeof persona !== 'string' || !ALLOWED_PERSONAS.has(persona)) {
    return NextResponse.json(
      { error: 'invalid persona; must be one of buyer|broker|corporate|researcher|developer|other' },
      { status: 400 },
    );
  }

  let organizationValue: string | null = null;
  if (organization === null || organization === undefined || organization === '') {
    organizationValue = null;
  } else if (typeof organization === 'string') {
    const trimmed = organization.trim();
    if (trimmed.length > 200) {
      return NextResponse.json({ error: 'organization too long' }, { status: 400 });
    }
    organizationValue = trimmed === '' ? null : trimmed;
  } else {
    return NextResponse.json({ error: 'organization must be a string' }, { status: 400 });
  }

  await db
    .update(users)
    .set({ persona, organization: organizationValue })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
