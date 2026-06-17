/**
 * Server actions for the SEO Autopilot review queue (admin only, WS2a).
 *
 * Thin admin-gated wrappers over the shared approve/reject core in
 * lib/seo/autopilot/review.ts (also used by the Telegram webhook).
 */

'use server';

import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { approveJob, rejectJob } from '@/lib/seo/autopilot/review';

async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session)) throw new Error('Forbidden');
}

function jobId(formData: FormData): number {
  const id = Number(String(formData.get('id') ?? '').trim());
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid job id');
  return id;
}

export async function approveAutopilotJob(formData: FormData): Promise<void> {
  await requireAdmin();
  await approveJob(jobId(formData));
}

export async function rejectAutopilotJob(formData: FormData): Promise<void> {
  await requireAdmin();
  await rejectJob(jobId(formData));
}
