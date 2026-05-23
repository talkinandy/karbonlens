/**
 * ProjectDescription — T30 (analyst briefing) + T31 (answer-first restructure).
 *
 * Layout, top → bottom:
 *   1. TL;DR lead — single bolded serif sentence (≤60 words). The first thing
 *      both humans and LLMs see; carries the headline answer to "what is this
 *      project?".
 *   2. Key Facts <dl> — minimal definition list with structured fields
 *      (developer, hectares, methodology, score, etc.). Driven by the new
 *      `facts` prop the page builds from `ProjectDetail`.
 *   3. FAQ block — five Q/A pairs derived deterministically from the
 *      description + facts. Always visible (no auth gate) — this is the LLM
 *      extraction surface.
 *   4. Public summary — original T30 serif paragraph.
 *   5. Analyst briefing — gated for anonymous users, full for signed-in.
 *   6. AI-disclosure footer.
 *   7. Sources footer — flat list of all citations, visible to everyone.
 *
 * A `<JsonLd>` block emits `FAQPage` schema mirroring the FAQ entries so
 * search engines + LLM crawlers index the answers structurally.
 *
 * Markdown: we only need **bold**, paragraphs, and inline [N] citation
 * markers. A tiny in-file parser handles this without pulling in a full
 * markdown lib — the detail copy comes from a known source (our own research
 * agent) so the shape is predictable.
 *
 * Empty-state contract: if no description row exists we still return null
 * (the rest of the page stands on its own). When `facts` are present but
 * description is missing, we follow the original T30 contract and skip the
 * whole component — the SectionHero above already shows the basic facts.
 */

import Link from 'next/link';
import { auth } from '@/lib/auth';
import { JsonLd } from '@/components/seo/JsonLd';
import type { ProjectDescription as ProjectDescriptionRow } from '@/lib/queries/project-description';
import type { ScoreComponents } from '@/lib/score';

/**
 * SEO Phase 1 — auth-aware briefing island.
 *
 * Wrap this in <Suspense> from the page so the static shell of the project
 * detail route can be PPR-prerendered while the auth gate (full briefing for
 * signed-in users, teaser + sign-in CTA for guests) streams in. Crawlers see
 * the guest fallback rendered inside the suspense boundary — that's the
 * intended SEO surface.
 */
export async function BriefingBody({
  description,
  projectSlug,
}: {
  description: ProjectDescriptionRow;
  projectSlug: string;
}) {
  const session = await auth();
  const isAuthed = !!session?.user?.id;
  const paragraphs = splitParagraphs(description.detailMd);

  if (isAuthed) {
    return (
      <>
        <FullBriefing paragraphs={paragraphs} citations={description.citations} />
        <CitationsList citations={description.citations} />
      </>
    );
  }
  return (
    <GatedBriefing
      paragraphs={paragraphs}
      citations={description.citations}
      projectSlug={projectSlug}
    />
  );
}

export function BriefingBodyFallback({
  description,
  projectSlug,
}: {
  description: ProjectDescriptionRow;
  projectSlug: string;
}) {
  const paragraphs = splitParagraphs(description.detailMd);
  return (
    <GatedBriefing
      paragraphs={paragraphs}
      citations={description.citations}
      projectSlug={projectSlug}
    />
  );
}

// T31 — typed shape the page hands us. Every nullable field can be missing
// from the source data; the renderer skips missing rows rather than printing
// "null" or "—".
export type ProjectFacts = {
  nameCanonical: string;
  developer: string | null;
  province: string | null;
  projectType: string | null;
  methodology: string | null;
  hectares: number | null;
  status: string | null;
  statusLabel: string;
  statusPillClass: string;
  integrityScore: number | null;
  latestVintageYear: number | null;
  registryIds: string | null;
  generatedAt: Date | null;
  scoreComponents: ScoreComponents | null;
};

type Props = {
  description: ProjectDescriptionRow | null;
  /**
   * Auth-aware analyst briefing slot. The page wraps a server component
   * that calls `auth()` in <Suspense> and passes it here, so that this
   * component (and its parent route's static shell) can be prerendered
   * via PPR without touching cookies. See app/(app)/projects/[slug]/page.tsx.
   */
  briefingSlot: React.ReactNode;
  projectSlug: string;
  facts: ProjectFacts;
};

