/**
 * lib/authors.ts — named-author registry for E-E-A-T (WS1).
 *
 * KarbonLens is YMYL-adjacent (financial / market intelligence), where Google
 * and AI answer engines weigh author expertise heavily. Every news/editorial
 * post therefore carries a named human author with a job title, a bio, and a
 * dedicated author page — rather than an anonymous "Organization" byline.
 *
 * Authors are a small, hand-curated set, so they live in code (not the DB).
 * `news_posts.author_slug` references a key here; unknown/null slugs resolve to
 * DEFAULT_AUTHOR. To add a contributor: add an entry below — no migration.
 */

export type Author = {
  slug: string;
  /** Full display name, used in bylines and Person schema. */
  name: string;
  /** Role/title shown next to the name and in Person.jobTitle. */
  jobTitle: string;
  /** 1–3 sentence bio for the author page + Person.description. */
  bio: string;
  /** Optional canonical external profiles (LinkedIn, ORCID, …) for sameAs. */
  sameAs?: string[];
};

export const DEFAULT_AUTHOR_SLUG = 'andy-fajar-handika';

export const AUTHORS: Record<string, Author> = {
  'andy-fajar-handika': {
    slug: 'andy-fajar-handika',
    name: 'Andy Fajar Handika',
    jobTitle: 'Founder, KarbonLens',
    bio: 'Andy Fajar Handika is the founder of KarbonLens. After a decade building companies — he founded the Jakarta food-tech startup Kulina (and MakanDiantar before it), raising capital, managing teams across continents, and going the full distance from fundraise to exit — he now runs DLA Labs (PT Darat Laut Udara), a one-person product studio building at the intersection of AI and underserved domains. KarbonLens is one of them: it reconciles Indonesia’s fragmented carbon market — registries, prices, satellite monitoring, and regulation — into a single terminal. He builds end-to-end across the stack and works hands-on with LLM application stacks and evaluation. His guiding principle: fall in love with the problem, not your solution.',
    sameAs: ['https://www.linkedin.com/in/fajarhandika/'],
  },
};

/** Resolve an author by slug, falling back to the default author. */
export function getAuthor(slug?: string | null): Author {
  if (slug && Object.prototype.hasOwnProperty.call(AUTHORS, slug)) {
    return AUTHORS[slug];
  }
  return AUTHORS[DEFAULT_AUTHOR_SLUG];
}

/** Canonical on-site path for an author's page. */
export function authorPath(slug: string): string {
  return `/news/author/${slug}`;
}
