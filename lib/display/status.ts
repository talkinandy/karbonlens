/**
 * lib/display/status.ts — Shared status badge mapping for T11 and T12.
 *
 * Ownership: T11 (creating owner). T12 consumes the same helper for its hero
 * badge so the two pages stay visually consistent, and contributes the
 * `badgePillClass` helper that maps a badge variant to a `.kl-pill--*` CSS
 * utility class.
 *
 * Input: the raw `projects.status` column — which currently holds the internal
 * canonical enum (`active`/`pipeline`/`suspended`/`flagged`) in v0.1. The
 * scraper-level Verra raw strings (`Registered`, `Under development`,
 * `Withdrawn`, etc.) are also accepted here so that if T06.1 later replaces the
 * column with raw Verra values, this file is the *only* place that needs
 * updating. See T11 §3.5 / OQ-1.
 *
 * Output: `displayStatus` returns a `{ label, badge }` pair where `badge` is
 * one of the five CSS categories used by `.kl-pill--*` in `app/globals.css`.
 * `badgePillClass` returns the full utility-class suffix (e.g. `kl-pill--success`).
 */

export type StatusBadge =
  | 'active'
  | 'pipeline'
  | 'suspended'
  | 'flagged'
  | 'unknown';

export type DisplayStatus = {
  label: string;
  badge: StatusBadge;
};

export function displayStatus(raw: string | null): DisplayStatus {
  if (raw === null || raw === undefined) {
    return { label: 'Unknown', badge: 'unknown' };
  }

  switch (raw) {
    // ── Canonical enum currently stored in the DB (v0.1) ───────────────────
    case 'active':
      return { label: 'Active', badge: 'active' };
    case 'pipeline':
      return { label: 'Pipeline', badge: 'pipeline' };
    case 'suspended':
      return { label: 'Suspended', badge: 'suspended' };
    case 'flagged':
      return { label: 'Flagged', badge: 'flagged' };

    // ── Raw Verra registry strings (ready for T06.1 when it lands) ─────────
    case 'Registered':
      return { label: 'Registered', badge: 'active' };
    case 'On hold':
      return { label: 'On hold', badge: 'active' };
    case 'Under development':
      return { label: 'Under development', badge: 'pipeline' };
    case 'Under validation':
      return { label: 'Under validation', badge: 'pipeline' };
    case 'Under verification':
      return { label: 'Under verification', badge: 'pipeline' };
    case 'Verification approval requested':
      return { label: 'Verification approval requested', badge: 'pipeline' };
    case 'Late to verify':
      return { label: 'Late to verify', badge: 'pipeline' };
    case 'Withdrawn':
      return { label: 'Withdrawn', badge: 'flagged' };
    case 'Rejected by Administrator':
      return { label: 'Rejected by Administrator', badge: 'flagged' };
    case 'Crediting period expired':
      return { label: 'Expired', badge: 'flagged' };

    default:
      return { label: raw, badge: 'unknown' };
  }
}

/**
 * Pill class suffix for a badge variant. The `.kl-pill` base class plus this
 * suffix gives the full utility class name (e.g. `kl-pill kl-pill--success`).
 *
 * Contributed by T12; consumed by both T11's `ProjectsTable` and T12's hero.
 */
export function badgePillClass(badge: DisplayStatus['badge']): string {
  switch (badge) {
    case 'active':
      return 'kl-pill--success';
    case 'pipeline':
      return 'kl-pill--info';
    case 'suspended':
      return 'kl-pill--danger';
    case 'flagged':
      return 'kl-pill--warning';
    default:
      return 'kl-pill--neutral';
  }
}