export function ProjectDescription({
  description,
  briefingSlot,
  projectSlug,
  facts,
}: Props) {
  if (!description) {
    return null; // quiet empty state — the rest of the page still renders
  }

  const paragraphs = splitParagraphs(description.detailMd);
  const tldr = buildTldr(description.summaryMd);
  const faq = buildFaq({
    facts,
    summaryMd: description.summaryMd,
    paragraphs,
    generatedAt: description.generatedAt,
    model: description.model,
  });

  return (
    <section className="kl-desc" aria-label="Project description">
      <p className="kl-desc-tldr">
        <strong>{tldr}</strong>
      </p>

      <FactsList facts={facts} />

      <FaqBlock faq={faq} />

      <div className="kl-desc-summary">
        <p>{description.summaryMd}</p>
      </div>

      <div className="kl-desc-briefing">
        <h2 className="kl-section-label">Analyst briefing</h2>
        {briefingSlot}

        <Disclosure
          generatedAt={description.generatedAt}
          model={description.model}
          confidence={description.confidence}
          projectSlug={projectSlug}
        />
      </div>

      <SourcesFooter citations={description.citations} />

      <JsonLd
        id="ld-faq"
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faq.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
              '@type': 'Answer',
              text: item.a,
            },
          })),
        }}
      />
    </section>
  );
}

// ─── New T31 sub-components ──────────────────────────────────────────────────

function FactsList({ facts }: { facts: ProjectFacts }) {
  // Build rows in display order; skip any with null/empty value. Keeps the
  // list short and answer-dense for LLMs scraping a key-facts table.
  const rows: { label: string; value: React.ReactNode }[] = [];

  rows.push({ label: 'Name', value: facts.nameCanonical });
  if (facts.developer) rows.push({ label: 'Developer', value: facts.developer });
  if (facts.province) rows.push({ label: 'Province', value: facts.province });
  if (facts.projectType) rows.push({ label: 'Type', value: facts.projectType });
  if (facts.methodology)
    rows.push({ label: 'Methodology', value: facts.methodology });
  if (facts.hectares !== null && Number.isFinite(facts.hectares)) {
    rows.push({
      label: 'Hectares',
      value: `${facts.hectares.toLocaleString('en-ID')} ha`,
    });
  }
  if (facts.status) {
    rows.push({
      label: 'Status',
      value: <span className={facts.statusPillClass}>{facts.statusLabel}</span>,
    });
  }
  if (facts.integrityScore !== null) {
    rows.push({
      label: 'Integrity score',
      value: `${facts.integrityScore} / 100`,
    });
  }
  if (facts.latestVintageYear !== null) {
    rows.push({
      label: 'Latest vintage',
      value: String(facts.latestVintageYear),
    });
  }
  if (facts.registryIds) {
    rows.push({ label: 'Registry IDs', value: facts.registryIds });
  }
  if (facts.generatedAt) {
    rows.push({
      label: 'Generated',
      value: `Updated ${facts.generatedAt.toISOString().slice(0, 10)}`,
    });
  }

  if (rows.length === 0) return null;

  return (
    <dl className="kl-desc-facts" aria-label="Key facts">
      {rows.map((r, i) => (
        <FactRow key={i} label={r.label} value={r.value} />
      ))}
    </dl>
  );
}

function FactRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}

type FaqItem = { q: string; a: string };

function FaqBlock({ faq }: { faq: FaqItem[] }) {
  if (faq.length === 0) return null;
  return (
    <section className="kl-desc-faq" aria-label="Frequently asked questions">
      {faq.map((item, i) => (
        <div key={i}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </div>
      ))}
    </section>
  );
}

