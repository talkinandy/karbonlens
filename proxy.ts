/**
 * middleware.ts — route protection for KarbonLens v0.1
 *
 * Strategy: clean matcher listing the four protected route groups (see
 * `config.matcher` below). Inside the middleware, the request path is
 * checked against a small set of public project slugs — requests to those
 * slugs are allowed through without a session. Any other matched request
 * without an active session is redirected to `/?signin=1`, which opens
 * the sign-in modal on the landing page.
 *
 * Public slugs source: `lib/mock-data.ts` `mockProjects` (T03 §3 — the
 * canonical v0.1 public project list).
 *
 * The `/api/auth/[...nextauth]` route is deliberately NOT in the matcher
 * so the OAuth callback can complete before any session exists. Public
 * API routes (`/api/regulatory`, `/api/map/projects`) are likewise
 * outside the matcher.
 */

import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

// Reconciled 2026-04-21 (T05.1 follow-up): the prior values were placeholder
// slugs from the T05 spec draft (katingan-peatland, sumatra-merang-peat,
// rimba-raya) that never matched any real DB row after T06's canonical
// slugger landed. The three real flagship slugs are below — they match
// `SELECT slug FROM projects WHERE slug LIKE '%katingan%' OR LIKE
// '%rimba-raya%' OR LIKE '%sumatra-merang%'`. Unauthenticated visitors
// see partial detail (T12 page-level `isAuthed` hides alerts + scores).
const PUBLIC_PROJECT_SLUGS = new Set([
  'katingan-peatland-restoration-and-conservation-project',
  'sumatra-merang-peatland-project-smpp',
  'rimba-raya-biodiversity-reserve-project',
]);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Public project detail pages bypass auth.
  const projectMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (projectMatch && PUBLIC_PROJECT_SLUGS.has(projectMatch[1])) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const url = new URL('/', req.nextUrl.origin);
    url.searchParams.set('signin', '1');
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/projects/:path*',
    '/prices/:path*',
    '/regulatory/:path*',
    '/alerts/:path*',
  ],
};
