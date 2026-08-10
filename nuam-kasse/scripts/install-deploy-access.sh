#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEPLOY_USER="nuamkasse-deploy"
readonly DEPLOY_PROGRAM="/usr/local/sbin/nuamkasse-deploy"
readonly SSH_WRAPPER="/usr/local/sbin/nuamkasse-deploy-ssh"
readonly SUDOERS_FILE="/etc/sudoers.d/nuamkasse-deploy"
readonly SHARE_DIR="/usr/local/share/nuamkasse"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this setup script as root." >&2
  exit 77
fi

if (($# != 1)) || [[ ! -f "$1" ]]; then
  echo "Usage: install-deploy-access.sh /path/to/github-actions-key.pub" >&2
  exit 64
fi

public_key_file="$1"
public_key="$(tr -d '\r\n' < "$public_key_file")"
if [[ ! "$public_key" =~ ^(ssh-ed25519|sk-ssh-ed25519@openssh.com)[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]]; then
  echo "Only an Ed25519 OpenSSH public key is accepted." >&2
  exit 65
fi

script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repository_dir="$(CDPATH= cd -- "$script_dir/.." && pwd)"
install -o root -g root -m 0755 "$script_dir/deploy.sh" "$DEPLOY_PROGRAM"
install -d -o root -g root -m 0755 "$SHARE_DIR"
install -o root -g root -m 0644 "$repository_dir/ops/docker-compose.vps.yml" "$SHARE_DIR/docker-compose.vps.yml"

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "$DEPLOY_USER"
  passwd --lock "$DEPLOY_USER" >/dev/null
fi

home_dir="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" -m 0700 "$home_dir/.ssh"

cat > "$SSH_WRAPPER" <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

case "${SSH_ORIGINAL_COMMAND:-}" in
  "deploy "*)
    commit="${SSH_ORIGINAL_COMMAND#deploy }"
    mode="deploy"
    ;;
  "dry-run "*)
    commit="${SSH_ORIGINAL_COMMAND#dry-run }"
    mode="dry-run"
    ;;
  *)
    echo "Only deploy <40-hex-commit> or dry-run <40-hex-commit> is allowed." >&2
    exit 64
    ;;
esac

if [[ ! "$commit" =~ ^[0-9a-f]{40}$ ]]; then
  echo "A full lowercase 40-character commit hash is required." >&2
  exit 64
fi

if [[ "$mode" == "dry-run" ]]; then
  exec sudo -n /usr/local/sbin/nuamkasse-deploy --dry-run --commit "$commit"
fi
exec sudo -n /usr/local/sbin/nuamkasse-deploy --commit "$commit"
EOF
chmod 0755 "$SSH_WRAPPER"
chown root:root "$SSH_WRAPPER"

forced_key="restrict,command=\"$SSH_WRAPPER\" $public_key"
authorized_keys="$home_dir/.ssh/authorized_keys"
touch "$authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "$authorized_keys"
chmod 0600 "$authorized_keys"
if ! grep -Fqx "$forced_key" "$authorized_keys"; then
  printf '%s\n' "$forced_key" >> "$authorized_keys"
fi

cat > "$SUDOERS_FILE" <<EOF
$DEPLOY_USER ALL=(root) NOPASSWD: $DEPLOY_PROGRAM --commit [0-9a-f]*, $DEPLOY_PROGRAM --dry-run --commit [0-9a-f]*
EOF
chmod 0440 "$SUDOERS_FILE"
visudo -cf "$SUDOERS_FILE" >/dev/null

echo "Restricted deployment access installed for $DEPLOY_USER."
