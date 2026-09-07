#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'
umask 027

DOCKER_ADMIN_USER="${DOCKER_ADMIN_USER:-}"
LOG_DIR="${LOG_DIR:-/var/log/majalops}"
LOG_FILE="${LOG_FILE:-${LOG_DIR}/install-docker.log}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
on_error() {
    local exit_code=$?
    printf 'ERROR: Docker installation failed at line %s (exit %s).\n' \
        "${BASH_LINENO[0]:-unknown}" "$exit_code" >&2
    exit "$exit_code"
}
trap on_error ERR

[[ "$EUID" -eq 0 ]] || die "Run as root: sudo bash $0"
[[ -r /etc/os-release ]] || die "Cannot identify the operating system."
# shellcheck disable=SC1091
source /etc/os-release
[[ "${ID:-}" == "ubuntu" && "${VERSION_ID:-}" == "24.04" ]] || die "Ubuntu 24.04 LTS is required."

if [[ -n "$DOCKER_ADMIN_USER" ]]; then
    id "$DOCKER_ADMIN_USER" >/dev/null 2>&1 || die "DOCKER_ADMIN_USER does not exist."
fi

install -d -m 0750 "$LOG_DIR"
touch "$LOG_FILE"
chmod 0640 "$LOG_FILE"
exec > >(tee -a "$LOG_FILE") 2>&1

printf 'Rollback before risky actions: create a Hetzner snapshot. Docker package removal does not remove /var/lib/docker unless explicitly deleted.\n'

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl --fail --show-error --silent --location https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

arch="$(dpkg --print-architecture)"
codename="${VERSION_CODENAME:?Missing VERSION_CODENAME}"
printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' \
    "$arch" "$codename" > /etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

install -d -m 0755 /etc/docker
if [[ -f /etc/docker/daemon.json ]] && ! cmp -s /etc/docker/daemon.json <(cat <<'JSON'
{
  "features": { "buildkit": true },
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-file": "5",
    "max-size": "20m"
  },
  "no-new-privileges": true,
  "userland-proxy": false
}
JSON
); then
    cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.backup.$(date +%Y%m%d%H%M%S)"
fi
cat > /etc/docker/daemon.json <<'JSON'
{
  "features": { "buildkit": true },
  "live-restore": true,
  "log-driver": "json-file",
  "log-opts": {
    "max-file": "5",
    "max-size": "20m"
  },
  "no-new-privileges": true,
  "userland-proxy": false
}
JSON

dockerd --validate --config-file=/etc/docker/daemon.json
systemctl daemon-reload
systemctl enable --now docker
systemctl restart docker

if [[ -n "$DOCKER_ADMIN_USER" ]]; then
    usermod -aG docker "$DOCKER_ADMIN_USER"
    printf 'WARNING: docker-group membership is root-equivalent. %s must log out and in again.\n' "$DOCKER_ADMIN_USER"
else
    printf 'Docker group access was not granted. Use sudo docker (preferred for least privilege).\n'
fi

docker version
docker compose version
docker info --format 'Docker root: {{.DockerRootDir}}; logging driver: {{.LoggingDriver}}'
