/**
 * scripts/digest-preview.ts — render a sample digest email to stdout.
 *
 * Run with `tsx` (already in devDependencies via drizzle-kit). The path
 * alias `@/` and extensionless imports are supported out-of-the-box.
 *
 * Two modes:
 *   1. Fixture mode (default): builds a synthetic DigestBundle with 3
 *      projects and 6 notifications, renders HTML + plain text, writes
 *      HTML to stdout. Requires NO database connection and NO env vars.
 *      Useful for Phase-A verification (`tsc`/build + content grep).
 *
 *   2. Live mode (`--user <uuid>`): connects to the DB, builds the bundle
 *      for the given user via `buildDigestForUser`, renders HTML to
 *      stdout. Requires `DATABASE_URL`.
 *
 * Flags:
 *   --text          Emit the plain-text version instead of HTML.
 *   --subject       Emit only the subject line (for grep assertions).
 *   --user <uuid>   Live-query mode for the given user id.
 *
 * Usage:
 *   npx tsx scripts/digest-preview.ts > out.html
 *   npx tsx scripts/digest-preview.ts --text
 *   npx tsx scripts/digest-preview.ts --subject
 *   npx tsx scripts/digest-preview.ts --user <uuid>
 *
 * Intentionally does not send email; Resend is never imported in the hot
 * path (it is never imported at all in fixture mode).
 */

import { renderDigestEmail } from '@/lib/email/digest-template';
import type {
  DigestBundle,
  DigestNotificationItem,
} from '@/lib/queries/digest';

type Mode = 'html' | 'text' | 'subject';

type Args = {
  mode: Mode;
  userId: string | null;
};

function parseArgs(argv: string[]): Args {
  let mode: Mode = 'html';
  let userId: string | null = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--text') mode = 'text';
    else if (a === '--subject') mode = 'subject';
    else if (a === '--user') {
      userId = argv[i + 1] ?? null;
      i += 1;
    }
  }
  return { mode, userId };
}

function fixtureBundle(): DigestBundle {
  const now = new Date('2026-04-21T00:00:00.000Z');
  const mk = (
    idx: number,
    type: string,
    title: string,
    description: string,
    project_id: string | null,
    project_slug: string | null,
    project_name: string | null,
    url: string | null,
  ): DigestNotificationItem => {
    const created = new Date(now.getTime() - idx * 8 * 60 * 60 * 1000);
    return {
      id: `00000000-0000-0000-0000-${String(idx).padStart(12, '0')}`,
      type,
      title,
      description,
      project_id,
      project_slug,
      project_name,
      url,
      created_at: created.toISOString(),
    };
  };

  const items: DigestNotificationItem[] = [
    mk(0, 'reversal', 'Deforestation alert — Katingan peatland', '0.4 ha loss detected 6 km inside project buffer; confidence high (GLAD).', 'p1', 'katingan-peatland', 'Katingan Peatland Restoration', '/projects/katingan-peatland'),
    mk(1, 'reversal', 'Deforestation alert — Rimba Raya', '1.2 ha loss detected 2 km inside buffer.', 'p2', 'rimba-raya', 'Rimba Raya Biodiversity Reserve', '/projects/rimba-raya'),
    mk(2, 'regulatory', 'MoEF issues draft guidance on peatland carbon', 'Public consultation open until 2026-05-15.', null, null, null, '/regulatory'),
    mk(3, 'reversal', 'Deforestation alert — Katingan peatland', '0.6 ha loss detected 4 km inside buffer.', 'p1', 'katingan-peatland', 'Katingan Peatland Restoration', '/projects/katingan-peatland'),
    mk(4, 'price', 'IDXCarbon monthly close — IDR 48,000/tCO₂e', 'Down 3% MoM; volume +12%.', null, null, null, '/prices'),
    mk(5, 'reversal', 'Deforestation alert — Kopi Lestari Agroforestry', '0.1 ha loss detected inside buffer.', 'p3', 'kopi-lestari', 'Kopi Lestari Agroforestry', '/projects/kopi-lestari'),
  ];

  const byType: Record<string, number> = {};
  for (const it of items) byType[it.type] = (byType[it.type] ?? 0) + 1;

  const groupMap = new Map<string, {
    project_id: string | null;
    project_slug: string | null;
    project_name: string;
    count: number;
    items: DigestNotificationItem[];
  }>();
  for (const it of items) {
    const key = it.project_id ?? '__null__';
    let g = groupMap.get(key);
    if (!g) {
      g = {
        project_id: it.project_id,
        project_slug: it.project_slug,
        project_name: it.project_name ?? 'Other',
        count: 0,
        items: [],
      };
      groupMap.set(key, g);
    }
    g.count += 1;
    g.items.push(it);
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => b.count - a.count);

  return {
    user: {
      id: 'fixture-user',
      email: 'andy@fmg.co.id',
      name: 'Andy Wuffet',
    },
    totalCount: items.length,
    projectCount: groups.filter((g) => g.project_id !== null).length,
    byType,
    items,
    groups,
    windowStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    windowEnd: now.toISOString().slice(0, 10),
  };
}

async function liveBundle(userId: string): Promise<DigestBundle | null> {
  // Dynamic import so fixture-mode doesn't eagerly pull in the DB client
  // (which throws at module load time when DATABASE_URL is unset).
  const { buildDigestForUser, getUserById } = await import('@/lib/queries/digest');
  const user = await getUserById(userId);
  if (!user) {
    process.stderr.write(`User not found: ${userId}\n`);
    process.exit(2);
  }
  return buildDigestForUser(user);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const appUrl = process.env.NEXTAUTH_URL ?? 'https://karbonlens.netlify.app';

  const bundle = args.userId ? await liveBundle(args.userId) : fixtureBundle();
  if (!bundle) {
    process.stderr.write('No notifications in window — digest would be skipped.\n');
    process.exit(1);
  }

  const rendered = renderDigestEmail({ bundle, appUrl });
  if (args.mode === 'subject') {
    process.stdout.write(rendered.subject + '\n');
  } else if (args.mode === 'text') {
    process.stdout.write(rendered.text);
  } else {
    process.stdout.write(rendered.html);
  }
}

main().catch((e) => {
  process.stderr.write(`preview failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
