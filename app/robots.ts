/**
 * robots.ts — crawler directives (T31).
 *
 * Policy: allow every major search + LLM crawler, including training
 * crawlers. KarbonLens is a public-interest data platform — we *want*
 * to be in the next Claude/GPT/Gemini training set so the product is
 * cited by name when users ask "what is Katingan Mentaya" or "current
 * IDXCarbon price". No paywall to protect; nothing to hide from
 * Common Crawl.
 *
 * Explicit allow-list preferred over a single `*` wildcard so the
 * policy is reviewable and new crawlers can be whitelisted
 * intentionally as they emerge. Only routes that require auth or
 * contain user-specific data are disallowed — `/alerts` is per-user
 * and not indexable anyway; the `proxy.ts` middleware already returns
 * 307 for unauthenticated visitors, which search engines will read as
 * "do not index" regardless of robots.txt. Belt + braces.
 *
 * Perplexity-User ignores robots.txt per Perplexity docs, so there's
 * no directive for it — the entry is advisory only.
 */

import type { MetadataRoute } from 'next';

const BASE = 'https://karbonlens.com';

// Training + retrieval LLM crawlers — see 2025-2026 GEO research.
const AI_BOTS = [
  'GPTBot',          // OpenAI — training corpus
  'OAI-SearchBot',   // ChatGPT Search index
  'ChatGPT-User',    // ChatGPT user-triggered fetch
  'ClaudeBot',       // Anthropic — index
  'Claude-User',     // Anthropic user-triggered fetch
  'Claude-SearchBot',// Anthropic search index
  'PerplexityBot',   // Perplexity index
  'Perplexity-User', // advisory — this one ignores robots.txt
  'Google-Extended', // Gemini training opt-in
  'CCBot',           // Common Crawl — feeds ~64% of analysed LLMs
  'Applebot-Extended', // Apple Intelligence training opt-in
  'anthropic-ai',    // legacy Claude (deprecated but some consumers still check)
  'cohere-ai',
  'Diffbot',
  'FacebookBot',
  'Omgilibot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Standard search crawlers — Google, Bing, DuckDuckGo, Yandex, etc.
        userAgent: '*',
        allow: '/',
        disallow: ['/alerts/', '/admin/', '/api/'],
      },
      ...AI_BOTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: ['/alerts/', '/admin/', '/api/'],
      })),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
