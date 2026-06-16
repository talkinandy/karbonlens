/**
 * app/(public)/news/[slug]/page.tsx — weekly wrap detail (T33 Phase 4B).
 *
 * Renders one `news_posts` row. The `bodyMd` column contains a narrow,
 * predictable dialect of Markdown written by `scripts/publish-weekly-wrap.ts`
 * (H2, bullets, bold, italic, inline links, pipe tables, paragraphs). Rather
 * than pull in a markdown library, we parse that dialect inline — the writer
 * is deterministic, so the renderer stays small and auditable.
 *
 * Route is dynamic (ISR-cached via `revalidate = 3600`). We do NOT use
 * `generateStaticParams`: the (public) layout uses cookies for auth, which
 * throws DYNAMIC_SERVER_USAGE during the SSG prerender path. Matching the
 * project-detail pattern (also ƒ Dynamic), each request hits the DB, then
 * Next.js caches the rendered HTML for an hour.
 *
 * Two JSON-LD blocks emitted: Article (with `isPartOf` the Blog URL used by
 * `/news`), and BreadcrumbList (Home → News → title).
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { JsonLd } from '@/components/seo/JsonLd';
import { getAuthor, authorPath } from '@/lib/authors';
import {
  getNewsPostBySlug,
  type NewsPost,
} from '@/lib/queries/news';

type Props = {
  params: Promise<{ slug: string }>;
};

const BASE = 'https://karbonlens.com';

const MONTHS_LONG = [
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

function formatDateLong(d: Date): string {
  const day = d.getUTCDate();
  const month = MONTHS_LONG[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getNewsPostBySlug(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.summary,
    openGraph: {
      title: post.title,
      description: post.summary,
      url: `/news/${slug}`,
      type: 'article',
      publishedTime: post.publishedAt.toISOString(),
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.summary,
    },
    alternates: { canonical: `/news/${slug}` },
  };
}

// ── Inline markdown renderer ──────────────────────────────────────────────
//
// Supported shapes (all the weekly-wrap composer emits):
//   `## Heading`            → serif <h2>
//   `- bullet`              → <ul><li>…</li></ul> (consecutive bullets fuse)
//   `| a | b |` rows        → <table class="kl-table"> inside .kl-table-scroll
//   blank line              → paragraph break
//   other line              → <p>
// Inline inside any line:
//   `**bold**`              → <strong>
//   `*italic*`              → <em>
//   `[text](url)`           → <Link> for internal paths, <a target=_blank> external
//
// Anything that doesn't match (e.g. H1, code fences, images) falls through
// as a plain <p> so unexpected output degrades to readable text rather than
// crashing the page.

type Inline = string | React.ReactElement;

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*/g;
const ITALIC_RE = /(?<!\*)\*(?!\*)([^*\n]+?)\*(?!\*)/g;

type InlineNode =
  | { kind: 'text'; value: string }
  | { kind: 'bold'; value: string }
  | { kind: 'italic'; value: string }
  | { kind: 'link'; value: string; href: string };

function renderInline(text: string, keyBase: string): Inline[] {
  // Two passes: outer links, then bold/italic on the surviving text runs.
  // Links come first so bold inside link text still renders; italic is
  // matched last because `*` is the most ambiguous delimiter.
  const nodes: InlineNode[] = [];

  const linkParts: InlineNode[] = [];
  let lastIdx = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) {
      linkParts.push({ kind: 'text', value: text.slice(lastIdx, idx) });
    }
    linkParts.push({ kind: 'link', value: m[1], href: m[2] });
    lastIdx = idx + m[0].length;
  }
  if (lastIdx < text.length) {
    linkParts.push({ kind: 'text', value: text.slice(lastIdx) });
  }

  for (const part of linkParts) {
    if (part.kind === 'link' || part.kind === 'bold' || part.kind === 'italic') {
      nodes.push(part);
      continue;
    }
    expandBoldItalic(part.value, nodes);
  }

  return nodes.map((n, i) => {
    const key = `${keyBase}-${i}`;
    switch (n.kind) {
      case 'text':
        return n.value;
      case 'bold':
        return <strong key={key}>{n.value}</strong>;
      case 'italic':
        return <em key={key}>{n.value}</em>;
      case 'link': {
        const href = n.href;
        const isInternal = href.startsWith('/');
        if (isInternal) {
          return (
            <Link
              key={key}
              href={href}
              style={{ color: 'var(--info-fg)', textDecoration: 'underline' }}
            >
              {n.value}
            </Link>
          );
        }
        return (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--info-fg)', textDecoration: 'underline' }}
          >
            {n.value}
          </a>
        );
      }
    }
  });
}

function expandBoldItalic(s: string, out: InlineNode[]): void {
  // Bold first, then italic on the surviving text runs.
  let cursor = 0;
  const boldMatches = [...s.matchAll(BOLD_RE)];
  for (const m of boldMatches) {
    const idx = m.index ?? 0;
    if (idx > cursor) {
      expandItalic(s.slice(cursor, idx), out);
    }
    out.push({ kind: 'bold', value: m[1] });
    cursor = idx + m[0].length;
  }
  if (cursor < s.length) {
    expandItalic(s.slice(cursor), out);
  }
}

function expandItalic(s: string, out: InlineNode[]): void {
  let cursor = 0;
  const matches = [...s.matchAll(ITALIC_RE)];
  for (const m of matches) {
    const idx = m.index ?? 0;
    if (idx > cursor) {
      out.push({ kind: 'text', value: s.slice(cursor, idx) });
    }
    out.push({ kind: 'italic', value: m[1] });
    cursor = idx + m[0].length;
  }
  if (cursor < s.length) {
    out.push({ kind: 'text', value: s.slice(cursor) });
  }
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.includes('|', 1);
}

