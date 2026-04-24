# Project descriptions — KarbonLens (T30)

Per-project analyst narratives — a public summary + a gated analyst
briefing with inline `[N]` citations — rendered on `/projects/[slug]`.
Descriptions are generated out-of-band by a Claude research agent with
`WebSearch` + `WebFetch` and upserted into the `project_descriptions`
table via a small Node driver. The runtime app is read-only against
this table.

Initial batch (Apr 2026) covered all **64 Indonesian projects** across
six research waves. Confidence tiers: 3 high, 13 medium-high, 37
medium, 11 low.

---

## 1. Schema

Migration: `scrapers/migrations/006_project_descriptions.sql`

```sql
project_descriptions (
  project_id         uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  summary_md         text NOT NULL,          -- public, 2-3 sentences, <=70 words
  detail_md          text NOT NULL,          -- gated, 5-7 paragraphs with **Bolded headers.** and [N] markers
  citations          jsonb NOT NULL,         -- [{n, url, title, source?, date?}]
  input_fingerprint  text NOT NULL,          -- sha256 of known-fact inputs (drives refresh detection)
  model              text NOT NULL,          -- 'claude-agent-websearch' for the v0.1 batch
  confidence         text NOT NULL,          -- 'high' | 'medium-high' | 'medium' | 'low'
  confidence_reason  text,                   -- one-sentence justification
  generated_at       timestamptz NOT NULL    -- updated on every upsert
)
```

Drizzle schema: `lib/schema.ts` → `projectDescriptions`.

Read accessor: `lib/queries/project-description.ts` → `getProjectDescription(projectId)` — swallows missing-table errors so dev DBs without migration 006 render cleanly (returns `null` → renderer renders nothing).

---

## 2. Rendering contract

`components/projects/detail/ProjectDescription.tsx` handles both tiers:

- **Public (unauthed):** `summary_md` always visible; first paragraph of
  `detail_md` rendered as a teaser with inline `[N]` superscripts; rest
  hidden behind a soft fade + "Sign in to read the full analysis" CTA
  linking to `/?signin=1&from=/projects/{slug}` (routes into the
  existing `SignInRequiredModal`).
- **Signed in:** full briefing + numbered `<ol>` of citations anchored
  by `id="cite-N"`; every `[N]` marker is a clickable superscript
  jumping to `#cite-N`.

Every block carries an AI-disclosure footer: `AI-generated from public
sources on {iso-date} · confidence: {tier} · model: {model} · [Flag
inaccuracy]` (mailto with prefilled subject).

Tiny markdown parser is in-file (lines 160–210 of the component): only
recognises `**Heading.**` paragraphs, blank-line paragraph separation,
and inline `[N]` markers — the shapes the research agent is briefed to
produce. If the agent drifts outside those shapes the renderer degrades
gracefully (paragraphs render as plain prose, unknown markers are
dropped).

---

## 3. Research agent brief

Every project is researched by a fresh agent with this contract:

**Inputs (known facts — the agent must not contradict these):**
project_id, name, developer, province, type, methodology, hectares,
status. Passed verbatim in the prompt.

**Tools:** `WebSearch` (2–4 queries) + `WebFetch` (3–5 pages). Target
sources vary by sector:

| Project type | Primary sources |
|---|---|
| REDD+ / AFOLU | Verra registry, Mongabay, REDD-Monitor, CIFOR, CarbonPlan, The Diplomat, Pulitzer Center |
| Blue carbon | Verra, Livelihoods Fund, YAGASU, BakauMU, WBCSD NCS |
| CDM energy | UNFCCC CDM, Global Energy Monitor, PLN, ThinkGeoEnergy, Power Technology |
| Biogas (POME) | UNFCCC CDM, KIS Group, Gree Energy, GAPKI, Mongabay |
| Cookstoves | Verra, Calyx Global, ICVCM, Argus, Bloomberg, Climate Home News |
| Cross-cutting | Indonesia-Verra MRA coverage (Oct 2025), Perpres 110/2025, COP30 Indonesian portfolio |

**Output (strict JSON in a ```json``` fenced block):**

```json
{
  "project_id": "<uuid>",
  "public_summary": "2-3 sentences, <=70 words",
  "detail_md": "5-7 paragraphs, each beginning with **Bolded header.** Order: Activities & scale / landscape or operational context / Developer / Methodology status & CERs / Issuance & buyers / Latest news / Net read. Every non-known-fact claim carries a [N] citation.",
  "citations": [ { "n": 1, "url": "...", "title": "...", "source": "...", "date": "YYYY-MM" } ],
  "confidence": "high | medium-high | medium | low",
  "confidence_reason": "one sentence"
}
```

**Latest-news rule.** A dedicated paragraph. Real dated news from the
last 12–18 months with `[N]` attribution, OR — exactly — the string
`"No material third-party news surfaced in the last 12 months in the
sources reviewed."` Do not invent, do not recycle older events as if
recent, do not pad with developer PR.

**Confidence calibration.**

- `high` — ≥3 independent credible sources agree on core claims.
- `medium-high` — 2 independent sources plus primary registry/UNFCCC page.
- `medium` — developer disclosures corroborated by one third-party source.
- `low` — thin public coverage; primarily inferred from adjacent context. Candid.

**Guardrails.**

- Only cite URLs the agent actually `WebFetch`ed — not URLs that only
  appeared in search snippets.
