#!/usr/bin/env bash
set -Eeuo pipefail

readonly PROGRAM_NAME="nuamkasse-deploy"
readonly REPOSITORY_URL="https://github.com/MaxStraessner/NuamKasse.git"
readonly MAIN_REF="refs/remotes/origin/main"
readonly PRODUCTION_DIR="/docker/nuamkasse-ip"
readonly PROJECT_NAME="nuamkasse-ip"
readonly COMPOSE_FILE="$PRODUCTION_DIR/docker-compose.yml"
readonly ENV_FILE="$PRODUCTION_DIR/.env"
readonly COMPOSE_TEMPLATE="/usr/local/share/nuamkasse/docker-compose.vps.yml"
readonly RELEASES_DIR="$PRODUCTION_DIR/releases"
readonly BACKUP_DIR="$PRODUCTION_DIR/backups"
readonly STATE_DIR="$PRODUCTION_DIR/deployment-state"
readonly LOCK_FILE="/var/lock/nuamkasse-deploy.lock"
readonly HEALTH_URL="http://127.0.0.1:8080/api/v1/health"
readonly DATABASE_VOLUME="nuamkasse-ip_postgres_data"
readonly UPLOAD_VOLUME="nuamkasse-ip_category_uploads"
readonly PROJECT_NETWORK="nuamkasse-ip_nuam_internal"

DRY_RUN=0
TARGET_INPUT=""
CURRENT_STEP="initialization"
TEMP_DIR=""

log() {
  printf '%s [%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROGRAM_NAME" "$*"
}

die() {
  local exit_code="$1"
  shift
  printf '%s [%s] ERROR: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROGRAM_NAME" "$*" >&2
  exit "$exit_code"
}

cleanup() {
  if [[ -n "$TEMP_DIR" && -d "$TEMP_DIR" ]]; then
    rm -rf -- "$TEMP_DIR"
  fi
}

on_error() {
  local exit_code="$?"
  printf '%s [%s] FAILED step=%s exit=%s\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$PROGRAM_NAME" "$CURRENT_STEP" "$exit_code" >&2
  exit "$exit_code"
}

trap cleanup EXIT
trap on_error ERR

usage() {
  cat <<'EOF'
Usage:
  nuamkasse-deploy --commit <full-or-abbreviated-sha>
  nuamkasse-deploy --dry-run --commit <full-or-abbreviated-sha>

The commit must exist in origin/main. Dry-run performs validation and read-only
production checks, but does not create releases, backups, images or containers.
EOF
}

