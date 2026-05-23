/**
 * lib/schema.ts — Drizzle schema for KarbonLens v0.1
 *
 * Mirrors `scrapers/migrations/001_init.sql` (the SQL source of truth).
 * Canonical reference: `docs/architecture.md` §3.
 *
 * Ownership: T04. T05 adds the NextAuth DrizzleAdapter in lib/auth.ts which
 * consumes the auth table definitions below (users / accounts / sessions /
 * verificationTokens). Field names must match adapter v5 camelCase
 * expectations — see the mapping enumerated in T04 §5.
 *
 * Migrations are applied via plain `psql -f scrapers/migrations/*.sql`.
 * Do NOT run `drizzle-kit generate` or `drizzle-kit push` — see
 * `drizzle.config.ts` for the policy.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

// Canonical `ScoreComponents` type is defined in `./score` (T09). The former
// inline placeholder that used to live just above `projectScores` has been
// replaced by this import — the comment at that site explicitly anticipated
// the handoff.
import type { ScoreComponents } from './score';
export type { ScoreComponents };

// ─── PostGIS custom type ─────────────────────────────────────────────────────
// `geography(Point, 4326)` columns: centroid on projects, location on
// satellite_alerts. Bare SELECT returns raw WKB hex (a string). Consumers that
// need human-readable geometry must wrap with `ST_AsGeoJSON()` or
// `ST_AsText()` via the `sql` tag — proper serializer/deserializer deferred to
// T11+ per T04 OQ-5. The GIST indexes declared in the SQL migration are
// DB-enforced; Drizzle is aware of the columns but the GIST variant is not
// expressible here, so no Drizzle-side index is declared for them.
const geographyPoint = customType<{ data: string; notNull: false }>({
  dataType() {
    return 'geography(Point, 4326)';
  },
});

// ─── schema_migrations ───────────────────────────────────────────────────────
// Bookkeeping table. T04 never writes to it, but we include the definition so
// `lib/schema.ts` mirrors the live DB 1:1 and `drizzle-kit introspect` matches.
export const schemaMigrations = pgTable('schema_migrations', {
  version: text('version').primaryKey(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow(),
});

// ─── projects ────────────────────────────────────────────────────────────────
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    nameCanonical: text('name_canonical').notNull(),
    nameAliases: text('name_aliases').array(),
    developer: text('developer'),
    country: char('country', { length: 2 }).notNull().default('ID'),
    province: text('province'),
    regency: text('regency'),
    projectType: text('project_type'),
    methodology: text('methodology'),
    hectares: numeric('hectares'),
    centroid: geographyPoint('centroid'),
    bufferKm: numeric('buffer_km').default('10'),
    status: text('status'),
    validationDate: date('validation_date'),
    firstIssuanceDate: date('first_issuance_date'),
    totalVcusIssued: numeric('total_vcus_issued').default('0'),
    totalVcusRetired: numeric('total_vcus_retired').default('0'),
    // Generated column. The SQL migration declares `STORED`; Drizzle's
    // `generatedAlwaysAs` mirrors the expression and marks the column as
    // not-insertable at the type level. Do not attempt to write to it.
    totalVcusAvailable: numeric('total_vcus_available').generatedAlwaysAs(
      sql`total_vcus_issued - total_vcus_retired`,
    ),
    lastVintage: integer('last_vintage'),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_projects_province').on(t.province),
    index('idx_projects_type').on(t.projectType),
    index('idx_projects_status').on(t.status),
    // idx_projects_centroid (GIST on geography) — DB-enforced, not declared
    // here because Drizzle's index builder cannot express GIST over a
    // customType without hand-written op-class plumbing.
  ],
);

// ─── registries ──────────────────────────────────────────────────────────────
export const registries = pgTable(
  'registries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    registryName: text('registry_name').notNull(),
    externalId: text('external_id').notNull(),
    status: text('status'),
    url: text('url'),
    rawMetadata: jsonb('raw_metadata').$type<Record<string, unknown>>(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_registries_project').on(t.projectId),
    // UNIQUE(registry_name, external_id) — DB-enforced via SQL DDL.
  ],
);

// ─── issuances ───────────────────────────────────────────────────────────────
export const issuances = pgTable(
  'issuances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    registryName: text('registry_name').notNull(),
    vintageYear: integer('vintage_year').notNull(),
    credits: numeric('credits').notNull(),
    issuanceDate: date('issuance_date').notNull(),
    serialStart: text('serial_start'),
    serialEnd: text('serial_end'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_issuances_project_vintage').on(t.projectId, t.vintageYear)],
);

// ─── retirements ─────────────────────────────────────────────────────────────
export const retirements = pgTable(
  'retirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    registryName: text('registry_name').notNull(),
    vintageYear: integer('vintage_year'),
    credits: numeric('credits').notNull(),
    retirementDate: date('retirement_date').notNull(),
    beneficiaryName: text('beneficiary_name'),
    beneficiaryCountry: char('beneficiary_country', { length: 2 }),
    beneficiaryType: text('beneficiary_type'),
    retirementReason: text('retirement_reason'),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_retirements_project_date').on(t.projectId, t.retirementDate)],
);

// ─── idx_monthly_snapshots ───────────────────────────────────────────────────
export const idxMonthlySnapshots = pgTable('idx_monthly_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodMonth: date('period_month').notNull().unique(),
  totalVolumeTco2e: numeric('total_volume_tco2e'),
  totalValueIdr: numeric('total_value_idr'),
  totalTransactions: integer('total_transactions'),
  tradingDays: integer('trading_days'),
  registeredParticipants: integer('registered_participants'),
  registeredProjects: integer('registered_projects'),
  availableUnits: numeric('available_units'),
  retiredUnits: numeric('retired_units'),
  avgPriceIdr: numeric('avg_price_idr'),
  rawReportUrl: text('raw_report_url'),
  rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
  scrapedAt: timestamp('scraped_at', { withTimezone: true }).defaultNow(),
});

// ─── satellite_alerts ────────────────────────────────────────────────────────
export const satelliteAlerts = pgTable(
  'satellite_alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    alertSource: text('alert_source').notNull(),
    alertDate: date('alert_date').notNull(),
    confidence: text('confidence'),
    areaHa: numeric('area_ha'),
    location: geographyPoint('location'),
    insideProjectBuffer: boolean('inside_project_buffer').default(false),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_sat_project_date').on(t.projectId, t.alertDate),
    // idx_sat_location (GIST on geography) — DB-enforced, same rationale as
    // idx_projects_centroid above.
  ],
);

// ─── regulatory_events ───────────────────────────────────────────────────────
export const regulatoryEvents = pgTable('regulatory_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventDate: date('event_date').notNull(),
  ministry: text('ministry'),
  documentType: text('document_type'),
  documentNumber: text('document_number'),
  title: text('title').notNull(),
  documentUrl: text('document_url'),
  summaryEn: text('summary_en'),
  summaryId: text('summary_id'),
  importance: text('importance'),
  tags: text('tags').array(),
  isUpcoming: boolean('is_upcoming').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── project_scores (composite PK) ───────────────────────────────────────────
// `ScoreComponents` is imported from `./score` (T09 canonical definition) at
// the top of this file and re-exported for external consumers.
export const projectScores = pgTable(
  'project_scores',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    scoreDate: date('score_date').notNull(),
    integrityScore: numeric('integrity_score'),
    validationRecencyScore: numeric('validation_recency_score'),
    reversalScore: numeric('reversal_score'),
    communityScore: numeric('community_score'),
    transparencyScore: numeric('transparency_score'),
    components: jsonb('components').$type<ScoreComponents>(),
    methodologyVersion: text('methodology_version').default('v1'),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.scoreDate] }),
    check('integrity_score_range', sql`${t.integrityScore} BETWEEN 0 AND 100`),
  ],
);

// ─── project_match_queue ─────────────────────────────────────────────────────
// Self-referential FKs to `projects(id)` with no ON DELETE clause (Postgres
// defaults to RESTRICT). Use AnyPgColumn because `projects` is already defined
// above — no forward-decl issue — but this keeps the reference callback typed
// cleanly if the order ever changes.
export const projectMatchQueue = pgTable('project_match_queue', {
  id: uuid('id').primaryKey().defaultRandom(),
  candidateAId: uuid('candidate_a_id').references((): AnyPgColumn => projects.id),
  candidateBId: uuid('candidate_b_id').references((): AnyPgColumn => projects.id),
  similarity: numeric('similarity'),
  matchReason: text('match_reason'),
  status: text('status').default('pending'),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── users (NextAuth) ────────────────────────────────────────────────────────
// `emailVerified` ↔ `email_verified` is required by @auth/drizzle-adapter v5.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true }),
  name: text('name'),
  image: text('image'),
  organization: text('organization'),
  persona: text('persona'),
  emailDigestOptIn: boolean('email_digest_opt_in').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow(),
});

// ─── accounts (NextAuth) ─────────────────────────────────────────────────────
// Field-name contract with @auth/drizzle-adapter v1.11.2 (auditor-confirmed
// 2026-04-21): the adapter calls `client.insert(accountsTable).values({...})`
// using a MIX of conventions — `userId` and `providerAccountId` are camelCase,
// but the six OAuth-token fields below are snake_case JS keys. Drizzle's
// `insert.values()` silently drops unknown keys, so a camelCase mismatch on
// these six would cause OAuth tokens to persist as NULL. Authoritative source:
// `node_modules/@auth/drizzle-adapter/lib/pg.js` lines 22-28.
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token: text('refresh_token'),
  access_token: text('access_token'),
  // expires_at is a Unix timestamp in seconds. Safe as JS Number until year
  // 285,428,751. If @auth/drizzle-adapter ever requires BigInt mode, switch
  // to { mode: 'bigint' } and verify against the installed adapter source.
  expires_at: bigint('expires_at', { mode: 'number' }),
  token_type: text('token_type'),
  scope: text('scope'),
  id_token: text('id_token'),
  session_state: text('session_state'),
  // UNIQUE(provider, provider_account_id) — DB-enforced via SQL DDL.
});

// ─── sessions (NextAuth) ─────────────────────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionToken: text('session_token').notNull().unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true }).notNull(),
});

// ─── verification_tokens (NextAuth, composite PK) ────────────────────────────
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ─── admin_actions (T21 audit log) ───────────────────────────────────────────
// Mirrors `scrapers/migrations/005_admin_actions.sql`. A separate table (not
// `notifications`) so audit rows stay out of the T16 inbox and T17 digest paths
// entirely — no type-filter patch required on those consumers.
//
// `actor_id` is `UUID NOT NULL REFERENCES users(id)`. Callers are the approve /
// reject / defer route handlers, which always run behind `auth()` so the FK
// target exists (the admin's NextAuth user row is created on first Google login
// by the T05 DrizzleAdapter).
export const adminActions = pgTable(
  'admin_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(), // 'approve-merge' | 'reject-match' | 'defer-match'
    entityType: text('entity_type').notNull(), // 'project_match_queue' (v0.1)
    entityId: uuid('entity_id'),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [index('idx_admin_actions_created').on(t.createdAt.desc())],
);

// ─── notifications ───────────────────────────────────────────────────────────
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    url: text('url'),
    readAt: timestamp('read_at', { withTimezone: true }),
    digestedAt: timestamp('digested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_notifications_user_read').on(t.userId, t.readAt),
    index('idx_notifications_user_created').on(t.userId, t.createdAt.desc()),
  ],
);

// ─── project_descriptions ────────────────────────────────────────────────────
// T30 — per-project AI-researched narrative (public summary + gated analyst
// briefing + citations). Populated out-of-band by a Claude research agent;
// the runtime app reads but never writes. See migration 006.
export type ProjectDescriptionCitation = {
  n: number;
  url: string;
  title: string;
  source?: string;
  date?: string;
};

// ─── news_posts ──────────────────────────────────────────────────────────────
// T33 — auto-composed weekly Market Wrap (and future post kinds). Written
// out-of-band by `scripts/publish-weekly-wrap.ts`; the runtime app reads
// only. `facts_json` captures the composer's inputs so posts can be
// re-rendered under a new template without re-scraping. See migration 007.
export type NewsPostFacts = Record<string, unknown>;

export const newsPosts = pgTable(
  'news_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    kind: text('kind').notNull(), // 'weekly_wrap' for now
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    bodyMd: text('body_md').notNull(),
    factsJson: jsonb('facts_json').$type<NewsPostFacts>().notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    supersededBy: uuid('superseded_by'),
  },
  (t) => [index('idx_news_posts_published').on(t.publishedAt.desc())],
);

export const projectDescriptions = pgTable(
  'project_descriptions',
  {
    projectId: uuid('project_id')
      .primaryKey()
      .references(() => projects.id, { onDelete: 'cascade' }),
    summaryMd: text('summary_md').notNull(),
    detailMd: text('detail_md').notNull(),
    citations: jsonb('citations')
      .$type<ProjectDescriptionCitation[]>()
      .notNull()
      .default([]),
    inputFingerprint: text('input_fingerprint').notNull(),
    model: text('model').notNull().default('claude-agent-websearch'),
    confidence: text('confidence').notNull(),
    confidenceReason: text('confidence_reason'),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('idx_proj_desc_generated').on(t.generatedAt.desc())],
);

// ─── SEO Phase 1 — dashboard tracking tables ─────────────────────────────────
// See scrapers/migrations/008_seo_tracking.sql for the SQL source of truth.
// Read by app/admin/seo, written by scripts/seo/fetch-* cron jobs.

export type SeoIndexationStraggler = {
  url: string;
  last_crawled?: string;
  reason?: string;
};

export const seoIndexationSnapshots = pgTable(
  'seo_indexation_snapshots',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    source: text('source').notNull(), // 'gsc' | 'bwt' | 'yandex'
    observedAt: timestamp('observed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    indexed: integer('indexed').notNull(),
    submitted: integer('submitted').notNull(),
    stragglers: jsonb('stragglers')
      .$type<SeoIndexationStraggler[]>()
      .notNull()
      .default([]),
    raw: jsonb('raw'),
  },
  (t) => [index('idx_seo_indexation_source_time').on(t.source, t.observedAt.desc())],
);

export const seoBacklinks = pgTable(
  'seo_backlinks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    referringHost: text('referring_host').notNull(),
    referringUrl: text('referring_url').notNull(),
    targetUrl: text('target_url').notNull(),
    anchorText: text('anchor_text'),
    rel: text('rel'),
    firstSeen: timestamp('first_seen', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true })
      .notNull()
      .defaultNow(),
    source: text('source').notNull().default('ahrefs_wmt'),
    raw: jsonb('raw'),
  },
  (t) => [
    uniqueIndex('uq_seo_backlinks_host_target').on(t.referringHost, t.targetUrl),
    index('idx_seo_backlinks_last_seen').on(t.lastSeen.desc()),
  ],
);

export const seoKeywordRanks = pgTable(
  'seo_keyword_ranks',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    observedDate: date('observed_date').notNull(),
    query: text('query').notNull(),
    page: text('page').notNull(),
    position: numeric('position', { precision: 5, scale: 2 }).notNull(),
    impressions: integer('impressions').notNull(),
    clicks: integer('clicks').notNull(),
    ctr: numeric('ctr', { precision: 5, scale: 4 }).notNull(),
    source: text('source').notNull().default('gsc'),
  },
  (t) => [
    uniqueIndex('uq_seo_keyword_ranks_date_query_page').on(t.observedDate, t.query, t.page),
    index('idx_seo_keyword_ranks_query').on(t.query, t.observedDate.desc()),
  ],
);

export type SeoTaskStatus = 'pending' | 'in_progress' | 'completed' | 'wontfix';

export const seoTasks = pgTable(
  'seo_tasks',
  {
    code: text('code').primaryKey(),
    status: text('status').$type<SeoTaskStatus>().notNull().default('pending'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: text('closed_by'),
    notes: text('notes'),
  },
  (t) => [index('idx_seo_tasks_status').on(t.status)],
);
