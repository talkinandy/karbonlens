/**
 * lib/composers/weekly-wrap.ts — deterministic Weekly Market Wrap composer (T33 Phase 4B).
 *
 * Zero-LLM. Takes a fully-resolved `WeeklyWrapFacts` bundle and returns a
 * ready-to-insert `NewsPost` shape: slug, title, summary, body markdown,
 * and the `factsJson` that the runtime keeps around as a re-render
 * substrate. Pure function — no DB, no fetch, no `Date.now()`.
 *
 * The guardrail: if the week had essentially nothing to report, the
 * composer returns `shouldPublish: false` with a human-readable
 * `skipReason`. The publisher logs it and exits cleanly without
 * inserting a row. See Phase 4B spec for the exact predicates.
 *
 * Re-render substrate: `factsJson` is a straight pass-through of the
 * input. This means a template refresh (prose tweaks, new section
 * ordering, different link shapes) can be applied by re-running the
 * composer over the stored `facts_json` of every existing post, without
 * re-scraping and without backfilling the DB.
 */

import { GLOSSARY, listTerms } from '@/lib/data/glossary';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WeeklyWrapIssuance = {
  projectSlug: string;
  projectName: string;
  registryName: string;
  vintageYear: number;
  credits: number;
  issuanceDate: string; // 'YYYY-MM-DD'
};

export type WeeklyWrapAlertProject = {
  projectSlug: string;
  projectName: string;
  province: string | null;
  newAlertCount: number;
};

export type WeeklyWrapRegulatoryEvent = {
  slug: string;
  documentType: string | null;
  documentNumber: string | null;
  title: string;
  eventDate: string; // 'YYYY-MM-DD'
  ministry: string | null;
  summaryEn: string | null;
};

export type WeeklyWrapPriceMonth = {
  monthSlug: string; // '2026-04'
  totalVolumeTco2e: number | null;
  avgPriceIdr: number | null;
  totalValueIdr: number | null;
  momVolumePct: number | null; // signed, nullable
  momPricePct: number | null;
};

export type WeeklyWrapFacts = {
  windowStart: Date; // prev Monday 00:00 UTC
  windowEnd: Date; // now (Monday morning)
  newIssuances: WeeklyWrapIssuance[];
  topAlertProjects: WeeklyWrapAlertProject[]; // top 5 by new alert count
  newRegulatoryEvents: WeeklyWrapRegulatoryEvent[];
  newPriceMonth: WeeklyWrapPriceMonth | null;
  totalNewIssuedCredits: number; // sum of newIssuances[].credits
  totalNewAlerts: number; // sum across all projects this week
};

export type WeeklyWrapOutput = {
  slug: string;
  title: string;
  summary: string; // <=200 chars; drives meta description
  bodyMd: string;
  factsJson: WeeklyWrapFacts;
  shouldPublish: boolean;
  skipReason?: string;
};

// ─── Date helpers (all UTC) ──────────────────────────────────────────────────

const LONG_MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Return the Monday (UTC) of the ISO week containing `d`.
 * ISO weeks start on Monday. `getUTCDay()` returns 0–6 with Sunday = 0.
 */
function isoWeekMondayUtc(d: Date): Date {
  const day = d.getUTCDay(); // 0 (Sun) … 6 (Sat)
  const offset = day === 0 ? -6 : 1 - day; // shift back to Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset),
  );
  return monday;
}

/**
 * ISO 8601 week number in [1, 53] for `d`, UTC.
 *
 * Standard algorithm: shift `d` to the nearest Thursday (week is owned
 * by the year of its Thursday), then compute weeks elapsed since Jan 1
 * of that year.
 */
