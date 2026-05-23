# Search Engine Onboarding Runbook

Manual one-time setup to get karbonlens.com into Google + Bing + Yandex baseline
crawls. This is what unblocks the IndexNow `422 InvalidRequestParameters` error
that the nightly cron has been logging since 2026-04-24 — Bing/Yandex refuse to
accept IndexNow pings for a domain they have not yet baseline-crawled.

These steps require an operator with login access to the three webmaster
consoles. Run them in this order — each unblocks the next.

## Prereqs

- A Google account with access to `karbonlens.com` DNS (Cloudflare or wherever
  the apex record lives).
- The Google verification meta tag is already deployed (`app/layout.tsx` line
  85, value `pmkyMzw-qY8lf21oEc8EMLsnJAknYWG1huO4JL7LQoQ`). No code change is
  needed to claim the property.

## 1. Google Search Console — claim + sitemap

1. Open <https://search.google.com/search-console>.
2. **Add property → URL prefix → `https://karbonlens.com`**.
3. The meta-tag verification path should verify instantly (the tag is already
   live). If it offers DNS TXT or HTML-file alternates, use the meta tag —
   it's already there.
4. After verification, **Sitemaps → Add new sitemap → `sitemap.xml`** →
   Submit. Expected: 200+ URLs discovered within a few hours.
5. **URL Inspection** → paste in turn:
   - `https://karbonlens.com/`
   - `https://karbonlens.com/projects`
   - `https://karbonlens.com/methodology`
   - `https://karbonlens.com/regulatory`
   - `https://karbonlens.com/prices`
   - 5 top-of-traffic project slugs (Katingan, Rimba Raya, etc.)

   For each: click **Request indexing**. This pushes Google to crawl now
   rather than waiting for the default discovery cadence.

## 2. Bing Webmaster Tools — this is the IndexNow unblock

1. Open <https://www.bing.com/webmasters>.
2. **Add a site → Import from GSC** — one-click. Authorises Bing to pull the
   property + sitemaps it already knows about from your GSC account.
3. After import, go to **Sitemaps** and confirm `https://karbonlens.com/sitemap.xml`
   is listed. If not, **Submit sitemap** manually.
4. **URL Inspection → Inspect URL → `https://karbonlens.com/`**, then click
   **Request indexing**. This is the action that forces Bingbot to do the
   baseline crawl of the domain — without it, IndexNow keeps returning 422
   for `karbonlens.com` URLs.
5. Wait 24–72 hours, then re-run the nightly IndexNow cron and check the log
   for status codes:

   ```sh
   tail -n 50 /var/log/karbonlens/indexnow-nightly.log
   ```

   Once Bing accepts pings the line emits `status: 200` (or 202). 422s should
   clear within a week.

## 3. Yandex Webmaster

1. Open <https://webmaster.yandex.com>.
2. **Add site → `karbonlens.com`**.
3. Verification: choose **DNS TXT** (cleanest — no code change). Add the
   provided `yandex-verification: ...` record to the apex zone. Cloudflare:
   DNS tab → Add record → Type TXT, Name `@`, Content `<token>`.
4. Once verified, **Indexing → Sitemap files → Add** `https://karbonlens.com/sitemap.xml`.
5. **Indexing → Re-indexing → Add URLs** for `/`, `/projects`, and a handful
   of detail pages.

After step 3 completes, Yandex's IndexNow node also accepts pings for the
domain — the cron's three-way 422 should drop to zero.

## 4. Verify

Wait 72h after BWT submission, then:

```sh
# Should now return status 200 or 202 for all three engines.
curl -X POST https://api.indexnow.org/IndexNow \
  -H "Content-Type: application/json" \
  -d '{
    "host": "karbonlens.com",
    "key": "'"$INDEXNOW_KEY"'",
    "keyLocation": "https://karbonlens.com/indexnow/'"$INDEXNOW_KEY"'.txt",
    "urlList": ["https://karbonlens.com/"]
  }'
```

Open `/admin/seo` (Indexation tile, SEO Phase 1) — once GSC API integration
ships, the indexed-pages count starts populating from the live property data.

## 5. nginx-side Cache-Control override

This is the primary mechanism for B1 in SEO Phase 1. Next 16.2 retired
the per-route `experimental_ppr` opt-in in favour of the broader
`cacheComponents` model — until we flip that on globally, public caching
has to be applied at the nginx layer for known-public paths:

```nginx
# /etc/nginx/sites-available/karbonlens — inside the server block
map $uri $karbonlens_public {
    default                                 "";
    "~^/$"                                  "yes";
    "~^/projects(/|$)"                      "yes";
    "~^/prices(/|$)"                        "yes";
    "~^/news(/|$)"                          "yes";
    "~^/glossary(/|$)"                      "yes";
    "~^/regulatory(/|$)"                    "yes";
    "~^/methodology(/|$)"                   "yes";
}

location / {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;

    # Override Next.js Cache-Control on known-public paths only.
    proxy_hide_header Cache-Control;
    add_header Cache-Control "public, s-maxage=300, stale-while-revalidate=86400" always;

    # Apply security headers everywhere.
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
}
```

Reload: `sudo nginx -t && sudo systemctl reload nginx`.

## 6. Apex / www canonicalisation

Confirm `www.karbonlens.com` redirects to apex. If it currently returns 200
(it does, per the audit), add this server block:

```nginx
server {
    listen 443 ssl http2;
    server_name www.karbonlens.com;
    ssl_certificate     /etc/letsencrypt/live/karbonlens.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/karbonlens.com/privkey.pem;
    return 301 https://karbonlens.com$request_uri;
}
```

## 7. SITEMAP_REVALIDATE_SECRET env

Generate a secret and add to `.env.local` (and the production env file):

```sh
openssl rand -base64 32
```

Set `SITEMAP_REVALIDATE_SECRET=<value>` in:

- `/opt/karbonlens/.env.production` (or wherever `karbonlens-app.service`
  reads its env from)
- The same value also has to be readable by `scripts/publish-weekly-wrap.ts`
  when it runs as the `karbonlens` user. Check
  `scripts/run_weekly_wrap.sh` for how env is wired.

Restart `karbonlens-app.service` to pick up the new env var.

## Why this matters

The IndexNow 422 "URLs not related" error is documented in
`/root/.claude/projects/-root--openclaw-workspace-karbonlens/memory/indexnow_cold_start.md`
as a known transient state. Steps 1–3 above are the unblock. After they
complete, the existing nightly cron starts working and we get free
re-indexing across Bing + Yandex + Naver + Seznam + Yep on every content
change.

Google does not participate in IndexNow — Google relies on the sitemap + URL
Inspection re-crawl request, which step 1.5 handles.
