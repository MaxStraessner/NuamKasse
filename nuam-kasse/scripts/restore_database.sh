#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: scripts/restore_database.sh backups/nuam_kasse_YYYYMMDDTHHMMSSZ.dump" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE" >&2
  exit 1
fi

read_env_value() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }' "$ENV_FILE"
}

POSTGRES_DB="$(read_env_value POSTGRES_DB)"
POSTGRES_USER="$(read_env_value POSTGRES_USER)"

if [ -z "$POSTGRES_DB" ] || [ -z "$POSTGRES_USER" ]; then
  echo "Missing POSTGRES_DB or POSTGRES_USER in $ENV_FILE" >&2
  exit 1
fi

echo "Restoring $BACKUP_FILE into $POSTGRES_DB. This overwrites database contents."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges < "$BACKUP_FILE"