while (($#)); do
  case "$1" in
    --commit)
      (($# >= 2)) || die 64 "--commit requires a value."
      TARGET_INPUT="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      die 64 "Unknown argument: $1"
      ;;
  esac
done

[[ -n "$TARGET_INPUT" ]] || die 64 "A target commit is required."
[[ "$TARGET_INPUT" =~ ^[0-9a-fA-F]{7,40}$ ]] || die 64 "Commit must contain 7 to 40 hexadecimal characters."
[[ "$(id -u)" -eq 0 ]] || die 77 "This script must run as root through the restricted deployment command."

for command_name in git docker curl flock sed stat sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || die 69 "Missing required command: $command_name"
done
docker compose version >/dev/null 2>&1 || die 69 "Docker Compose is unavailable."

exec 9>"$LOCK_FILE"
flock -n 9 || die 75 "Another production deployment is already running."

CURRENT_STEP="validate-production-boundary"
[[ "$(readlink -f "$PRODUCTION_DIR")" == "$PRODUCTION_DIR" ]] || die 78 "Unexpected production directory."
[[ -f "$ENV_FILE" ]] || die 78 "Missing production environment file: $ENV_FILE"
[[ -f "$COMPOSE_TEMPLATE" ]] || die 78 "Missing root-owned Compose template: $COMPOSE_TEMPLATE"

env_mode="$(stat -c '%a' "$ENV_FILE")"
if (( (8#$env_mode & 077) != 0 )); then
  die 78 "$ENV_FILE must not be readable or writable by group/others; current mode is $env_mode."
fi

for resource in "$DATABASE_VOLUME" "$UPLOAD_VOLUME"; do
  docker volume inspect "$resource" >/dev/null 2>&1 || die 78 "Required existing volume is missing: $resource"
done
docker network inspect "$PROJECT_NETWORK" >/dev/null 2>&1 || die 78 "Required existing network is missing: $PROJECT_NETWORK"

CURRENT_STEP="validate-current-project"
mapfile -t foreign_project_containers < <(
  docker ps -a --filter "label=com.docker.compose.project=$PROJECT_NAME" --format '{{.Names}}' \
    | grep -Ev '^nuamkasse-ip-(db|backend|frontend)-1$' || true
)
if ((${#foreign_project_containers[@]})); then
  die 78 "Unexpected containers carry the $PROJECT_NAME label: ${foreign_project_containers[*]}"
fi

TEMP_DIR="$(mktemp -d /tmp/nuamkasse-deploy.XXXXXXXX)"
readonly TEMP_REPOSITORY="$TEMP_DIR/repository"
readonly RENDERED_COMPOSE="$TEMP_DIR/docker-compose.yml"

CURRENT_STEP="fetch-main"
git init --quiet "$TEMP_REPOSITORY"
git -C "$TEMP_REPOSITORY" remote add origin "$REPOSITORY_URL"
git -C "$TEMP_REPOSITORY" fetch --quiet --no-tags --filter=blob:none origin main

CURRENT_STEP="validate-target-commit"
if ! TARGET_COMMIT="$(git -C "$TEMP_REPOSITORY" rev-parse --verify "${TARGET_INPUT}^{commit}" 2>/dev/null)"; then
  die 65 "Target commit does not exist in the fetched main history: $TARGET_INPUT"
fi
if ! git -C "$TEMP_REPOSITORY" merge-base --is-ancestor "$TARGET_COMMIT" "$MAIN_REF"; then
  die 66 "Target commit $TARGET_COMMIT is not contained in main."
fi
readonly TARGET_COMMIT
readonly RELEASE_DIR="$RELEASES_DIR/$TARGET_COMMIT"
readonly RELEASE_APP_DIR="$RELEASE_DIR/nuam-kasse"

CURRENT_STEP="pre-deployment-health"
pre_health="$(curl --fail --silent --show-error --max-time 15 "$HEALTH_URL")" \
  || die 70 "Pre-deployment health check failed."
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$pre_health" \
  || die 70 "Pre-deployment health response is not ok."
grep -Eq '"database"[[:space:]]*:[[:space:]]*"connected"' <<<"$pre_health" \
  || die 70 "Pre-deployment database health is not connected."

current_backend_image="$(docker inspect --format '{{.Config.Image}}' nuamkasse-ip-backend-1 2>/dev/null || true)"
current_frontend_image="$(docker inspect --format '{{.Config.Image}}' nuamkasse-ip-frontend-1 2>/dev/null || true)"
previous_commit="${current_backend_image##*:}"
if [[ "$current_backend_image" != nuamkasse-ip-backend:* || "$current_frontend_image" != "nuamkasse-ip-frontend:$previous_commit" ]]; then
  die 78 "Running frontend/backend images do not identify one matching commit."
fi

CURRENT_STEP="prepare-compose"
sed \
  -e "s|__DEPLOY_COMMIT__|$TARGET_COMMIT|g" \
  -e "s|__RELEASE_DIR__|$RELEASE_APP_DIR|g" \
  "$COMPOSE_TEMPLATE" > "$RENDERED_COMPOSE"

compose=(docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$RENDERED_COMPOSE")
"${compose[@]}" config --quiet

mapfile -t configured_volumes < <("${compose[@]}" config --volumes | sort)
[[ "${configured_volumes[*]}" == "category_uploads postgres_data" ]] \
  || die 78 "Compose template declares unexpected volumes: ${configured_volumes[*]}"

log "Validated target=$TARGET_COMMIT previous=$previous_commit dry_run=$DRY_RUN"
if ((DRY_RUN)); then
  log "Dry-run successful; production was not changed."
  exit 0
fi

CURRENT_STEP="create-release"
install -d -m 0755 "$RELEASES_DIR" "$STATE_DIR"
install -d -m 0700 "$BACKUP_DIR"
if [[ -d "$RELEASE_DIR" ]]; then
  [[ -d "$RELEASE_DIR/.git" ]] || die 78 "Existing release directory is not a Git checkout: $RELEASE_DIR"
  [[ "$(git -C "$RELEASE_DIR" rev-parse HEAD)" == "$TARGET_COMMIT" ]] \
    || die 78 "Existing release directory contains a different commit."
else
  stage_dir="$RELEASES_DIR/.stage-$TARGET_COMMIT"
  [[ ! -e "$stage_dir" ]] || die 78 "Stale release staging directory exists: $stage_dir"
  git clone --quiet --no-checkout "$REPOSITORY_URL" "$stage_dir"
  git -C "$stage_dir" checkout --quiet --detach "$TARGET_COMMIT"
  mv -- "$stage_dir" "$RELEASE_DIR"
fi

CURRENT_STEP="render-release-compose"
next_compose="$PRODUCTION_DIR/.docker-compose.$TARGET_COMMIT.next"
sed \
  -e "s|__DEPLOY_COMMIT__|$TARGET_COMMIT|g" \
  -e "s|__RELEASE_DIR__|$RELEASE_APP_DIR|g" \
  "$COMPOSE_TEMPLATE" > "$next_compose"
chmod 0644 "$next_compose"
compose=(docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$next_compose")
"${compose[@]}" config --quiet

CURRENT_STEP="database-backup"
db_container="$(docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE" ps -q db)"
[[ -n "$db_container" ]] || die 70 "Running database container could not be identified."
backup_timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/pre-$TARGET_COMMIT-$backup_timestamp.dump"
backup_temp="$backup_file.tmp"
docker exec "$db_container" sh -c \
  'exec pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges' \
  > "$backup_temp"
docker exec -i "$db_container" sh -c 'exec pg_restore --list >/dev/null' < "$backup_temp"
chmod 0600 "$backup_temp"
mv -- "$backup_temp" "$backup_file"
backup_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"
log "Created verified backup file=$(basename "$backup_file") sha256=$backup_sha256"

CURRENT_STEP="build-images"
"${compose[@]}" build backend frontend migrate

CURRENT_STEP="database-migration"
"${compose[@]}" run --rm migrate
"${compose[@]}" run --rm --no-deps migrate alembic current

CURRENT_STEP="activate-compose"
if [[ -f "$COMPOSE_FILE" ]]; then
  cp --preserve=mode,timestamps "$COMPOSE_FILE" "$STATE_DIR/docker-compose.$previous_commit.yml"
fi
mv -- "$next_compose" "$COMPOSE_FILE"
compose=(docker compose --env-file "$ENV_FILE" -p "$PROJECT_NAME" -f "$COMPOSE_FILE")
"${compose[@]}" up -d --no-deps backend frontend

CURRENT_STEP="container-health"
deadline=$((SECONDS + 180))
while ((SECONDS < deadline)); do
  backend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' nuamkasse-ip-backend-1 2>/dev/null || true)"
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' nuamkasse-ip-frontend-1 2>/dev/null || true)"
  if [[ "$backend_health" == healthy && "$frontend_health" == healthy ]]; then
    break
  fi
  sleep 5
done
[[ "${backend_health:-}" == healthy && "${frontend_health:-}" == healthy ]] \
  || die 70 "Containers did not become healthy (backend=${backend_health:-unknown}, frontend=${frontend_health:-unknown})."

CURRENT_STEP="post-deployment-health"
post_health="$(curl --fail --silent --show-error --retry 8 --retry-delay 5 --max-time 15 "$HEALTH_URL")" \
  || die 70 "Post-deployment health check failed."
grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"' <<<"$post_health" \
  || die 70 "Post-deployment health response is not ok."
grep -Eq '"database"[[:space:]]*:[[:space:]]*"connected"' <<<"$post_health" \
  || die 70 "Post-deployment database health is not connected."

CURRENT_STEP="confirm-running-commit"
running_backend="$(docker inspect --format '{{.Config.Image}}' nuamkasse-ip-backend-1)"
running_frontend="$(docker inspect --format '{{.Config.Image}}' nuamkasse-ip-frontend-1)"
backend_revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' nuamkasse-ip-backend-1)"
frontend_revision="$(docker inspect --format '{{index .Config.Labels "org.opencontainers.image.revision"}}' nuamkasse-ip-frontend-1)"
[[ "$running_backend" == "nuamkasse-ip-backend:$TARGET_COMMIT" ]] || die 70 "Backend image does not match target commit."
[[ "$running_frontend" == "nuamkasse-ip-frontend:$TARGET_COMMIT" ]] || die 70 "Frontend image does not match target commit."
[[ "$backend_revision" == "$TARGET_COMMIT" && "$frontend_revision" == "$TARGET_COMMIT" ]] \
  || die 70 "Running container revision labels do not match target commit."

printf '%s\n' "$TARGET_COMMIT" > "$STATE_DIR/deployed-commit"
printf '%s target=%s previous=%s backup=%s sha256=%s\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TARGET_COMMIT" "$previous_commit" \
  "$(basename "$backup_file")" "$backup_sha256" >> "$STATE_DIR/history.log"
chmod 0644 "$STATE_DIR/deployed-commit" "$STATE_DIR/history.log"

log "Deployment successful; running commit=$TARGET_COMMIT"
