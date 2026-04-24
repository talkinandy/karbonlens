---
story: T01
auditor: spec-auditor (claude-sonnet-4-6)
audited_commit: 98e77c34dc29e228208e6a67df9ff94d32bc2774
verdict: PASS-WITH-FIXES
---

## Summary

T01 is a well-structured provisioning story with unusually thorough edge-case coverage and mechanically testable ACs. It is not ready for implementation as-is: two blocking issues exist — the `pg_hba.conf` add step is commented-out/optional in the runbook so AC-4 cannot deterministically pass, and the `listen_addresses` default is not actually confirmed as active (it is commented out in `postgresql.conf`, leaving PG in its compiled default which _happens_ to be `localhost`, but the story claims the default is "already safe" as if it were explicitly set). Three additional non-blocking issues weaken the spec but don't gate implementation. No cross-story blockers remain after confirming `pg_trgm` ships with `postgresql-16` on this box.

---

## Blocking findings

**Finding 1 — pg_hba.conf add step is commented-out / optional, making AC-4 non-deterministic**

The runbook step 7 shows the `host karbonlens karbonlens 127.0.0.1/32 scram-sha-256` line as a _commented-out suggestion_ behind an `# If no matching line exists, add one:` guard. On THIS box the actual `pg_hba.conf` already has `host all all 127.0.0.1/32 trust` — meaning AC-4 will pass today, but via `trust` (no password check), not `scram-sha-256`. On a box with a stricter `pg_hba.conf` that lacks a `host` line covering `karbonlens`, AC-4 would fail at runtime and the implementer has no unconditional fix in front of them.

**Impact:** AC-4 is unreliable across environments. On this box, the connection succeeds with `trust` auth — meaning the password generated in step 3 is never actually validated by Postgres. Any role could connect as `karbonlens` without a password, which is a security regression vs. the intended `scram-sha-256` posture stated in OQ-5.

**Recommended fix:** Promote the `pg_hba.conf` line from a commented-out hint to an unconditional idempotent step in the runbook:

```bash
# Step 7 — ensure karbonlens role has scram-sha-256 TCP auth
grep -qF "karbonlens karbonlens 127.0.0.1/32 scram-sha-256" /etc/postgresql/16/main/pg_hba.conf \
  || echo "host karbonlens karbonlens 127.0.0.1/32 scram-sha-256" \
       >> /etc/postgresql/16/main/pg_hba.conf
systemctl reload postgresql
```

Also add a corresponding AC or sub-check to AC-4: verify that the matching `pg_hba.conf` line is `scram-sha-256` (not `trust`), e.g.:

```bash
grep "karbonlens.*scram-sha-256" /etc/postgresql/16/main/pg_hba.conf
```

---

**Finding 2 — `listen_addresses` is commented out in `postgresql.conf`; story claims the default is "already safe" without requiring confirmation**

On this box, `/etc/postgresql/16/main/postgresql.conf` has `#listen_addresses = 'localhost'` (commented out). PostgreSQL's compiled-in default when the directive is absent is `localhost`, so the effective behaviour is safe — but the spec says "Verify `listen_addresses = 'localhost'`... confirm and document." The runbook step 6 only shows how to read the setting and edit it if wrong; it does not include an unconditional `grep` or `psql SHOW` that would actually fail if the line were set to `*`. AC-5's `ss -tlnp | grep 5432` check would catch a public binding at runtime, but the `SHOW listen_addresses` sub-check would print `localhost` even when the directive is absent (because PG reports its effective value, not the file content), so the implementer gets a false sense of having verified an explicit config line.

**Impact:** If a future APT upgrade or configuration management tool uncomments `listen_addresses` and sets it to `*`, neither AC-5's first sub-check nor the runbook step 6 would catch it before the `ss` check — which only fires during the smoke test, not continuously. The story's security-critical claim about the default is accurate today but fragile.

**Recommended fix:** Add an explicit unconditional idempotent line to runbook step 6 that sets the directive (not just reads it):

```bash
# Explicitly set listen_addresses rather than relying on the compiled default
grep -qE "^listen_addresses\s*=\s*'localhost'" /etc/postgresql/16/main/postgresql.conf \
  || (sed -i "s/^#*listen_addresses\s*=.*/listen_addresses = 'localhost'/" \
       /etc/postgresql/16/main/postgresql.conf \
     && systemctl restart postgresql)
```

Update the story §3 scope bullet from "confirm and document" to "explicitly set and verify."

---

## Non-blocking suggestions

**Suggestion A — AC-7 and AC-8 use inconsistent hostnames (`127.0.0.1` vs `localhost`)**