- Contiguous `[N]` numbering starting at 1; no dangling markers.
- Phrase uncertain claims as uncertain ("reported by Mongabay in 2024
  [2]"), never as bare fact.
- When asked to research an obscure project, a candid `low` confidence
  is more useful than a padded `medium`.

---

## 4. Upsert driver

Script: `/tmp/upsert-descriptions.mjs` (also on the prod box at the
same path — not in the repo because it's a one-shot operational tool).

Usage:

```bash
ssh root@49.13.82.0 'node /tmp/upsert-descriptions.mjs /tmp/wave-N.json'
```

Input JSON shape (array of rows matching the columns below):

```json
[
  {
    "project_id": "uuid",
    "summary_md": "…",
    "detail_md": "…",
    "citations": [ { "n": 1, "url": "…", "title": "…", "source": "…", "date": "…" } ],
    "confidence": "high|medium-high|medium|low",
    "confidence_reason": "…",
    "input_fingerprint": "…"
  }
]
```

Transaction shape: `BEGIN; INSERT ... ON CONFLICT (project_id) DO UPDATE SET ... generated_at = now(); ...; COMMIT`.

The driver uses PostgreSQL dollar-quoting (`$kldesc$...$kldesc$`) for
string literals so multi-paragraph markdown with embedded quotes and
backslashes passes through psql intact.

---

## 5. How to regenerate a single project

1. Pull the known facts from prod:
   ```sql
   SELECT slug, name_canonical, developer, province, project_type,
          methodology, hectares::text, status
   FROM projects WHERE slug = '<slug>';
   ```
2. Spawn a research agent via the `Agent` tool (`general-purpose`
   subagent) using the brief in §3. Keep `project_id` verbatim.
3. Paste the agent's JSON into a single-row array in a `/tmp/wave-X.json` file.
4. Upsert per §4.
5. Force-rebuild the Next.js cache if the page served a stale version:
   ```bash
   ssh root@49.13.82.0 'cd /opt/karbonlens/app && sudo -u karbonlens rm -rf .next && sudo -u karbonlens npm run build && systemctl restart karbonlens-app'
   ```

---

## 6. How to regenerate the full batch

Waves of 10 concurrent agents, spawned in a single message with
multiple `Agent` tool calls. After each wave: collect JSON outputs,
write `/tmp/wave-N.json`, scp + upsert. Typical runtime: ~2–3 min per
wave + ~30s upsert. Full 64-project refresh: ~30 minutes wall clock.

Two failure modes seen in the initial batch:

- **Agent returns with 0 tool uses and no citations.** The agent
  bypassed `WebSearch`/`WebFetch` and produced output from training
  knowledge. Fix: respawn with an explicit brief that says "IMPORTANT:
  you MUST use WebSearch and WebFetch tools" and requires
  `citations.length >= 2`.
- **Agent output drifts from schema** (uses `paragraphs: [...]` array
  or nested `research: {...}` object instead of a flat `detail_md`
  string). Fix: normalise in the driver — flatten paragraph arrays
  with `**Heading.** <body>\n\n` joins. Happened twice in wave 4; not
  worth hardening the schema further.

---

## 7. Refresh strategy (v0.2)

`input_fingerprint` is a sha256 over the known-fact inputs. When
scraper updates change any of them (new issuance total, status change,
new GFW alert count), a weekly cron sweep can identify stale
fingerprints and re-queue affected projects. v0.1 has no refresh
loop — regenerate manually per §5 until the cron lands.

Stale threshold default: `generated_at < now() - interval '90 days'`.
Index `idx_proj_desc_generated` supports the sweep query.

---

## 8. Known data-quality findings from the initial batch

The research pass surfaced several DB inconsistencies worth fixing in
`projects`:

| Project | Finding | Suggested correction |
|---|---|---|
| Sumatra Merang Peatland Project (SMPP) | Has been issuing ~1.2 Mt/yr since 2019; BeZero AAA. DB flags as `pipeline`. | Status → `active` |
| Hamparan biogas project | Feedstock is cassava starch mill effluent in Lampung, not POME. Operational since Dec 2020. | Location → Lampung; status → `active`; methodology tag correct (AMS-III.H + AMS-I.D apply to both) |
| Kaltim Hutama IFM | Concession is in Kaimana (West Papua) + Nabire (Central Papua), NOT East Kalimantan despite the "Kaltim" company name. | Province → West Papua |
| AES AgriVerde AIN07-W-05 | Methodology labelled AMS-II.H in the DB; UNFCCC record says AMS-III.H. | Methodology → AMS-III.H |
| Kopi Lestari + PURE Agroforestry | Methodology field describes AR-AMS0007 as "wetlands"; it's actually for non-wetlands A/R (AR-AMS0003 is the wetland sibling). | Correct the family label |
| Dalle Energy Batam | Registered CDM activity is ACM0007 (CCGT conversion), not AM0029 as DB labels. Fixed 10-year crediting period expired May 2022. | Methodology → ACM0007; status note |
| Rohul Sawit Industri | Biogas plant is a separate 2023 Pasadena Biofuels asset; only the 2010 co-composting project (CDM 3401, AMS-III.F) was ever registered, crediting period expired 2017. | Tag as legacy CDM rather than current pipeline |

Surfacing these to the ingest pipeline is v0.2 work; for now the
briefings flag the corrections inline so users see the reconciliation.

---

## 9. Cost

Each agent run: ~30k–50k tokens (covered by the Claude subscription —
**$0 marginal cost**). 64 projects × six waves ran inside ~30 minutes
of wall-clock time and did not trip rate limits.

Perplexity was evaluated as an alternative but rejected: the
me-via-WebSearch loop produces better citation hygiene for this
domain (can judge source credibility, cross-reference Mongabay vs
developer PR, flag data-quality issues in the underlying DB) and costs
nothing extra.
