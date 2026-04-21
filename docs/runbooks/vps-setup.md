# VPS setup runbook — KarbonLens T01

**Purpose:** Copy-pasteable shell commands to provision the Hetzner CX32 for KarbonLens v0.1.
**Run as:** root (or a user with passwordless sudo).
**Idempotent:** Yes — re-running is safe. Each block checks before creating.

---

## 0. Verify prerequisites

```bash
# Confirm Postgres 16 is installed
psql --version          # must print "psql (PostgreSQL) 16.x"
systemctl is-active postgresql
```

If Postgres is not version 16, stop here and reprovision Postgres 16 before continuing.

---

## 1. Install PostGIS

```bash
apt update
apt install -y postgresql-16-postgis-3 postgresql-16-postgis-3-scripts
```

Note: `postgresql-contrib` is **not required**. The `pg_trgm` and `pgcrypto` extensions ship with the core `postgresql-16` package on PGDG Ubuntu builds and are already on disk after a standard Postgres 16 install.

---

## 2. Create Unix system user

```bash
# Idempotent: only creates if missing
id karbonlens &>/dev/null \
  && echo "User already exists — skipping" \
  || useradd -r -s /usr/sbin/nologin -m -d /home/karbonlens karbonlens

# Verify
id karbonlens
getent passwd karbonlens | cut -d: -f7   # should print /usr/sbin/nologin
```

---

## 3. Generate and save the DB password

```bash
# Only generate a new password if the secrets file does not already exist
if [ ! -f /root/karbonlens-secrets.txt ]; then
  DB_PASS=$(openssl rand -base64 24)
  cat > /root/karbonlens-secrets.txt <<EOF
# KarbonLens secrets — $(date +%Y-%m-%d)
# chmod 600 is set below; do not share this file
DB_PASS=${DB_PASS}
DATABASE_URL=postgresql://karbonlens:${DB_PASS}@localhost:5432/karbonlens
EOF
  chmod 600 /root/karbonlens-secrets.txt
  echo "Password generated and saved."
else
  echo "Secrets file already exists — reusing existing password."
fi

# Load the password into the current shell
DB_PASS=$(grep '^DB_PASS=' /root/karbonlens-secrets.txt | cut -d= -f2)
echo "DB_PASS loaded (${#DB_PASS} chars)"
```

---

## 4. Create Postgres role and database

```bash
# Check if role exists before creating
ROLE_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='karbonlens';")

if [ "$ROLE_EXISTS" = "1" ]; then
  echo "Postgres role already exists — skipping CREATE USER"
else
  sudo -u postgres psql -c "CREATE USER karbonlens WITH PASSWORD '${DB_PASS}';"
fi

# Check if database exists before creating
DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='karbonlens';")

if [ "$DB_EXISTS" = "1" ]; then
  echo "Database already exists — skipping CREATE DATABASE"
else
  sudo -u postgres psql -c "CREATE DATABASE karbonlens OWNER karbonlens;"
fi
```

---

## 5. Enable extensions

```bash
sudo -u postgres psql -d karbonlens <<'SQL'
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
SQL
```

---

## 6. Set listen_addresses explicitly and verify binding

```bash
PGCONF=/etc/postgresql/16/main/postgresql.conf

# Unconditionally set listen_addresses = 'localhost' (removes commented-out default)
grep -qE "^listen_addresses\s*=\s*'localhost'" "$PGCONF" \
  || (sed -i "s|^#*listen_addresses\s*=.*|listen_addresses = 'localhost'|" "$PGCONF" \
     && systemctl restart postgresql)

# Verify effective setting
sudo -u postgres psql -c "SHOW listen_addresses;"

# Confirm port is bound only to loopback (both 127.0.0.1 and ::1 are expected and safe)
ss -tlnp | grep 5432
# Expected: 127.0.0.1:5432 and [::1]:5432 (NOT 0.0.0.0:5432 or a public IP)
```

---

## 7. Force scram-sha-256 auth for karbonlens in pg_hba.conf

pg_hba.conf is first-match wins. These lines must appear BEFORE any `trust` line covering 127.0.0.1/::1, otherwise `trust` takes precedence and the generated password is never validated.

