# T19 Implementation Report — Cron installation on VPS

**Story:** T19 — Cron installation on VPS
**Status:** done
**Audit result:** PASS

---

## What was done

5 cron entries installed under the `karbonlens` user on the Hetzner box via `scrapers/scripts/install-crontab.sh` (idempotent):

| Schedule (UTC) | WIB equivalent | Job |
|---|---|---|
| Mon 00:00 | Mon 07:00 | Weekly digest (T17) |
| Mon 03:00 | Mon 10:00 | Verra scraper (T06) |
| Mon 03:30 | Mon 10:30 | GFW scraper (T07) |
| Daily 04:00 | Daily 11:00 | Score computation (T09) |
| 1st of month 04:00 | 1st 11:00 | IDXCarbon scraper (T08) |

`MAILTO=""` suppresses cron email (structured logs + T22 Sentry cover observability).

Scripts rsynced to `/opt/karbonlens/scripts/` (karbonlens:karbonlens, +x). Crontab staged via `/tmp` (needed because `karbonlens` can't traverse `/root/.openclaw/...`).

`/opt/karbonlens/.env` bootstrapped at chmod 640 karbonlens:karbonlens with fresh 48-char `DIGEST_CRON_SECRET` and `CHANGE_ME` placeholders for `DATABASE_URL`/`GFW_API_KEY`/`RESEND_API_KEY`.

`/etc/logrotate.d/karbonlens` configured weekly/rotate 4/compress with `su karbonlens karbonlens` directive so rotation runs under the correct identity.

Cross-story edits: T07's `run_weekly_gfw.sh` gained a `GFW_API_KEY` guard; T17's `run_weekly_digest.sh` skips gracefully when `RESEND_API_KEY` is empty.

Runbook at `docs/runbooks/cron-install.md` documents install + secret population + smoke-test.

## Deviations from spec

- 5 entries not 7 — spec counted the two T20 backup entries that live in `pg-cron.conf` instead; those are T20's responsibility.
- `.env` chmod 640 not 600 — `karbonlens` must read; 640 karbonlens:karbonlens is equivalent to 600 for that user.
- Fresh `DIGEST_CRON_SECRET` generated on bootstrap (correct behaviour; spec implied a fixed value).

---

## T19 follow-ups

- **Andy action required — populate `/opt/karbonlens/.env`:** The `.env` file was bootstrapped with `CHANGE_ME` placeholders for `DATABASE_URL` (PGPASSWORD comes from `/root/karbonlens-secrets.txt`), `GFW_API_KEY`, and `RESEND_API_KEY`. Until these are populated, the wrappers for T07 (`run_weekly_gfw.sh`) and T17 (`run_weekly_digest.sh`) exit 0 with guard log lines and do not attempt network calls. The Verra, score, and IDXCarbon jobs do not require these keys and will run normally once the DB password is set.

- **DIGEST_CRON_SECRET:** A fresh 48-character secret was generated during install and written to `/opt/karbonlens/.env`. Andy can retrieve it with:
  ```bash
  sudo cat /opt/karbonlens/.env | grep DIGEST_CRON_SECRET
  ```
  This value is needed for manual `curl` smoke-testing of the `/api/digest/cron` endpoint (see T17 runbook).

- **Cron times are UTC:** Mon 00:00 = 07:00 WIB digest; Mon 03:00 = 10:00 WIB verra; Mon 03:30 = 10:30 WIB gfw; daily 04:00 = 11:00 WIB scoring; monthly 1st 04:00 = 11:00 WIB idxcarbon. All well clear of midnight local time; no DST risk (WIB is fixed UTC+7).

- **Pre-existing shellcheck warnings:** T06/T07/T09 wrappers had minor shellcheck warnings (unquoted variables, `source` vs `.`) present before T19. These were left untouched to stay within T19's scope. A follow-up linting pass can clean them in a single commit without changing runtime behaviour.
