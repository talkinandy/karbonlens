# SEO Autopilot Runbook (N8N + LLM)

Fully-automatic, LLM-driven SEO content engine. The brain lives in **N8N**
(`https://n8n.polyburg.com`); the app exposes a verified opportunity feed and a
hard-gated publish endpoint. No Claude Code session is in the loop.

```
            ┌──────────────── N8N: "SEO Autopilot" workflow ────────────────┐
 schedule ─▶│ 1. GET  /api/seo/opportunities?type=editorial                  │
 (2×/week)  │ 2. pick top candidate → build prompt (brief + grounding facts) │
            │ 3. OpenAI chat/completions (JSON mode) → artifact + claims      │
            │ 4. POST /api/seo/autopilot/publish                             │
            └───────────────────────────┬───────────────────────────────────┘
                                         ▼
        app GATE (lib/seo/autopilot/gate.ts) — fail-closed, no human click:
        claims-grounded · numbers-declared · grounding-reverify (fresh DB read)
        · dedup · slop-lint · links-valid
                                         ▼
        pass → insert news_posts · revalidate /sitemap.xml + /news · IndexNow
        fail → seo_jobs row status='qa_failed' (422), nothing ships
                                         ▼
                 /admin/seo "Autopilot" tile shows the whole pipeline
```

Design rules:

1. **N8N talks to the app over HTTP, never raw Postgres.** Dedupe / sitemap
   revalidation / IndexNow all live in the app — one source of truth.
2. **The LLM may only state numbers it was handed as `grounding` facts**, and
   the gate **re-reads every one of those facts from the DB** before publish.
   N8N cannot smuggle a fabricated figure through.
3. Everything — queued, generated, published, **rejected** — is a `seo_jobs`
   row, visible on `/admin/seo`.

---

## 1. App-side env (production `/opt/karbonlens/app/.env.local`)

```sh
# Shared bearer secret between N8N and the autopilot endpoints.
openssl rand -base64 32        # generate once
SEO_AUTOPILOT_SECRET=<that value>
```

`NEXTAUTH_URL` (already set to `https://karbonlens.com`) is reused for the
IndexNow ping + returned URLs. Restart `karbonlens-app.service` after adding.

Apply the DB migration (creates `seo_jobs`, owned by `karbonlens`):

```sh
psql "$DATABASE_URL" -f scrapers/migrations/012_seo_autopilot_jobs.sql
```

---

## 2. Endpoints (contract)

### `GET /api/seo/opportunities`
Auth: `Authorization: Bearer $SEO_AUTOPILOT_SECRET`.
Params: `?type=editorial|meta|glossary` (optional filter), `?limit=N` (≤20).

Response:
```jsonc
{
  "generatedAt": "2026-06-16T05:00:00Z",
  "counts": { "editorial": 5, "meta": 3, "glossary": 2 },
  "opportunities": [
    {
      "jobType": "editorial",
      "ref": "editorial:katingan mentaya project carbon credits",
      "score": 1840,
      "reason": "Ranks ~#33 for ... 51 impressions/28d but 0 clicks ...",
      "targetQuery": "katingan mentaya project carbon credits",
      "targetUrl": "https://karbonlens.com/projects/katingan-...",
      "brief": "Write an authoritative, specifically-Indonesian piece ...",
      "grounding": [
        { "key": "project:katingan-...:name", "label": "Project name", "value": "Katingan Mentaya..." },
        { "key": "idx_price:2026-05:avg_price_idr", "label": "IDXCarbon avg price 2026-05", "value": "72000", "unit": "IDR/tCO2e" },
        { "key": "stat:total_projects", "label": "Indonesian projects tracked", "value": 312 }
      ],
      "hints": { "suggestedKind": "explainer", "relatedUrls": ["..."] }
    }
  ]
}
```

### `POST /api/seo/autopilot/publish`
Auth: same bearer. Body = the artifact **plus the grounding it was given**:
```jsonc
{
  "jobType": "editorial",
  "ref": "editorial:...",
  "externalId": "{{ n8n execution id }}",
  "llmModel": "gpt-4o",
  "tokensIn": 1234, "tokensOut": 2345,
  "targetQuery": "katingan mentaya project carbon credits",
  "kind": "explainer",
  "slug": "katingan-mentaya-project-carbon-credits-explained",
  "title": "≤70 chars",
  "summary": "≤320 chars",
  "bodyMd": "# ...markdown...",
  "claims": [
    { "factKey": "idx_price:2026-05:avg_price_idr", "statedValue": "72000" }
  ],
  "internalLinks": ["/projects/katingan-...", "/glossary/vm0007"],
  "grounding": [ /* echo the exact array from the opportunity */ ]
}
```
Responses: `200` published, `422` gate rejected (body has the per-check `qa`
report), `409` duplicate slug, `400` bad shape, `401/503` auth/config.