```bash
PGHBA=/etc/postgresql/16/main/pg_hba.conf

# IPv4 loopback
LINE='host    karbonlens    karbonlens    127.0.0.1/32    scram-sha-256'
grep -qxF "$LINE" "$PGHBA" || echo "$LINE" | sudo tee -a "$PGHBA"

# IPv6 loopback
LINE6='host    karbonlens    karbonlens    ::1/128         scram-sha-256'
grep -qxF "$LINE6" "$PGHBA" || echo "$LINE6" | sudo tee -a "$PGHBA"

# Remove any trust entry that would apply to the karbonlens user on TCP loopback
# (Leaves peer auth for the postgres superuser on Unix socket intact)
sudo sed -i '/^host[[:space:]]\+karbonlens[[:space:]]\+karbonlens[[:space:]]\+127\.0\.0\.1\/32[[:space:]]\+trust/d' "$PGHBA"
sudo sed -i '/^host[[:space:]]\+karbonlens[[:space:]]\+karbonlens[[:space:]]\+::1\/128[[:space:]]\+trust/d' "$PGHBA"

# Reload so changes take effect without a full restart
sudo systemctl reload postgresql

# Verify
grep karbonlens "$PGHBA"
```

---

## 8. Create application directories

`install -d` creates the directory (including parents) and sets owner/mode atomically. It is idempotent — safe to re-run.

```bash
install -d -o karbonlens -g karbonlens -m 755 /opt/karbonlens
install -d -o karbonlens -g karbonlens -m 755 /var/log/karbonlens
install -d -o karbonlens -g karbonlens -m 755 /var/lib/karbonlens
install -d -o karbonlens -g karbonlens -m 755 /var/lib/karbonlens/backups
install -d -o karbonlens -g karbonlens -m 755 /var/lib/karbonlens/pdf-archive

# Verify
stat -c "%U:%G %a %n" \
  /opt/karbonlens \
  /var/log/karbonlens \
  /var/lib/karbonlens/backups \
  /var/lib/karbonlens/pdf-archive
```

---

## 9. Acceptance smoke test

Run every check and confirm each passes before marking T01 done.

```bash
# AC-1: PostGIS version ≥ 3
sudo -u postgres psql -d karbonlens -c "SELECT postgis_version();"

# AC-2: All three extensions present
sudo -u postgres psql -d karbonlens -c "\dx" | grep -E "pgcrypto|pg_trgm|postgis"

# AC-3: Unix user, no-login shell
id karbonlens
getent passwd karbonlens | cut -d: -f7

# AC-4: Postgres role can connect via TCP with scram-sha-256
DB_PASS=$(grep '^DB_PASS=' /root/karbonlens-secrets.txt | cut -d= -f2)
PGPASSWORD="$DB_PASS" psql -U karbonlens -h 127.0.0.1 -d karbonlens \
  -c "SELECT current_user, current_database();"
# Also confirm scram-sha-256 is in pg_hba.conf (not trust)
grep "karbonlens.*scram-sha-256" /etc/postgresql/16/main/pg_hba.conf

# AC-5: Localhost-only binding (::1 alongside 127.0.0.1 is expected and safe)
sudo -u postgres psql -c "SHOW listen_addresses;"
ss -tlnp | grep 5432
# Expected: 127.0.0.1:5432 and [::1]:5432 — neither 0.0.0.0 nor a public IP

# AC-6: Directory ownership
stat -c "%U:%G %a %n" \
  /opt/karbonlens /var/log/karbonlens \
  /var/lib/karbonlens/backups /var/lib/karbonlens/pdf-archive

# AC-7: Secrets file permissions
stat -c "%a %U" /root/karbonlens-secrets.txt
grep DATABASE_URL /root/karbonlens-secrets.txt

# AC-8: Idempotence — re-run sections 2–8 and confirm no errors
# (Re-run the blocks above; each guard should print "already exists — skipping")
```

---

## 10. Copy the connection string into .env.local (local dev)

T01 does **not** touch `.env.example` — that file is owned by T03.

To wire up local dev against the VPS database:

```bash
# Show the real DATABASE_URL from the secrets file
grep DATABASE_URL /root/karbonlens-secrets.txt
# Paste the output into your local .env.local (gitignored)
```

---

## Rollback (manual teardown)

If provisioning is botched and must be torn down:

```bash
# 1. Drop the database (destroys data — verify it is safe to do so)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS karbonlens;"

# 2. Drop the role
sudo -u postgres psql -c "DROP ROLE IF EXISTS karbonlens;"

# 3. Remove Unix user
userdel -r karbonlens 2>/dev/null; true

# 4. Remove directories
rm -rf /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens

# 5. Remove secrets file
rm -f /root/karbonlens-secrets.txt

# 6. Remove pg_hba.conf entries
sudo sed -i '/karbonlens.*scram-sha-256/d' /etc/postgresql/16/main/pg_hba.conf
sudo systemctl reload postgresql

# 7. Revert listen_addresses (re-comment the line if desired, then restart)
# sudo systemctl restart postgresql
```

---

## Notes for T04 (Netlify connectivity — deferred)

v0.1 Postgres is `localhost`-only. When T04 wires up Netlify, the chosen strategy (Tailscale, public IP + `pg_hba` IP allowlist, or VPS-side proxy) will require additional steps not covered here. This runbook will be updated or supplemented at that point.
