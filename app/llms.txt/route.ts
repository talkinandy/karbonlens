/**
 * GET /llms.txt — LLM-facing site descriptor (T31 / T32).
 *
 * Format: per the llmstxt.org spec — a Markdown file with H1 + blockquote
 * tagline + categorised sections of links. Hand-curated, static. Lists the
 * stable public surface area of KarbonLens so retrieval LLMs (Claude, GPT,
 * Perplexity, Gemini) can ground answers about the platform without
 * having to crawl the full site.
 *
 * For the full project enumeration (one row per indexed project + its
 * integrity score) see `/llms-full.txt`. Per llmstxt.org guidance, llms.txt
 * stays small and human-curated; llms-full.txt is the dynamic / expanded
 * companion file.
 *
 * Cache: hourly. The link list itself almost never changes — only the
 * blockquote tagline and section bodies are touched when we add a new
 * top-level surface (e.g. `/about`). One hour keeps Netlify's edge cache
 * fresh enough that copy edits land same-day without burning origin CPU.
 */

const BODY = `# KarbonLens

> Indonesian carbon-market intelligence. Reconciled SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace. Primary data covers ~200 projects, monthly IDXCarbon prices, and weekly satellite alerts.

## Project Registry

- [Projects explorer](https://karbonlens.com/projects): Filterable registry of Indonesian carbon projects across Verra, Gold Standard, CDM, and SRN-PPI.
- [Methodology](https://karbonlens.com/methodology): How the v1 integrity score is calculated — validation recency, reversal risk, community, transparency.

## Market data

- [IDXCarbon prices](https://karbonlens.com/prices): Monthly volume and price snapshots from Indonesia's carbon exchange.

## Regulatory

- [Regulatory timeline](https://karbonlens.com/regulatory): Indonesian carbon-market regulations since Perpres 98/2021.

## Site policies

- [Privacy](https://karbonlens.com/privacy)
- [Terms](https://karbonlens.com/terms)
`;

export async function GET(): Promise<Response> {
  return new Response(BODY, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// Hourly revalidation — the body is a string constant, so this is mostly
// belt-and-braces against any future move to dynamic content.
export const revalidate = 3600;
