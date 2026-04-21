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
# Real-slug-drift note: the spec's placeholder keys (rimba-raya,
# cendrawasih-aru, kalimantan-forest-carbon-partnership) predate T06's canonical
# slugger. After T06 ran, only one of the three documented projects is present
# in the DB (`rimba-raya-biodiversity-reserve-project`). The other two are
# retained as placeholders pending Andy's OQ-1 confirmation — they will log a
# WARNING on each daily run but will not abort the job.
COMMUNITY_OVERRIDES: Final[dict[str, int]] = {
    "rimba-raya-biodiversity-reserve-project": 45,  # documented community tension
    "cendrawasih-aru": 30,  # OQ-1 placeholder — no matching DB slug yet
    "kalimantan-forest-carbon-partnership": 60,  # OQ-1 placeholder — no matching DB slug yet
}
