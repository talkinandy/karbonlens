# Content cadence — nightly IndexNow + weekly Market Wrap (T33)

This runbook covers the two automated content jobs introduced in T33: the nightly IndexNow delta-ping and the weekly Market Wrap publisher. Both run on the Hetzner box under the `karbonlens` user and log to `/var/log/karbonlens/`.

---

## Cron entries

Installed in the `karbonlens` user's crontab (verify with `crontab -u karbonlens -l`):

```
# Nightly IndexNow delta-ping (T33 Phase 4A) — 02:30 UTC (after 02:00 UTC backup)
30 2 * * * /opt/karbonlens/scripts/run_indexnow_nightly.sh >> /var/log/karbonlens/indexnow.log 2>&1

# Weekly Market Wrap publisher (T33 Phase 4B) — Mon 06:00 UTC (after 03:00-03:30 scrapers)
0 6 * * 1 /opt/karbonlens/scripts/run_weekly_wrap.sh >> /var/log/karbonlens/weekly-wrap.log 2>&1
```

Both wrapper scripts live in `/opt/karbonlens/scripts/` (owner `karbonlens:karbonlens`, mode `755`). They `cd` into `/opt/karbonlens/app` and invoke the TypeScript entrypoint via `./node_modules/.bin/tsx`.

Environment file: `/opt/karbonlens/.env` (sourced by the wrapper). Must contain `DATABASE_URL` and — for IndexNow to do anything beyond a log line — `INDEXNOW_KEY`.

---

## Nightly IndexNow

**What it does.** `scripts/indexnow-nightly.ts` unions 8 freshness sources (projects.updated_at, issuances.ingested_at, retirements.ingested_at, satellite_alerts.ingested_at, project_descriptions.generated_at, regulatory_events.created_at, idx_monthly_snapshots.scraped_at, news_posts.published_at), dedupes paths in-memory, and submits the 24h delta via a single POST to `api.indexnow.org/IndexNow`.

**Why this order.** The 02:30 UTC slot sits AFTER the 02:00 UTC pg-backup and BEFORE the 03:00 UTC scraper window. That means the ping reflects yesterday's steady-state — the current day's scraper writes will be picked up by the next run.

**Key file.** Served at `https://karbonlens.com/indexnow/{INDEXNOW_KEY}.txt` via `app/indexnow/[key]/route.ts`. If `INDEXNOW_KEY` is unset, the route 404s and the cron logs one `indexnow_noop` line per run.

**Cold-start gotcha.** IndexNow aggregators (Bing, Yandex, Naver, Seznam, Yep) reject pings with HTTP 422 "URLs not related to your site verified through the keylocation parameter" until they have crawled the domain at least once. This is NOT a code bug — it is a baseline-indexing precondition. Unblock by submitting `https://karbonlens.com/sitemap.xml` to Bing Webmaster Tools and waiting for the first crawl. After that, `status=200` and URLs start landing in the engines' index queues.

**Operational knobs.**
- Success log: `{"event":"indexnow_ok","status":200,"count":N,"url_count":N,"sample":[...]}`
- Noop: `{"event":"indexnow_noop"}` — either `INDEXNOW_KEY` unset or zero changes in 24h.
- Failure: `{"event":"indexnow_fail","status":422,...}` — expected until baseline crawl; no action.
- Crash: `{"event":"indexnow_crash","error":"..."}` — escalates via cron mail. Investigate the DB or the IndexNow endpoint.

**Manual dry-run:**
```bash
ssh root@49.13.82.0 'cd /opt/karbonlens/app && set -a; source /opt/karbonlens/.env; set +a; \
  sudo -u karbonlens -E ./node_modules/.bin/tsx scripts/indexnow-nightly.ts'
```

---

## Weekly Market Wrap

**What it does.** `scripts/publish-weekly-wrap.ts` queries 7 days of DB state (issuances, alerts, regulatory, prices), calls the deterministic composer at `lib/composers/weekly-wrap.ts`, and inserts one row into `news_posts` with `kind='weekly_wrap'`. On successful insert it fires an IndexNow ping for the new post URL + the `/news` index. The post renders at `/news/[slug]` via ISR (`revalidate = 3600`).

**Skip guardrail.** Publishing only happens when at least ONE signal fires:
- `≥1` new issuance, OR
- `≥5` new satellite alerts, OR
- `≥1` new regulatory event, OR
- A new price month landed in the window.

An empty week → `{"event":"weekly_wrap_skip","reason":"..."}` and exit 0. The cron is silent on skip by design (no filler content; avoids Helpful-Content-Update penalties).

**Idempotency.** The `news_posts` table has a unique expression index `uq_news_posts_kind_date` on `(kind, (published_at AT TIME ZONE 'UTC')::date)`. A second cron firing on the same UTC day hits `ON CONFLICT DO NOTHING` and logs `weekly_wrap_duplicate` — silent no-op, not an error.

**Why Monday 06:00 UTC.** Gives the 03:00–03:30 UTC scrapers (Verra, GFW, IDXCarbon daily-score) 2.5h of buffer to complete before the composer reads their outputs. Monday specifically so the post ships under the "week of [last Monday]" naming convention and lands in time for the Asian morning news cycle.

**Composer determinism.** The composer never calls an LLM. Title, summary, body-md, and facts-json are pure functions of the 7-day DB delta. Re-running against the same delta produces byte-identical output. The `facts_json` column stores the exact inputs the composer saw — re-templating a post under a new design is a one-line `UPDATE news_posts SET body_md = composeWeeklyWrap(facts_json)` job away.

**Manual dry-run:**
```bash
ssh root@49.13.82.0 'cd /opt/karbonlens/app && set -a; source /opt/karbonlens/.env; set +a; \
  sudo -u karbonlens -E ./node_modules/.bin/tsx scripts/publish-weekly-wrap.ts'
```

**Unpublishing a bad post.** If the composer ever produces a bad post, set `superseded_by = <new post id>` to chain-of-corrections it, or just `DELETE FROM news_posts WHERE id = '...'` — the `/news` index and sitemap will stop listing it on the next ISR revalidation (within 1 hour).

---

## Observed first run (2026-04-24)

First dry-run of the weekly wrap published `2026-04-20-indonesia-carbon-market-weekly-wrap`:
- 247,004 new satellite alerts (T07 backfill scope)
- 50 new issuances capped by the composer's `LIMIT 50` (actual delta was larger)
- 16.9M new credits issued
- 8 regulatory events
- March 2026 price month (new snapshot)
- IndexNow ping: `{ok:false,status:422}` — cold-start, will resolve after Bing baseline crawl.

The numbers here reflect the T07 live-alert backfill that landed the same day, not a typical week. A steady-state week will publish single- or low-double-digit alert counts.

---

## Known deployment gotchas

1. **postgres-js + raw `sql\`\`` + JS Date = boom.** The underlying postgres driver throws `TypeError [ERR_INVALID_ARG_TYPE]` during the Bind step when a JS `Date` is interpolated into a `drizzle-orm` raw `sql\`\`` template. Both T33 scripts convert explicitly: `${someDate.toISOString()}`. Typed drizzle operators (`gte(col, date)`) handle the conversion themselves; raw templates do not.
2. **No `generateStaticParams` under `app/(public)/`.** The shared layout reads session cookies for auth, which trips `DYNAMIC_SERVER_USAGE` during SSG prerender. News detail pages match the `/projects/[slug]` pattern: Dynamic + `revalidate = 3600` ISR, no `generateStaticParams`.
