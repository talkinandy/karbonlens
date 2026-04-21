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
DATABASE_URL=postgresql://karbonlens:${DB_PASS}@127.0.0.1:5432/karbonlens
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

## 6. Verify localhost-only binding

```bash
# Check current setting
sudo -u postgres psql -c "SHOW listen_addresses;"

# If it shows anything other than 'localhost', edit postgresql.conf:
# sudo nano /etc/postgresql/16/main/postgresql.conf
# Set:  listen_addresses = 'localhost'
# Then: systemctl restart postgresql

# Confirm port is bound only to 127.0.0.1
ss -tlnp | grep 5432
# Expected: 127.0.0.1:5432 (NOT 0.0.0.0:5432)
```

---

## 7. Ensure pg_hba.conf allows TCP connections from localhost

```bash
# Check existing rules for karbonlens role over TCP
grep karbonlens /etc/postgresql/16/main/pg_hba.conf || true

# If no matching line exists, add one:
# echo "host karbonlens karbonlens 127.0.0.1/32 scram-sha-256" \
#   >> /etc/postgresql/16/main/pg_hba.conf
# systemctl reload postgresql
```

---

## 8. Create application directories

```bash
mkdir -p /opt/karbonlens
mkdir -p /var/log/karbonlens
mkdir -p /var/lib/karbonlens/backups
mkdir -p /var/lib/karbonlens/pdf-archive

chown -R karbonlens:karbonlens \
  /opt/karbonlens \
  /var/log/karbonlens \
  /var/lib/karbonlens

chmod 755 \
  /opt/karbonlens \
  /var/log/karbonlens \
  /var/lib/karbonlens \
  /var/lib/karbonlens/backups \
  /var/lib/karbonlens/pdf-archive

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

# AC-4: Postgres role can connect via TCP
DB_PASS=$(grep '^DB_PASS=' /root/karbonlens-secrets.txt | cut -d= -f2)
PGPASSWORD="$DB_PASS" psql -U karbonlens -h 127.0.0.1 -d karbonlens \
  -c "SELECT current_user, current_database();"

# AC-5: Localhost-only binding
sudo -u postgres psql -c "SHOW listen_addresses;"
ss -tlnp | grep 5432

# AC-6: Directory ownership
stat -c "%U:%G %a %n" \
  /opt/karbonlens /var/log/karbonlens \
  /var/lib/karbonlens/backups /var/lib/karbonlens/pdf-archive

# AC-7: Secrets file permissions
stat -c "%a %U" /root/karbonlens-secrets.txt
grep DATABASE_URL /root/karbonlens-secrets.txt

# AC-8: .env.example placeholder present (run from repo root)
grep DATABASE_URL .env.example
```

---

## 10. Copy the connection string into .env.example

From the repo root on the VPS (or locally if you have the secrets file):

```bash
DB_PASS=$(grep '^DB_PASS=' /root/karbonlens-secrets.txt | cut -d= -f2)

# Print the line to add to .env.example (do NOT commit the real password)
echo "DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens"
```

Manually ensure `.env.example` contains:

```
DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens
```

For local dev, copy the real connection string into `.env.local` (gitignored):

```bash
grep DATABASE_URL /root/karbonlens-secrets.txt
# Paste the real DATABASE_URL line into .env.local
```

---

## Notes for T04 (Netlify connectivity — deferred)

v0.1 Postgres is `localhost`-only. When T04 wires up Netlify, the chosen strategy (Tailscale, public IP + `pg_hba` IP allowlist, or VPS-side proxy) will require additional steps not covered here. This runbook will be updated or supplemented at that point.