function isoWeekNumberUtc(d: Date): number {
  const target = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNr + 3);
  const diffMs = target.getTime() - firstThursday.getTime();
  return 1 + Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatIsoDateUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function formatLongDateUtc(d: Date): string {
  return `${d.getUTCDate()} ${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ─── Number formatters (locale-independent) ──────────────────────────────────

function formatInt(n: number): string {
  // Thousands separator = comma; no decimals. Using Intl ensures
  // deterministic output regardless of host locale.
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(
    Math.round(n),
  );
}

function formatSignedPct(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toFixed(1)}%`;
}

function formatIdr(n: number): string {
  return `Rp ${formatInt(n)}`;
}

// ─── Markdown helpers ────────────────────────────────────────────────────────

function escapePipe(s: string): string {
  // Markdown table cells cannot contain a raw `|`. Replace with an
  // HTML-safe variant rather than stripping so registry ids stay visible.
  return s.replace(/\|/g, '\\|');
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

// ─── Core composition ───────────────────────────────────────────────────────

/**
 * Should the wrap be skipped?
 *
 * Skip only when ALL of the following hold — i.e. the week was so quiet
 * that publishing would amount to empty noise:
 *   - no new issuances
 *   - no new regulatory events
 *   - no new price month
 *   - fewer than 5 new alerts (any project)
 */
function computeSkip(facts: WeeklyWrapFacts): string | null {
  const noIssuances = facts.newIssuances.length === 0;
  const noRegulatory = facts.newRegulatoryEvents.length === 0;
  const noPrice = facts.newPriceMonth === null;
  const fewAlerts = facts.totalNewAlerts < 5;
  if (noIssuances && noRegulatory && noPrice && fewAlerts) {
    return `quiet week — ${facts.totalNewAlerts} new alerts, no issuances, no regulatory events, no new price month`;
  }
  return null;
}

function composeSummary(
  facts: WeeklyWrapFacts,
  longDate: string,
): string {
  const parts: string[] = [];

  if (facts.newIssuances.length > 0 && facts.totalNewIssuedCredits > 0) {
    // Distinct registries count gives the reader a sense of breadth.
    const registries = new Set(
      facts.newIssuances.map((r) => r.registryName).filter((r) => r),
    ).size;
    const projects = new Set(facts.newIssuances.map((r) => r.projectSlug)).size;
    const regPhrase = registries > 0 ? ` across ${projects} project${projects === 1 ? '' : 's'}` : '';
    parts.push(
      `${formatInt(facts.totalNewIssuedCredits)} new credits${regPhrase}`,
    );
  }

  if (facts.totalNewAlerts > 0) {
    parts.push(
      `${formatInt(facts.totalNewAlerts)} satellite alert${facts.totalNewAlerts === 1 ? '' : 's'}`,
    );
  }

  if (facts.newRegulatoryEvents.length > 0) {
    parts.push(
      `${facts.newRegulatoryEvents.length} regulatory update${facts.newRegulatoryEvents.length === 1 ? '' : 's'}`,
    );
  }

  if (facts.newPriceMonth && facts.newPriceMonth.avgPriceIdr !== null) {
    parts.push(
      `IDXCarbon avg ${formatIdr(facts.newPriceMonth.avgPriceIdr)}/tCO₂e`,
    );
  }

  const body =
    parts.length === 0
      ? `a quiet week on Indonesian carbon markets`
      : parts.join(', ').replace(/, ([^,]*)$/, ', and $1');
  const full = `Week of ${longDate}: ${body}.`;
  return truncate(full, 200);
}

function composeKpis(facts: WeeklyWrapFacts): string[] {
  const out: string[] = [];
  if (facts.newIssuances.length > 0) {
    const projects = new Set(facts.newIssuances.map((r) => r.projectSlug)).size;
    out.push(
      `**${formatInt(facts.totalNewIssuedCredits)}** new credits issued across **${projects}** project${projects === 1 ? '' : 's'}`,
    );
  }
  if (facts.totalNewAlerts > 0) {
    const projectCount = facts.topAlertProjects.length;
    out.push(
      `**${formatInt(facts.totalNewAlerts)}** new satellite alert${facts.totalNewAlerts === 1 ? '' : 's'}${projectCount > 0 ? ` across **${projectCount}** monitored project${projectCount === 1 ? '' : 's'}` : ''}`,
    );
  }
  if (facts.newRegulatoryEvents.length > 0) {
    out.push(
      `**${facts.newRegulatoryEvents.length}** new regulatory event${facts.newRegulatoryEvents.length === 1 ? '' : 's'}`,
    );
  }
  if (facts.newPriceMonth) {
    const p = facts.newPriceMonth;
    if (p.avgPriceIdr !== null) {
      const momPhrase =
        p.momPricePct !== null ? ` (${formatSignedPct(p.momPricePct)} MoM)` : '';
      out.push(
        `IDXCarbon **${formatIdr(p.avgPriceIdr)}**/tCO₂e avg${momPhrase}`,
      );
    } else if (p.totalVolumeTco2e !== null) {
      out.push(
        `New IDXCarbon month published: **${formatInt(p.totalVolumeTco2e)}** tCO₂e traded`,
      );
    }
  }
  return out;
}

function composeIssuancesSection(facts: WeeklyWrapFacts): string {
  if (facts.newIssuances.length === 0) return '';
  const rows = facts.newIssuances.slice(0, 10);
  const extra = facts.newIssuances.length - rows.length;
  const lines: string[] = ['## Issuances', ''];
  lines.push('| Project | Registry | Vintage | Credits |');
  lines.push('| --- | --- | --- | ---: |');
  for (const r of rows) {
    lines.push(
      `| [${escapePipe(r.projectName)}](/projects/${r.projectSlug}) | ${escapePipe(r.registryName)} | ${r.vintageYear} | ${formatInt(r.credits)} |`,
    );
  }
  if (extra > 0) {
    lines.push('');
    lines.push(`… + ${extra} more`);
  }
  return lines.join('\n');
}

function composeAlertsSection(facts: WeeklyWrapFacts): string {
  if (facts.topAlertProjects.length === 0) return '';
  const lines: string[] = ['## Satellite alerts', ''];
  for (const p of facts.topAlertProjects) {
    const provincePhrase = p.province ? ` — ${p.province}` : '';
    lines.push(
      `- [${p.projectName}](/projects/${p.projectSlug}#map)${provincePhrase}: **${formatInt(p.newAlertCount)}** new alert${p.newAlertCount === 1 ? '' : 's'}`,
    );
  }
  return lines.join('\n');
}

function composeRegulatorySection(facts: WeeklyWrapFacts): string {
  if (facts.newRegulatoryEvents.length === 0) return '';
  const lines: string[] = ['## Regulatory', ''];
  for (const e of facts.newRegulatoryEvents) {
    const docLabel =
      [e.documentType, e.documentNumber].filter((s) => s && s.length > 0).join(' ') ||
      e.title;
    const header = `[${docLabel}](/regulatory/${e.slug})`;
    const ministryPhrase = e.ministry ? ` — ${e.ministry}` : '';
    const body =
      e.summaryEn && e.summaryEn.trim().length > 0
        ? truncate(e.summaryEn.trim(), 200)
        : e.title;
    lines.push(`**${header}** (${e.eventDate}${ministryPhrase}) — ${body}`);
    lines.push('');
  }
  // Trim trailing blank
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

function composePriceSection(facts: WeeklyWrapFacts): string {
  const p = facts.newPriceMonth;
  if (!p) return '';
  const lines: string[] = ['## Prices', ''];
  const clauses: string[] = [];
  if (p.totalVolumeTco2e !== null) {
    const momV =
      p.momVolumePct !== null ? ` (${formatSignedPct(p.momVolumePct)} MoM)` : '';
    clauses.push(`volume ${formatInt(p.totalVolumeTco2e)} tCO₂e${momV}`);
  }
  if (p.avgPriceIdr !== null) {
    const momP =
      p.momPricePct !== null ? ` (${formatSignedPct(p.momPricePct)} MoM)` : '';
    clauses.push(`average price ${formatIdr(p.avgPriceIdr)}/tCO₂e${momP}`);
  }
  if (p.totalValueIdr !== null) {
    clauses.push(`total value ${formatIdr(p.totalValueIdr)}`);
  }
  const body =
    clauses.length === 0
      ? `a new IDXCarbon snapshot was published`
      : clauses.join(', ').replace(/, ([^,]*)$/, ', and $1');
  lines.push(
    `The IDXCarbon **${p.monthSlug}** snapshot shows ${body}. See the [full monthly view](/prices/${p.monthSlug}).`,
  );
  return lines.join('\n');
}

function composeSpotlightSection(weekNum: number): string {
  // Use `listTerms()` so the spotlight rotation matches the visible ordering
  // on /glossary. Fall back to GLOSSARY if listTerms is empty (shouldn't happen).
  const terms = listTerms();
  const pool = terms.length > 0 ? terms : GLOSSARY;
  if (pool.length === 0) return '';
  const idx = ((weekNum % pool.length) + pool.length) % pool.length;
  const term = pool[idx];
  const lines: string[] = [
    '## Methodology spotlight',
    '',
    `*In spotlight this week:* [**${term.term}**](/glossary/${term.slug}) — ${term.short}`,
  ];
  return lines.join('\n');
}

// ─── Public entry point ──────────────────────────────────────────────────────

export function composeWeeklyWrap(facts: WeeklyWrapFacts): WeeklyWrapOutput {
  // Slug + title anchor on the Monday of the ISO week containing windowEnd,
  // in UTC. That keeps Monday 06:00 UTC cron runs deterministic even when
  // windowEnd straddles local-timezone boundaries.
  const monday = isoWeekMondayUtc(facts.windowEnd);
  const slugDate = formatIsoDateUtc(monday);
  const longDate = formatLongDateUtc(monday);
  const slug = `${slugDate}-indonesia-carbon-market-weekly-wrap`;
  const title = `Indonesia carbon market — week of ${longDate}`;

  const skipReason = computeSkip(facts);
  if (skipReason) {
    // When skipping, we still build the minimal envelope so callers can
    // log a consistent shape — but `shouldPublish` is the ground truth.
    return {
      slug,
      title,
      summary: truncate(
        `Week of ${longDate}: quiet week on Indonesian carbon markets.`,
        200,
      ),
      bodyMd: '',
      factsJson: facts,
      shouldPublish: false,
      skipReason,
    };
  }

  const summary = composeSummary(facts, longDate);

  // Body — assemble section-by-section, skipping empties so the post
  // doesn't end up with dangling headers.
  const sections: string[] = [];

  const kpis = composeKpis(facts);
  if (kpis.length > 0) {
    sections.push(
      ['## This week in numbers', '', ...kpis.map((k) => `- ${k}`)].join('\n'),
    );
  }

  const issuances = composeIssuancesSection(facts);
  if (issuances) sections.push(issuances);

  const alerts = composeAlertsSection(facts);
  if (alerts) sections.push(alerts);

  const regulatory = composeRegulatorySection(facts);
  if (regulatory) sections.push(regulatory);

  const prices = composePriceSection(facts);
  if (prices) sections.push(prices);

  const spotlight = composeSpotlightSection(isoWeekNumberUtc(facts.windowEnd));
  if (spotlight) sections.push(spotlight);

  sections.push(
    `*Auto-generated from this week's KarbonLens data refresh. See the [projects explorer](/projects) for the full registry.*`,
  );

  const bodyMd = sections.join('\n\n') + '\n';

  return {
    slug,
    title,
    summary,
    bodyMd,
    factsJson: facts,
    shouldPublish: true,
  };
}
