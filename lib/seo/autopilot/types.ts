/**
 * lib/seo/autopilot/types.ts — the N8N ↔ app contract for SEO Autopilot.
 *
 * The opportunity endpoint hands N8N a list of `Opportunity` candidates, each
 * carrying the REAL DB facts (`grounding`) the LLM is allowed to use. The LLM
 * fills in an artifact and posts it back; the publish endpoint validates it
 * against a fresh read of those facts before anything goes live.
 *
 * Grounding is the anti-hallucination spine: the model may only state numbers
 * it received as `GroundingFact`s, and every stated value is re-checked at the
 * gate. See lib/seo/autopilot/gate.ts.
 */

import type { SeoJobType } from '@/lib/schema';

/** A single verifiable fact handed to the LLM. `value` is canonical (from DB). */
export type GroundingFact = {
  key: string; // stable handle the LLM cites, e.g. 'idx_avg_price_idr_2026_05'
  label: string; // human description, e.g. 'IDXCarbon avg price May 2026 (IDR/tCO2e)'
  value: string | number; // canonical value, straight from the DB
  unit?: string;
};

/** A candidate piece of work, ranked by ROI, with everything the LLM needs. */
export type Opportunity = {
  jobType: SeoJobType;
  /** Stable dedup handle — same opportunity across runs yields the same id. */
  ref: string;
  /** Why this surfaced + the rank score (higher = do first). */
  score: number;
  reason: string;
  targetQuery: string | null;
  targetUrl: string | null;
  /** Brief the LLM is prompted with. */
  brief: string;
  /** Verified facts the LLM may cite. The ONLY numbers it's allowed to state. */
  grounding: GroundingFact[];
  /** For editorial: suggested kind + internal-link anchors that exist. */
  hints?: {
    suggestedKind?:
      | 'explainer'
      | 'evergreen'
      | 'comparison'
      | 'investigation'
      | 'market_report'
      | 'news_brief';
    relatedUrls?: string[];
  };
};

/** A claim the LLM makes, tying a stated value back to a grounding fact key. */
export type ArtifactClaim = {
  factKey: string;
  statedValue: string | number;
};

/** The artifact N8N posts back for an editorial job. */
export type EditorialArtifact = {
  jobType: 'editorial';
  ref: string;
  externalId?: string; // N8N execution id
  llmModel?: string;
  tokensIn?: number;
  tokensOut?: number;
  targetQuery: string | null;
  kind: 'explainer' | 'evergreen' | 'comparison' | 'investigation' | 'market_report';
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  /** Every material number in bodyMd must be declared here and match grounding. */
  claims: ArtifactClaim[];
  /** Internal links the body uses — must all be real on-site paths. */
  internalLinks?: string[];
};

/** Meta/title rewrite for a page that already ranks (CTR optimisation). */
export type MetaArtifact = {
  jobType: 'meta';
  ref: string;
  externalId?: string;
  llmModel?: string;
  tokensIn?: number;
  tokensOut?: number;
  targetUrl: string;
  targetQuery: string | null;
  title: string;
  description: string;
};

/** A Carbon News Brief: original summaries of ingested news, citing + linking out. */
export type NewsBriefArtifact = {
  jobType: 'news_brief';
  ref: string;
  externalId?: string;
  llmModel?: string;
  tokensIn?: number;
  tokensOut?: number;
  kind: 'news_brief';
  targetQuery?: string | null;
  slug: string;
  title: string;
  summary: string;
  bodyMd: string;
  /** Source article URLs cited — each must be an ingested carbon_news_items url. */
  sources: string[];
  internalLinks?: string[];
};

/** One structured regulatory event extracted from sourced news. */
export type RegulatoryEventDraft = {
  eventDate: string; // YYYY-MM-DD
  ministry?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  title: string;
  /** Source URL — must be an ingested carbon_news_items url (traceability). */
  documentUrl: string;
  summaryEn: string;
  summaryId?: string | null;
  importance?: 'high' | 'medium' | 'low' | null;
  tags?: string[];
  isUpcoming?: boolean;
};

/** A batch of regulatory events the LLM extracted from gov/registry news. */
export type RegulatoryArtifact = {
  jobType: 'regulatory';
  ref: string;
  externalId?: string;
  llmModel?: string;
  tokensIn?: number;
  tokensOut?: number;
  targetQuery?: string | null;
  events: RegulatoryEventDraft[];
};

export type AutopilotArtifact =
  | EditorialArtifact
  | MetaArtifact
  | NewsBriefArtifact
  | RegulatoryArtifact;
