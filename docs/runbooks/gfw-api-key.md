# GFW (Global Forest Watch) API key — Andy's setup runbook

The T07 scraper (`scrapers/gfw/fetch.py`) registers geostores and queries the
integrated deforestation-alerts dataset on GFW's Data API. Both the `geostore`
endpoint and (critically) the `dataset/.../query` endpoint require a free API
key tied to a registered GFW account.

This runbook is for Andy (solo founder). Follow the steps in order the first
time; re-use them at renewal time (annual).

---

## 1. Register a GFW account

1. Go to https://www.globalforestwatch.org/ and sign up with your Google
   workspace email (the `admin@example.com` address is fine).
2. Verify the confirmation email.

---

## 2. Request an API key

1. Navigate to the developer portal:
   https://www.globalforestwatch.org/help/developers/

   (If that page redirects, look for "Data API" or "API key" in the footer
   or the help center — GFW occasionally renames the landing page.)

2. Click "Request API access" / "Create API key".

3. Fill the form:
   - Name: Andy Budiarto (or as registered)
   - Organization: Flying Monkey Group / KarbonLens
   - Use case: "Monitoring deforestation alerts near Indonesian carbon
     projects tracked by KarbonLens (karbonlens.com)."
   - Email: `admin@example.com`

4. Wait for the approval email. It typically arrives within minutes to a
   few hours; some applications require manual review and can take up to a
   business day.

---

## 3. Copy the key locally

Once the email confirms your key, copy it.

Edit the repo's `.env.local`:

```bash
cd /root/.openclaw/workspace/karbonlens
${EDITOR:-vim} .env.local
```

Replace the `GFW_API_KEY=CHANGE_ME` line with:

```
GFW_API_KEY=<your-actual-key>
```

Save and close.

**Important:** the scraper treats `CHANGE_ME`, empty string, and a handful
of obvious placeholders as "unset" and refuses to start with a helpful
error. This guard exists so accidental commits of the placeholder don't
produce real API traffic.

---

## 4. (Production) set on the VPS

Once v0.2 ships a VPS deploy, add the same line to `/opt/karbonlens/.env`:

```bash
ssh karbonlens-vps
sudo -i
echo "GFW_API_KEY=<your-actual-key>" >> /opt/karbonlens/.env
```

The weekly cron wrapper `scrapers/scripts/run_weekly_gfw.sh` sources this
file before invoking the scraper.

**App-side note:** the Next.js app does not call GFW directly in v0.1, so
`GFW_API_KEY` is not required in `/opt/karbonlens/app/.env.local`. When a
future version adds a server-side map proxy for GFW tiles, add the key
there too and restart the app service.

---

## 5. Smoke test

Once the key is in `.env.local`, verify end-to-end without touching the
live DB by running against a single project:

```bash
cd /root/.openclaw/workspace/karbonlens

# Pick any project UUID from the DB
PGPASSWORD="$(grep '^DATABASE_URL' .env.local | \
    sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')" \
  psql -h localhost -U karbonlens -d karbonlens \
  -c "SELECT id, slug FROM projects WHERE slug ILIKE '%katingan%' LIMIT 1;"

# Dry-run (no API calls, no writes)
./scrapers/.venv/bin/python -m scrapers.gfw.fetch \
    --dry-run --project-id <uuid>

# Real run for that single project
./scrapers/.venv/bin/python -m scrapers.gfw.fetch \
    --project-id <uuid>
```

Expected output (real run):

- A log line `project_geostore_registered` with a UUID if the project had
  no cached `gfw_geostore_id`.
- A log line `gfw_query_first_row_keys` showing the response row keys
  (confirms column names match the spec).
- A log line `project_alerts_upserted` with `alerts_inserted >= 0`.
- `run_complete` with `status: "ok"`.

---

## 6. Full weekly run

With the key in place, run all projects:

```bash
./scrapers/.venv/bin/python -m scrapers.gfw.fetch
```

Expected wall-clock time: ~128 s on first run (64 projects × 2 API calls ×
1 s sleep = 128 s floor), ~64 s on subsequent runs (one query per project,
geostore IDs cached).

---

## 7. Rotation / renewal

GFW keys expire annually. The developer portal shows the expiry date.
Set a calendar reminder for ~2 weeks before expiry and repeat steps 2–4
with the renewal flow (same account, no re-registration).

If a 401 slips through in production, the scraper exits with code 2 and
logs `gfw_auth_failed` with a pointer back to this runbook.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `GFW_API_KEY required — see docs/runbooks/gfw-api-key.md` | Key not set, or still at the `CHANGE_ME` placeholder. Re-do step 3. |
| `401 from https://data-api...` | Key invalid or expired. Verify in the GFW developer portal; regenerate if needed. |
| `403 ... Request is missing valid API key` on the query endpoint | Header wasn't sent (check `.env.local` load) or the key was silently stripped. Run with `--project-id <uuid>` and inspect the `gfw_client_error` log line. |
| `429 Too Many Requests` | Rare; the scraper already sleeps 1 s before each call. If you see this, another process (e.g. interactive `curl`) is contending. Wait 60 s, re-run. |
| 5xx from GFW | Transient; the scraper retries 3× with exponential backoff and continues to the next project on persistent failure. |

---

## References

- GFW Data API: https://data-api.globalforestwatch.org/
- GFW developer portal: https://www.globalforestwatch.org/help/developers/