AC-7 checks that `/root/karbonlens-secrets.txt` contains `@127.0.0.1:5432/karbonlens`, while AC-8 checks that `.env.example` contains `@localhost:5432/karbonlens`. The runbook step 3 writes `DATABASE_URL=postgresql://karbonlens:${DB_PASS}@127.0.0.1:5432/karbonlens` to the secrets file, and T04 expects `DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens` in `.env.local`. These resolve to the same socket but are not identical strings. An implementer copying from the secrets file into `.env.local` will get `127.0.0.1` where T04's docs show `localhost`. When T04's `lib/db.ts` is debugged, the mismatch generates confusion and support overhead. The architecture.md §7 shows `localhost` without `sslmode`.

**Recommended fix:** Standardise on `localhost` in both files. Update runbook step 3 to write `@localhost:5432` into the secrets file. Update AC-7 expected grep to match `@localhost:5432`.

---

**Suggestion B — AC-9 (idempotence) is not mechanically testable**

AC-9 states "run the full setup sequence a second time... no command exits non-zero" but provides no concrete command to invoke. The "full setup sequence" is unspecified — does it mean runbook sections 1–8 verbatim? Or just step 9 (the smoke test)? A careful implementer cannot satisfy AC-9 without knowing exactly which command to run.

**Recommended fix:** Replace the prose with a concrete command, for example:

```bash
# Re-run all runbook steps except apt update (which is safe but slow):
bash /opt/karbonlens/runbook-setup.sh 2>&1 | grep -E "^(ERROR|FATAL)" ; echo "exit: $?"
```

Or at minimum add to the story: "Re-run runbook sections 2–8 (skip section 1 apt install if packages already present); every command must exit 0."

---

**Suggestion C — Reversal path entirely absent**

§7 edge cases cover many failure modes during provisioning, but there is no "how to undo" section for cases where provisioning is partially wrong and must be torn down (e.g., wrong password was stored, database was created with wrong owner, directory was created owned by root). The story §3 says "out of scope" does not mention reversal, and §8 DoD does not require any undo documentation.

**Recommended fix:** Add a brief §11 "Reversal notes" to the story (or a matching section in the runbook) covering: `DROP DATABASE karbonlens;`, `DROP ROLE karbonlens;`, `userdel karbonlens`, `rm -rf /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens /root/karbonlens-secrets.txt`. No automation needed — a one-paragraph manual cleanup note suffices.

---

**Suggestion D — `listen_addresses = 'localhost'` does NOT prevent IPv6 binding**

When PostgreSQL's `listen_addresses` is set to `localhost`, on most modern Linux systems this resolves to _both_ `127.0.0.1` (IPv4) AND `::1` (IPv6). AC-5's `ss -tlnp | grep 5432` check will therefore show two entries — `127.0.0.1:5432` and `[::1]:5432` — and the story's assertion "port 5432 is bound only to 127.0.0.1" will appear violated even when the configuration is correct. An implementer who reads the `ss` output literally may panic and try to restrict to IPv4-only.

**Recommended fix:** Update AC-5 wording:

```
Then port 5432 is bound only to loopback addresses (127.0.0.1 and/or ::1 — not 0.0.0.0 or a public IP)
```

And update the §7 edge case text to clarify that `::1` is expected and safe.

---

**Suggestion E — Secrets file location security rationale not resolved despite OQ-3**

OQ-3 asks whether `/root/karbonlens-secrets.txt` is the right location if Andy uses a non-root day-to-day account, but §6 "Unsafe defaults" angle is only partially addressed. The story notes it as an open question without a resolution or a "proceed with this default" decision. An implementer following the spec will write to `/root/karbonlens-secrets.txt` and mark T01 done, but if Andy later switches to a non-root sudo user (common best practice), the credential is inaccessible without `sudo cat`. This is not blocking because Andy confirmed root as the operator account for this box, but the question remains unresolved in the spec text.

**Recommended fix:** Close OQ-3 explicitly with: "Root is the operator account for v0.1. The `/root/karbonlens-secrets.txt` location is accepted. Revisit when a non-root operator account is introduced."

---

## Cross-story issues

**T02 / pg_trgm OS package (NOT a blocker — confirmed)**

T02 E3 states "`CREATE EXTENSION pg_trgm` will fail if the `postgresql-16-pg_trgm` OS package is absent" and says "fix: install `postgresql-contrib`." This is factually wrong on this box: `pg_trgm` extension files (`pg_trgm.control`, `pg_trgm--*.sql`) are owned by the `postgresql-16` package itself, not by `postgresql-contrib`. They are already present on disk when Postgres 16 is installed. The T02 E3 note will mislead an implementer into installing an unnecessary package or, worse, concluding pg_trgm is unavailable when it is not.

