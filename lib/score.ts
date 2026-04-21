/**
 * lib/score.ts — TypeScript mirror of the Python scoring logic.
 *
 * KEEP IN SYNC WITH scrapers/scoring/weights.py AND scrapers/scoring/compute.py.
 * Every WEIGHTS value, every bucket threshold in the sub-score functions, and
 * every entry in COMMUNITY_OVERRIDES must match the Python side numerically.
 * There is no automated cross-check in v0.1 — the DoD in T09's story requires
 * hand-verification on each change. The frontend (T12 project detail, T18
 * landing stats) re-evaluates scores at render time using this module to avoid
 * an extra DB round-trip; any Python↔TS drift produces a visible inconsistency
 * between the daily-written `project_scores.components` row and the UI.
 *
 * This file is the canonical home for the `ScoreComponents` type. `lib/schema.ts`
 * imports it here (the T04 placeholder at lib/schema.ts lines 229–237 has been
 * removed per the T09 spec §3 handoff).
 */

export const WEIGHTS = {
  validation_recency: 0.25,
  reversal_risk: 0.35,
  community_flags: 0.2,
  transparency: 0.2,
} as const;

export const METHODOLOGY_VERSION = 'v1' as const;

/**
 * Hardcoded community overrides for v0.1. Matched by `projects.slug` (exact).
 * If a slug listed here does not match a project in the DB, the Python
 * compute.py logs a WARNING and the override is silently ignored — projects
 * fall back to the default community_score of 75. Keep this mirror consistent
 * with `scrapers/scoring/weights.py :: COMMUNITY_OVERRIDES`.
 */
// Reconciled 2026-04-21: only Rimba Raya matches a real T06 slug. The two
// other spec placeholders (cendrawasih-aru, kalimantan-forest-carbon-partnership)
// have no matching project in the current Verra Indonesia dataset and are
// dormant here — uncomment when/if those projects appear via a future
// scraper pass.
export const COMMUNITY_OVERRIDES: Record<string, number> = {
  'rimba-raya-biodiversity-reserve-project': 45,
  // 'cendrawasih-aru-placeholder-slug': 30,
  // 'kalimantan-forest-carbon-partnership-placeholder-slug': 60,
};

/**
 * Raw inputs used to derive sub-scores. Implementation detail of the scoring
 * pipeline; carried inside `ScoreComponents.inputs` so the DB row preserves
 * provenance for later audit queries.
 */
export type ScoreInputs = {
  alerts_90d_count: number;
  high_conf_count: number;
  registry_count: number;
  years_since_validation: number | null;
};

/**
 * Canonical shape of `project_scores.components` JSONB. Consumers that read
 * the Drizzle-typed `projectScores.components` get this shape. Python's
 * `_compute_row()` emits the identical keys in compute.py.
 */
export type ScoreComponents = {
  validation_recency: number;
  reversal_risk: number;
  community_flags: number;
  transparency: number;
  inputs: ScoreInputs;
};

// ─── Sub-score functions (mirror scrapers/scoring/compute.py) ────────────────

/**
 * Bucketed recency score. `null` → 50 (unknown-neutral); else piecewise by
 * years-since-validation: <3 → 100, <5 → 85, <8 → 70, <12 → 50, else → 30.
 */
export function validationRecencyScore(validationDate: Date | null): number {
  if (validationDate === null) {
    return 50;
  }
  const now = Date.now();
  const days = (now - validationDate.getTime()) / (1000 * 60 * 60 * 24);
  const yearsSince = days / 365.25;
  if (yearsSince < 3) return 100;
  if (yearsSince < 5) return 85;
  if (yearsSince < 8) return 70;
  if (yearsSince < 12) return 50;
  return 30;
}

/**
 * Bucketed reversal score. `hasCoverage === false` (gfw_geostore_id IS NULL) →
 * 50 (unknown-neutral). With coverage: 0 alerts → 100; 0 high-conf & <10 total
 * → 85; <5 high-conf → 70; <20 high-conf → 45; else → 20.
 */
export function reversalScore(
  alerts90d: number,
  highConf: number,
  hasCoverage: boolean,
): number {
  if (!hasCoverage) return 50;
  if (alerts90d === 0) return 100;
  if (highConf === 0 && alerts90d < 10) return 85;
  if (highConf < 5) return 70;
  if (highConf < 20) return 45;
  return 20;
}

/** Exact-slug lookup in COMMUNITY_OVERRIDES; default 75. */
export function communityScore(slug: string): number {
  return COMMUNITY_OVERRIDES[slug] ?? 75;
}

/**
 * Bucketed transparency score. ≥2 registries with ≥1 active → 85; exactly 1
 * registry with 1 active → 70; ≥1 registry (no active) → 55; else → 40.
 */
export function transparencyScore(
  registryCount: number,
  activeRegistries: number,
): number {
  if (registryCount >= 2 && activeRegistries >= 1) return 85;
  if (registryCount === 1 && activeRegistries === 1) return 70;
  if (registryCount >= 1) return 55;
  return 40;
}

/**
 * Weighted composite, clamped [0, 100]. Applies the zero-registry cap:
 * when `registryCount === 0` the result is clamped to ≤60 (see compute.py
 * `integrity_score()` and the zero-data-trap note in the T09 spec audit).
 */
export function integrityScore(
  components: ScoreComponents,
  registryCount: number,
): number {
  const raw =
    components.validation_recency * WEIGHTS.validation_recency +
    components.reversal_risk * WEIGHTS.reversal_risk +
    components.community_flags * WEIGHTS.community_flags +
    components.transparency * WEIGHTS.transparency;
  let score = Math.max(0, Math.min(100, Math.round(raw)));
  if (registryCount === 0) {
    score = Math.min(score, 60);
  }
  return score;
}
