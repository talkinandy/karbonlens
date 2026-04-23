/**
 * ProjectDescription — T30. Renders the public summary + gated analyst
 * briefing stored in `project_descriptions`.
 *
 * - Anonymous users: public summary always visible, first paragraph of the
 *   briefing visible as a teaser, remaining paragraphs hidden behind a
 *   sign-in gate (links to `/?signin=1&from=/projects/{slug}`, which opens
 *   the existing `SignInRequiredModal`).
 * - Signed-in users: full briefing + inline [N] citations + citations list.
 *
 * Markdown: we only need **bold**, paragraphs, and inline [N] citation
 * markers. A tiny in-file parser handles this without pulling in a full
 * markdown lib — the detail copy comes from a known source (our own research
 * agent) so the shape is predictable.
 *
 * Every block carries the AI-generated disclosure footer with `generatedAt`
 * + model + a "Flag inaccuracy" mailto. Users always know they're reading
 * machine-drafted prose.
 */

import Link from 'next/link';
import type { ProjectDescription as ProjectDescriptionRow } from '@/lib/queries/project-description';

type Props = {
  description: ProjectDescriptionRow | null;
  isAuthed: boolean;
  projectSlug: string;
};

export function ProjectDescription({ description, isAuthed, projectSlug }: Props) {
  if (!description) {
    return null; // quiet empty state — the rest of the page still renders
  }

  const paragraphs = splitParagraphs(description.detailMd);

  return (
    <section className="kl-desc" aria-label="Project description">
      <div className="kl-desc-summary">
        <p>{description.summaryMd}</p>
      </div>

      <div className="kl-desc-briefing">
        <h2 className="kl-section-label">Analyst briefing</h2>
        {isAuthed ? (
          <>
            <FullBriefing
              paragraphs={paragraphs}
              citations={description.citations}
            />
            <CitationsList citations={description.citations} />
          </>
        ) : (
          <GatedBriefing
            paragraphs={paragraphs}
            citations={description.citations}
            projectSlug={projectSlug}
          />
        )}

        <Disclosure
          generatedAt={description.generatedAt}
          model={description.model}
          confidence={description.confidence}
          projectSlug={projectSlug}
        />
      </div>
    </section>
  );
}

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