**Required fix in T02:** Update T02 §7 E3 to read: "On Ubuntu/PGDG installs of PostgreSQL 16, `pg_trgm` ships with the core `postgresql-16` package and requires no additional OS package. `CREATE EXTENSION pg_trgm` should succeed without installing `postgresql-contrib`."

**T02 also redundantly installs extensions (acceptable)**

T01 enables `postgis`, `pgcrypto`, and `pg_trgm` via `CREATE EXTENSION IF NOT EXISTS`. T02's migration 001 also includes these three `CREATE EXTENSION IF NOT EXISTS` statements. This is safe (idempotent) and intentional (migration file should be self-contained for staging/fresh DBs), but worth noting: the T01 AC-2 already validates extension presence, so T02 AC-3 is a partial re-check. No action needed; document in T02 §2 that the duplication is deliberate.

**T04 / sslmode not specified**

T01's `.env.example` placeholder and T04's expected `DATABASE_URL` format are both `postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens` — no `?sslmode=` parameter. This is correct for v0.1 localhost-only access (PG does not require SSL for loopback by default, and the Drizzle `postgres` driver does not mandate it). No action needed, but if T04 later adds `sslmode=require` or `sslmode=disable` to its AC, T01's placeholder must be updated to match.

---

## Proposed spec edits

**Edit 1 — Story §4 AC-4: add pg_hba.conf verification sub-check**

Replace:
```
Then the command exits 0 and the result row shows "karbonlens | karbonlens"
```
With:
```
Then the command exits 0 and the result row shows "karbonlens | karbonlens"
And when we run:
  grep "karbonlens.*scram-sha-256" /etc/postgresql/16/main/pg_hba.conf
Then the line is present (confirming password auth, not trust, is in effect)
```

**Edit 2 — Runbook §7: make pg_hba.conf line unconditional**

Replace the entire commented-out block with:
```bash
grep -qF "karbonlens karbonlens 127.0.0.1/32 scram-sha-256" /etc/postgresql/16/main/pg_hba.conf \
  || echo "host karbonlens karbonlens 127.0.0.1/32 scram-sha-256" \
       >> /etc/postgresql/16/main/pg_hba.conf
systemctl reload postgresql
```

**Edit 3 — Story §4 AC-5: fix IPv6 assertion**

Replace:
```
Then port 5432 is bound only to 127.0.0.1 (not 0.0.0.0)
```
With:
```
Then port 5432 is bound only to loopback addresses (127.0.0.1 and/or ::1) — not 0.0.0.0 or any public IP
```

**Edit 4 — Story §3 scope: change "confirm and document" to "explicitly set"**

Replace:
```
- Verify `listen_addresses = 'localhost'` in `postgresql.conf` (default on Hetzner Ubuntu is already safe; confirm and document).
```
With:
```
- Explicitly set `listen_addresses = 'localhost'` in `postgresql.conf` and verify the effective value. Do not rely on the compiled-in default; make the setting explicit so future configuration tooling cannot silently revert it.
```

**Edit 5 — Story OQ-3: close the open question**

Append to OQ-3:
```
**Decision:** Root is the operator account for v0.1. The `/root/karbonlens-secrets.txt` location is accepted. Revisit when a non-root operator account is introduced in v0.2 ops hardening.
```

**Edit 6 — T02 §7 E3: correct the package name**

Replace:
```
Fix: install the package (`apt install postgresql-16-contrib`, which includes pg_trgm) and re-run.
```
With:
```
Fix: verify that `postgresql-16` is installed (pg_trgm ships with the core package on PGDG Ubuntu builds). Run `dpkg -S pg_trgm.control` to confirm. Installing `postgresql-contrib` is not required and will not resolve a missing extension binary.
```

---

## Sign-off conditions

The verdict flips to **PASS** when:

1. **Required (blocking):** Apply Edit 2 to the runbook to make the `pg_hba.conf` line unconditional + idempotent, and apply Edit 1 to AC-4 to verify `scram-sha-256` is in effect.
2. **Required (blocking):** Apply Edits 3 and 4 to fix the `listen_addresses` ambiguity and the IPv6 false-positive in AC-5.
3. **Recommended before implementation:** Apply Edit 6 to T02 to remove the incorrect `postgresql-contrib` claim.
4. **Deferrable to implementation time:** Suggestions B (AC-9 command), C (reversal notes), E (OQ-3 closure) and Edit 5 can be addressed during or after implementation without blocking T01 start.