function isTableSeparator(line: string): boolean {
  // e.g. "| --- | --- |" or "|:---|---:|"
  const t = line.trim();
  if (!isTableRow(t)) return false;
  return /^\|\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|$/.test(t);
}

function splitTableRow(line: string): string[] {
  const t = line.trim();
  // Drop leading/trailing pipes, then split.
  const inner = t.slice(1, -1);
  return inner.split('|').map((c) => c.trim());
}

function renderMarkdown(md: string): React.ReactElement[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: React.ReactElement[] = [];
  let i = 0;
  let blockIdx = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — paragraph separator.
    if (trimmed === '') {
      i += 1;
      continue;
    }

    // H2 heading.
    if (trimmed.startsWith('## ')) {
      const heading = trimmed.slice(3).trim();
      out.push(
        <h2
          key={`h-${blockIdx++}`}
          style={{
            fontFamily: 'var(--font-instrument-serif), Georgia, serif',
            fontSize: 22,
            fontWeight: 400,
            lineHeight: 1.3,
            margin: '28px 0 12px',
            letterSpacing: '-0.2px',
          }}
        >
          {renderInline(heading, `h-${blockIdx}`)}
        </h2>,
      );
      i += 1;
      continue;
    }

    // Bullet list — consume consecutive `- ` lines.
    if (trimmed.startsWith('- ')) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2));
        i += 1;
      }
      const key = `ul-${blockIdx++}`;
      out.push(
        <ul
          key={key}
          style={{
            margin: '0 0 14px',
            paddingLeft: 22,
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text)',
          }}
        >
          {items.map((item, idx) => (
            <li key={`${key}-li-${idx}`} style={{ marginBottom: 4 }}>
              {renderInline(item, `${key}-li-${idx}`)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Pipe table — consume rows, optionally skipping a separator.
    if (isTableRow(trimmed)) {
      const header = splitTableRow(trimmed);
      i += 1;
      if (i < lines.length && isTableSeparator(lines[i])) {
        i += 1;
      }
      const bodyRows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i].trim())) {
        if (isTableSeparator(lines[i])) {
          i += 1;
          continue;
        }
        bodyRows.push(splitTableRow(lines[i].trim()));
        i += 1;
      }
      const key = `tbl-${blockIdx++}`;
      out.push(
        <div key={key} className="kl-table-scroll">
          <table className="kl-table">
            <thead>
              <tr>
                {header.map((h, idx) => (
                  <th key={`${key}-h-${idx}`}>
                    {renderInline(h, `${key}-h-${idx}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, ridx) => (
                <tr key={`${key}-r-${ridx}`}>
                  {row.map((cell, cidx) => (
                    <td key={`${key}-r-${ridx}-c-${cidx}`}>
                      {renderInline(cell, `${key}-r-${ridx}-c-${cidx}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Default — paragraph. Consume contiguous non-blank, non-special lines.
    const paraLines: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      const nt = next.trim();
      if (
        nt === '' ||
        nt.startsWith('## ') ||
        nt.startsWith('- ') ||
        isTableRow(nt)
      ) {
        break;
      }
      paraLines.push(next);
      i += 1;
    }
    const key = `p-${blockIdx++}`;
    out.push(
      <p
        key={key}
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          color: 'var(--text)',
          margin: '0 0 14px',
        }}
      >
        {renderInline(paraLines.join(' '), key)}
      </p>,
    );
  }

  return out;
}

export default async function NewsPostPage({ params }: Props) {
  const { slug } = await params;
  const post: NewsPost | null = await getNewsPostBySlug(slug);
  if (!post) {
    notFound();
  }

  const dateLong = formatDateLong(post.publishedAt);
  const isoPublished = post.publishedAt.toISOString();
  const author = getAuthor(post.authorSlug);

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    datePublished: isoPublished,
    dateModified: isoPublished,
    description: post.summary,
    author: {
      '@type': 'Person',
      name: author.name,
      jobTitle: author.jobTitle,
      url: `${BASE}${authorPath(author.slug)}`,
      ...(author.sameAs && author.sameAs.length > 0 ? { sameAs: author.sameAs } : {}),
    },
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: BASE,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE}/news/${slug}`,
    },
    isPartOf: {
      '@type': 'Blog',
      '@id': `${BASE}/news`,
      name: 'KarbonLens weekly wrap',
    },
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: `${BASE}/`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'News',
        item: `${BASE}/news`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: post.title,
        item: `${BASE}/news/${slug}`,
      },
    ],
  };

  return (
    <main className="kl-page">
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 20 }}>
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            <Link
              href="/news"
              style={{
                color: 'var(--text-3)',
                textDecoration: 'none',
              }}
            >
              ← All posts
            </Link>
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 10 }}>
            {post.title}
          </h1>
          <p
            className="kl-muted"
            style={{ fontSize: 13, margin: 0 }}
          >
            By{' '}
            <Link
              href={authorPath(author.slug)}
              rel="author"
              style={{ color: 'var(--info-fg)', textDecoration: 'none' }}
            >
              {author.name}
            </Link>
            {', '}
            {author.jobTitle}
            {' · Published '}
            <time dateTime={isoPublished}>{dateLong}</time>
          </p>
        </header>

        <div>{renderMarkdown(post.bodyMd)}</div>

        <p className="kl-desc-disclosure">
          Auto-composed from KarbonLens&apos;s weekly data refresh. Numbers and
          links are verified against the source tables at publish time; see{' '}
          <Link href="/methodology">methodology</Link> for the data sources.
        </p>
      </article>

      <JsonLd data={articleSchema} id="ld-article" />
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
    </main>
  );
}
