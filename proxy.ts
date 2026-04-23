/**
 * proxy.ts — route protection for KarbonLens v0.1
 *
 * Policy (2026-04-22 — opened up):
 *   Public data is public. Only personalised surfaces require sign-in.
 *
 *   • /projects, /projects/[slug], /prices, /regulatory — full public access.
 *     These render market intelligence on public-source data (Verra, GFW,
 *     IDXCarbon, regulatory seed) that isn't user-specific. Unauthed visitors
 *     see exactly what authed users see on these screens.
 *
 *   • /alerts — personalised notifications inbox. Rows are scoped to the
 *     signed-in user via SQL `WHERE user_id = session.user.id`. Must be gated.
 *
 *   • /admin/*, /api/admin/* — admin queue + audit surfaces. Gated at proxy
 *     level (redirects unauthed to `/?signin=1`); route handlers additionally
 *     enforce `isAdmin(session)` via `lib/admin.ts`.
 *
 * The `auth()` wrapper is still applied so authed users' `req.auth` flows
 * through to route handlers and server components that need to know sign-in
 * state (e.g., the top-nav `<UserMenu>` vs `<SignInButton>` decision on
 * `/projects`). Public routes simply pass through without a session check.
 *
 * `/api/auth/[...nextauth]` and `/api/health` are deliberately outside the
 * matcher.
 */

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (!req.auth) {
    const url = new URL('/', req.nextUrl.origin);
    url.searchParams.set('signin', '1');
    // Preserve the original destination so the sign-in modal can round-trip
    // the user back to where they were trying to go (e.g. /alerts, /admin/queue).
    url.searchParams.set('from', req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/alerts/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
};