> Phase 1 publishes **editorial** only. `meta` and `glossary` opportunities are
> surfaced for visibility but their apply-surfaces (meta-override table,
> glossary data writes) land next — publishing them returns `400` until then.

---

## 3. N8N setup

1. **Create the API key** (if I don't have it): Settings → n8n API → Create.
2. **Credentials** (Credentials → New):
   - `KarbonLens Autopilot` — *Header Auth*: Name `Authorization`,
     Value `Bearer <SEO_AUTOPILOT_SECRET>`.
   - `OpenAI Autopilot` — *Header Auth*: Name `Authorization`,
     Value `Bearer <OPENAI_API_KEY>`.
3. **Import** `n8n/seo-autopilot.workflow.json`, attach the two credentials to
   their HTTP nodes, set the schedule, and **Activate**.

### Schedule
Twice weekly is a sane start (Mon + Thu, 07:00 Asia/Jakarta) — enough to build
a content cadence without flooding low-quality pages. Tune from the dashboard
pass-rate + ranking impact.

### The OpenAI call
`POST https://api.openai.com/v1/chat/completions`, `response_format:
{ "type": "json_object" }`, model `gpt-4o` (drop to `gpt-4o-mini` for cost once
quality is confirmed). The **system prompt** is the quality + safety contract:

```
You are a senior carbon-market analyst writing for KarbonLens, an Indonesian
carbon-market intelligence terminal. Write in clear, specific, professional
English (or Bahasa Indonesia if the target query is Indonesian).

HARD RULES:
- You may ONLY state numeric facts that appear in the provided `grounding`
  list. Never invent prices, volumes, dates, credit counts, or statistics.
- For every grounding number you use in the body, add an entry to `claims`
  with its factKey and the exact value you wrote.
- Only link to paths in `relatedUrls` or obvious on-site sections
  (/projects, /prices, /regulatory, /glossary, /methodology, /news).
- Do NOT use AI-tell phrases: "in the ever-evolving", "in conclusion",
  "it's important to note", "delve into", "navigating the", "a testament to",
  "game-changer", "rich tapestry", etc. Lead with the concrete data point.
- 1,500–8,000 characters of Markdown. Title ≤70 chars. Summary ≤320 chars.

Return ONLY JSON: { kind, slug, title, summary, bodyMd, claims:[{factKey,
statedValue}], internalLinks:[] }.
```
The **user message** is the opportunity's `brief` + a JSON dump of its
`grounding` + the `targetQuery`.

A `Code` node then merges the model output with the original `grounding` array
+ `externalId = $execution.id` and POSTs it to the publish endpoint.

---

## 4. Operating it

- **Watch**: `/admin/seo` → *Autopilot* tile (published 30d, gate pass-rate,
  recent jobs with the failed-check names inline).
- **Logs**: rejected artifacts are `seo_jobs` rows with `status='qa_failed'`
  and a full `qa.checks` array — query them to see *why* the LLM was blocked:
  ```sql
  SELECT id, title, qa FROM seo_jobs WHERE status='qa_failed' ORDER BY created_at DESC LIMIT 10;
  ```
- **Impact**: 3–4 weeks after a post ships, its `target_query` position in
  `seo_keyword_ranks` is the scoreboard (GSC cron already populates it daily).
- **Kill switch**: deactivate the N8N workflow, or unset `SEO_AUTOPILOT_SECRET`
  (endpoints return 503). Nothing else depends on it.

---

## 5. Roadmap (the other three work-types)

| Type | Detector | Apply surface needed | Status |
|------|----------|----------------------|--------|
| editorial | ✅ striking-distance queries | news_posts (exists) | **live** |
| meta / CTR | ✅ low-CTR pages | `seo_meta_overrides` table + `generateMetadata` merge | next |
| glossary | ✅ orphan methodology codes | glossary data write + rebuild | next |
| internal_link | pending | MD/anchor injection | later |
| programmatic | pending | hub-page generator (P2 backlog) | later |
