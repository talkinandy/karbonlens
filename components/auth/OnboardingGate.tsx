import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { users } from '@/lib/schema';
import { OnboardingModal } from './OnboardingModal';

/**
 * Server-side gate for the first-login onboarding modal.
 *
 * Visibility logic (per spec §3 item 6):
 *   1. If no authenticated session -> hide.
 *   2. If `users.persona` is non-null -> hide (already onboarded).
 *   3. If cookie `kl_onboarding_snooze_until` is a future Unix timestamp -> hide.
 *   4. Otherwise -> render the modal.
 *
 * Runs per request in the (app) layout; cost is one indexed SELECT on
 * users by UUID (primary-key lookup) — acceptable for v0.1 per spec §3.
 */
export async function OnboardingGate() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const cookieStore = await cookies();
  const snooze = cookieStore.get('kl_onboarding_snooze_until')?.value;
  if (snooze) {
    const until = Number.parseInt(snooze, 10);
    if (Number.isFinite(until) && until > Math.floor(Date.now() / 1000)) {
      return null;
    }
  }

  const row = await db
    .select({ persona: users.persona })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (row[0]?.persona) return null;

  return <OnboardingModal />;
}
