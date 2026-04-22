/**
 * app/admin/layout.tsx — T21 auth/admin gate for the admin area.
 *
 * The `proxy.ts` middleware already blocks unauthenticated requests to
 * `/admin/*` (307 → `/?signin=1`). This layout is the second line of
 * defence: it loads the session and redirects non-admin users to `/`.
 *
 * Choice of redirect-to-root (not 404 via `notFound()`) diverges from the
 * original story draft (AC-2) per the revised implementation brief: non-admins
 * get a silent redirect to the landing page. This keeps the admin area
 * non-discoverable to casual poking while avoiding a confusing 404 for a
 * mis-clicked internal link.
 *
 * The red banner is deliberately loud so the admin never confuses the
 * admin area with the public product.
 */

import 'server-only';

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!isAdmin(session)) {
    redirect('/');
  }

  return (
    <div>
      <div
        role="banner"
        aria-label="Admin area warning"
        style={{
          background: '#b91c1c',
          color: '#fff',
          fontWeight: 700,
          padding: '6px 16px',
          fontSize: '0.8rem',
          letterSpacing: '0.08em',
          textAlign: 'center',
        }}
      >
        ADMIN — internal tooling only
      </div>
      {children}
    </div>
  );
}
