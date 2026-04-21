/**
 * lib/auth.ts — NextAuth v5 configuration for KarbonLens v0.1
 *
 * - Provider: Google (profile + email scopes only, v5 defaults).
 * - Adapter: @auth/drizzle-adapter v1.11.2, explicit table bindings.
 * - Session strategy: `database` (sessions persisted in Postgres via the
 *   Drizzle adapter; one SELECT per authed request — acceptable for v0.1,
 *   revisit if traffic warrants in v0.2).
 * - Session callback: copies `user.id` from the adapter-loaded user onto
 *   `session.user.id` so downstream server components and route handlers can
 *   read the authenticated UUID without another DB lookup. See
 *   `types/next-auth.d.ts` for the session type augmentation.
 *
 * Table bindings are explicit (not auto-detected) because the adapter's
 * auto-detect path declares its own `pgTable('user', ...)` schema under
 * singular names (`user`/`account`/`session`/`verificationToken`) which
 * would bypass migration 001's plural table names. We pass our Drizzle
 * tables from `./schema` so the adapter writes to the DB-migrated tables.
 *
 * The adapter's TypeScript schema constraint types `accounts.expires_at`
 * as `PgInteger`; our schema uses `bigint({ mode: 'number' })` which
 * produces a JS `number` at runtime (matching the adapter's write path)
 * but is typed as PgBigInt53. The schema map is passed via a local
 * structural assertion to reconcile the shapes — verified safe because
 * the adapter's pg.js writes integer-sized Unix timestamps (seconds) only.
 */

import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import type { Adapter } from '@auth/core/adapters';
import { db } from './db';
import { users, accounts, sessions, verificationTokens } from './schema';

// Explicit table bindings — required because auto-detect uses the
// adapter's private singular-named tables (`user`/`account`/...) instead
// of the plural DB-migrated tables. The `DefaultPostgresSchema` type is
// not exported via a package export path of `@auth/drizzle-adapter`, so
// we cast the call site to the returned `Adapter` contract. Runtime
// column-shape differences (e.g. `accounts.expires_at` is typed here as
// PgBigInt53 but PgInteger in the adapter's pg schema constraint) are
// safe: both produce JS `number` and the adapter writes Unix timestamps
// in seconds. See `lib/schema.ts` for the contract with adapter v1.11.2
// snake_case token field names.
const adapterSchema = {
  usersTable: users,
  accountsTable: accounts,
  sessionsTable: sessions,
  verificationTokensTable: verificationTokens,
};

const adapter: Adapter = (DrizzleAdapter as unknown as (
  db: unknown,
  schema: unknown,
) => Adapter)(db, adapterSchema);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [Google],
  session: { strategy: 'database' },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
