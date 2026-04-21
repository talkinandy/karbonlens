"""Score weighting constants.

KEEP IN SYNC WITH lib/score.ts — both files must expose the same numeric values
for WEIGHTS and the same entries in COMMUNITY_OVERRIDES. The frontend
(lib/score.ts, consumed by T12/T18) recomputes sub-scores for display-only
rendering; any drift between this module and lib/score.ts will produce visibly
inconsistent scores between the daily-written DB row and the live UI.
"""

from __future__ import annotations

from typing import Final

WEIGHTS: Final[dict[str, float]] = {
    "validation_recency": 0.25,
    "reversal_risk": 0.35,
    "community_flags": 0.20,
    "transparency": 0.20,
}

VERSION: Final[str] = "v1"

# Hardcoded community overrides for v0.1. Matched by projects.slug (exact).
# If a slug listed here does not exist in the DB, the override is silently
# skipped and the project uses the default community_score of 75 (see edge
# case E5 in docs/stories/T09-score-computation.md §7).
#
# Reconciled 2026-04-21: the spec's original placeholder keys `cendrawasih-aru`
# and `kalimantan-forest-carbon-partnership` do not correspond to any project
# in the Verra Indonesia dataset ingested by T06. They are kept as
# commented-out placeholders — if/when those projects appear (e.g. re-
# registered under Gold Standard or a successor methodology), uncomment the
# matching entry. Keeping them dormant rather than active avoids the runtime
# warning that would otherwise fire on every daily score run.
COMMUNITY_OVERRIDES: Final[dict[str, int]] = {
    "rimba-raya-biodiversity-reserve-project": 45,  # documented community tension
    # "cendrawasih-aru-placeholder-slug": 30,                      # not in DB
    # "kalimantan-forest-carbon-partnership-placeholder-slug": 60, # not in DB
}
