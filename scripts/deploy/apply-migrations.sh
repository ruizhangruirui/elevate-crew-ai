#!/usr/bin/env bash
# Applies all database migrations (schema only) to a local PostgreSQL instance.
#
# Usage:
#   PGHOST=127.0.0.1 PGDATABASE=talent_app scripts/deploy/apply-migrations.sh
#
# Environment (standard psql variables):
#   PGHOST     (default 127.0.0.1)
#   PGPORT     (default 5432)
#   PGDATABASE (default talent_app)
#   PGUSER     (default postgres)
#   PGPASSWORD (optional; omit for peer/ident auth over a local socket)
#   PGSSLMODE  (optional; default "disable" for local connections — set to
#               "require" or higher when connecting over the network)
#
# The script is idempotent: each migration file is applied once and tracked in
# public._migrations_applied, so it is safe to re-run on every deployment.
set -euo pipefail

PGHOST="${PGHOST:-127.0.0.1}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-talent_app}"
PGUSER="${PGUSER:-postgres}"
export PGHOST PGPORT PGDATABASE PGUSER
if [ -n "${PGPASSWORD:-}" ]; then export PGPASSWORD; fi

PSQL="psql -v ON_ERROR_STOP=1 -X -q"

echo "==> Target: ${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}"
$PSQL -c "SELECT version();" >/dev/null

echo "==> Ensuring required database roles exist"
$PSQL <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN;
  END IF;
END
$$;
SQL

echo "==> Creating migration bookkeeping table"
$PSQL -c "
CREATE TABLE IF NOT EXISTS public._migrations_applied (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);"

apply_dir () {
  local dir="$1" pattern="$2"
  if [ ! -d "$dir" ]; then
    echo "==> Skipping missing directory: $dir"
    return 0
  fi
  for f in $(ls "$dir"/$pattern 2>/dev/null | sort); do
    local name
    name="$(basename "$f")"
    if $PSQL -At -c "SELECT 1 FROM public._migrations_applied WHERE filename = '${name}'" | grep -q 1; then
      echo "    already applied: $name"
      continue
    fi
    echo "    applying:        $name"
    $PSQL -f "$f"
    $PSQL -c "INSERT INTO public._migrations_applied (filename) VALUES ('${name}');"
  done
}

echo "==> Applying migrations (supabase/migrations, then drizzle/migrations)"
apply_dir "supabase/migrations" "*.sql"
apply_dir "drizzle/migrations" "0*.sql"

echo "==> Done. Schema is up to date."