function SourcesFooter({
  citations,
}: {
  citations: ProjectDescriptionRow['citations'];
}) {
  if (citations.length === 0) return null;
  return (
    <aside className="kl-desc-sources" aria-label="Sources referenced">
      <strong>Sources referenced in this briefing:</strong>
      <ol>
        {citations.map((c) => {
          const meta = [c.source, c.date].filter(Boolean).join(', ');
          return (
            <li key={c.n}>
              [{c.n}]{' '}
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                {c.title}
              </a>
              {meta ? ` — ${meta}` : null}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

// ─── Existing T30 sub-components (unchanged) ─────────────────────────────────

function FullBriefing({
  paragraphs,
  citations,
}: {
  paragraphs: Paragraph[];
  citations: ProjectDescriptionRow['citations'];
}) {
  return (
    <div className="kl-desc-body">
      {paragraphs.map((p, i) => (
        <ParagraphView key={i} p={p} citations={citations} />
      ))}
    </div>
  );
}

function GatedBriefing({
  paragraphs,
  citations,
  projectSlug,
}: {
  paragraphs: Paragraph[];
  citations: ProjectDescriptionRow['citations'];
  projectSlug: string;
}) {
  const teaser = paragraphs[0];
  const hiddenCount = Math.max(0, paragraphs.length - 1);
  return (
    <div className="kl-desc-body kl-desc-body--gated">
      {teaser ? <ParagraphView p={teaser} citations={citations} /> : null}
      <div className="kl-desc-gate">
        <div className="kl-desc-gate-fade" aria-hidden="true" />
        <div className="kl-desc-gate-card">
          <p className="kl-desc-gate-label">
            {hiddenCount > 0
              ? `${hiddenCount} more paragraph${hiddenCount === 1 ? '' : 's'} plus ${citations.length} source${citations.length === 1 ? '' : 's'} — sign in to read the full analysis.`
              : `Sign in to read the full analysis and ${citations.length} source${citations.length === 1 ? '' : 's'}.`}
          </p>
          <Link
            href={`/?signin=1&from=/projects/${encodeURIComponent(projectSlug)}`}
            className="kl-btn kl-btn--primary"
          >
            Sign in with Google
          </Link>
        </div>
      </div>
    </div>
  );
}

function ParagraphView({
  p,
  citations,
}: {
  p: Paragraph;
  citations: ProjectDescriptionRow['citations'];
}) {
  if (p.heading) {
    return (
      <p>
        <strong>{p.heading}</strong>{' '}
        {renderInline(p.body, citations)}
      </p>
    );
  }
  return <p>{renderInline(p.body, citations)}</p>;
}

function CitationsList({
  citations,
}: {
  citations: ProjectDescriptionRow['citations'];
}) {
  if (citations.length === 0) return null;
  return (
    <ol className="kl-desc-citations" aria-label="Sources">
      {citations.map((c) => (
        <li key={c.n} id={`cite-${c.n}`}>
          <a href={c.url} target="_blank" rel="noopener noreferrer">
            {c.title}
          </a>
          {c.source ? <span className="kl-desc-cite-source"> — {c.source}</span> : null}
          {c.date ? <span className="kl-desc-cite-date"> · {c.date}</span> : null}
        </li>
      ))}
    </ol>
  );
}

function Disclosure({
  generatedAt,
  model,
  confidence,
  projectSlug,
}: {
  generatedAt: Date;
  model: string;
  confidence: string;
  projectSlug: string;
}) {
  const iso = generatedAt.toISOString().slice(0, 10);
  const subject = encodeURIComponent(`Inaccuracy report: /projects/${projectSlug}`);
  return (
    <p className="kl-desc-disclosure">
      AI-generated from public sources on {iso} · confidence: {confidence} · model: {model} ·{' '}
      <a href={`mailto:hello@karbonlens.com?subject=${subject}`}>Flag inaccuracy</a>
    </p>
  );
}

// ─── tiny markdown parser ────────────────────────────────────────────────────
// Recognises only the shapes the research agent actually produces:
//   - paragraphs separated by blank lines
//   - optional leading "**Heading.**" pattern at the start of a paragraph
//   - inline [N] citation markers → <sup>[N]</sup> anchored to #cite-N

type Paragraph = {
  heading?: string;
  body: string;
};

function splitParagraphs(md: string): Paragraph[] {
  const blocks = md.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks.map((block) => {
    const match = block.match(/^\*\*([^*]+?)\*\*\s*([\s\S]*)$/);
    if (match) {
      return { heading: match[1].replace(/[.:\s]+$/, ''), body: match[2].trim() };
    }
    return { body: block };
  });
}

function renderInline(
  text: string,
  citations: ProjectDescriptionRow['citations'],
): React.ReactNode {
  const validNums = new Set(citations.map((c) => c.n));
  // Split by [N] markers, keeping the markers as matches.
  const parts = text.split(/(\[\d+\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[(\d+)\]$/);
    if (m) {
      const n = Number(m[1]);
      if (!validNums.has(n)) {
        // Drop dangling marker (shouldn't happen with validated payloads).
        return null;
      }
      return (
        <sup key={i} className="kl-desc-cite-marker">
          <a href={`#cite-${n}`}>{n}</a>
        </sup>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ─── T31 helpers: TL;DR + FAQ derivation ─────────────────────────────────────

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * TL;DR: the first sentence of summaryMd if summaryMd is >60 words, otherwise
 * summaryMd verbatim. Falls back to the full summary if no sentence boundary
 * is detectable.
 */
function buildTldr(summaryMd: string): string {
  const trimmed = summaryMd.trim();
  if (wordCount(trimmed) <= 60) return trimmed;
  const match = /^[^.]+\./.exec(trimmed);
  return match ? match[0].trim() : trimmed;
}

/**
 * Strip inline [N] citation markers + bold markers from prose so the FAQ
 * answers read cleanly when echoed into JSON-LD or shown bare in <p>.
 */
function stripMd(s: string): string {
  return s
    .replace(/\[\d+\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function truncateWords(s: string, maxWords: number): string {
  const words = s.split(/\s+/);
  if (words.length <= maxWords) return s;
  return words.slice(0, maxWords).join(' ') + '…';
}

function firstTwoSentences(s: string): string {
  const text = stripMd(s);
  // Greedy match of up to two sentence-ending punctuation marks.
  const m = text.match(/^(?:[^.!?]+[.!?]\s*){1,2}/);
  return (m ? m[0] : text).trim();
}

/**
 * Pick the second-to-last paragraph as the "Net read" candidate. If there are
 * fewer than two paragraphs, fall back to the last one; if zero, return ''.
 */
function netReadParagraph(paragraphs: Paragraph[]): string {
  if (paragraphs.length === 0) return '';
  const idx = paragraphs.length >= 2 ? paragraphs.length - 2 : paragraphs.length - 1;
  const p = paragraphs[idx];
  return stripMd((p.heading ? `${p.heading}. ` : '') + p.body);
}

/**
 * Map the four sub-score numbers into a short driver phrase. Names match the
 * methodology page; we mention only the lowest scorer ("driven by …") to keep
 * the answer one sentence long. Falls back to a generic phrasing when the
 * components blob is missing.
 */
function describeScoreDrivers(components: ScoreComponents | null): string {
  if (!components) {
    return 'Driver breakdown is not available for this project yet.';
  }
  const labels: Record<keyof Omit<ScoreComponents, 'inputs'>, string> = {
    validation_recency: 'validation recency',
    reversal_risk: 'reversal risk (satellite alerts)',
    community_flags: 'community flags',
    transparency: 'registry transparency',
  };
  const entries = (
    ['validation_recency', 'reversal_risk', 'community_flags', 'transparency'] as const
  ).map((k) => ({ key: k, value: components[k] }));
  entries.sort((a, b) => a.value - b.value);
  const lowest = entries[0];
  const highest = entries[entries.length - 1];
  return `Driven down by ${labels[lowest.key]} (${Math.round(lowest.value)}) and supported by ${labels[highest.key]} (${Math.round(highest.value)}).`;
}

/**
 * Build the five FAQ entries. Pure function — no side effects, deterministic
 * given the same inputs, so the FAQPage JSON-LD always matches the visible
 * Q/A markup.
 *
 * Edge cases:
 *  - missing developer / registry → "operator details are not on file yet"
 *  - missing score → "no integrity score has been published yet"
 *  - missing detailMd → "Why is it notable?" falls back to the public summary
 */
function buildFaq({
  facts,
  summaryMd,
  paragraphs,
  generatedAt,
  model,
}: {
  facts: ProjectFacts;
  summaryMd: string;
  paragraphs: Paragraph[];
  generatedAt: Date;
  model: string;
}): FaqItem[] {
  const name = facts.nameCanonical;

  const q1 = `What is ${name}?`;
  const a1 = firstTwoSentences(summaryMd) || `${name} is an Indonesian carbon project tracked by KarbonLens.`;

  const q2 = `Who operates ${name}?`;
  const operatorBits: string[] = [];
  if (facts.developer) operatorBits.push(`developed by ${facts.developer}`);
  if (facts.registryIds) operatorBits.push(`listed on ${facts.registryIds}`);
  const a2 =
    operatorBits.length > 0
      ? `${name} is ${operatorBits.join(' and ')}.`
      : `Operator details for ${name} are not on file yet.`;

  const q3 = `What is its integrity score?`;
  const a3 =
    facts.integrityScore !== null
      ? `${facts.integrityScore} / 100. ${describeScoreDrivers(facts.scoreComponents)}`
      : `No integrity score has been published for ${name} yet.`;

  const q4 = `Why is it notable?`;
  const a4Source = netReadParagraph(paragraphs) || stripMd(summaryMd);
  const a4 = truncateWords(a4Source, 120);

  const q5 = `When was this last updated?`;
  const iso = generatedAt.toISOString().slice(0, 10);
  const a5 = `This dossier was generated on ${iso} by ${model}.`;

  return [
    { q: q1, a: a1 },
    { q: q2, a: a2 },
    { q: q3, a: a3 },
    { q: q4, a: a4 },
    { q: q5, a: a5 },
  ];
}
