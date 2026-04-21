/**
 * Module augmentation — adds `id` to `session.user` so
 * downstream server components and API routes can access the authenticated
 * user's UUID without an extra DB lookup. The value is populated in the
 * `session` callback in `lib/auth.ts`.
 */

import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}
