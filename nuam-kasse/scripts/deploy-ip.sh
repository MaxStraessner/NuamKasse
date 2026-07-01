#!/usr/bin/env sh
set -eu

ENV_FILE="${ENV_FILE:-.env.ip}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.ip.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from .env.ip.example with a real POSTGRES_PASSWORD." >&2
  exit 1
fi

required_vars="POSTGRES_DB POSTGRES_USER POSTGRES_PASSWORD"

read_env_value() {
  awk -F= -v key="$1" '$1 == key { sub(/^[^=]*=/, ""); gsub(/^"|"$/, ""); print; exit }' "$ENV_FILE"
}

for var_name in $required_vars; do
  value="$(read_env_value "$var_name")"
  if [ -z "$value" ]; then
    echo "Missing required variable: $var_name" >&2
    exit 1
  fi
done

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d db
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d backend frontend
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
