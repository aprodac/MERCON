#!/usr/bin/env bash
# Prepares a fresh Ubuntu 24.04 server to host a stack deployed by this repo:
# Docker + compose, nginx + certbot, swap, firewall, the directories the
# deploy expects, and a GitHub Actions runner registered with <label>.
#
# Usage (as root, on the new server):
#   RUNNER_TOKEN=<token> bash server-setup.sh dev
#
# Get RUNNER_TOKEN from GitHub: repo → Settings → Actions → Runners →
# New self-hosted runner (the token in the ./config.sh line; valid 1 hour).
# Safe to re-run: every step checks before it changes anything.
set -euo pipefail

LABEL="${1:-}"
REPO_URL="${REPO_URL:-https://github.com/aprodac/MERCON}"
RUNNER_DIR="/root/actions-runner"

die() { echo "server-setup: $*" >&2; exit 1; }
step() { echo; echo "── $* ──"; }

[[ "$(id -u)" -eq 0 ]] || die "run as root"
[[ "$LABEL" =~ ^[a-z0-9-]+$ ]] || die "usage: RUNNER_TOKEN=<token> bash $0 <runner-label>   (e.g. dev)"

step "Packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git rsync jq ufw nginx certbot python3-certbot-nginx \
  docker.io docker-compose-v2 docker-buildx
systemctl enable --now docker nginx
docker compose version

step "Swap"
if swapon --show | grep -q .; then
  echo "swap already on:"; swapon --show
else
  ram_gb=$(awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo)
  swap_gb=$(( ram_gb < 8 ? 4 : 2 ))
  fallocate -l "${swap_gb}G" /swapfile
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "created ${swap_gb}G swap (RAM ${ram_gb}G)"
fi
sysctl -q vm.swappiness=10
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf

step "Firewall"
# SSH first, so enabling the firewall can never lock the session out.
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status | sed -n '1,10p'
echo "note: ports Docker publishes on 0.0.0.0 bypass ufw — keep internal ports bound to 127.0.0.1"

step "Directories the deploy expects"
install -d -m 755 /var/lib/mercon /var/backups/mercon
install -d -m 777 /var/lib/mercon/dev-uploads
install -d -m 700 /etc/aprodac /etc/aprodac/clients
rm -f /etc/nginx/sites-enabled/default

step "GitHub Actions runner (label: $LABEL)"
if [[ -f "$RUNNER_DIR/.runner" ]]; then
  echo "runner already configured in $RUNNER_DIR"
else
  [[ -n "${RUNNER_TOKEN:-}" ]] || die "RUNNER_TOKEN is empty — copy it from GitHub (see the top of this script)"
  version="$(curl -fsSL https://api.github.com/repos/actions/runner/releases/latest | jq -r .tag_name | sed 's/^v//')"
  [[ -n "$version" && "$version" != "null" ]] || die "could not look up the latest runner version"
  install -d "$RUNNER_DIR"
  curl -fsSL -o /tmp/actions-runner.tgz \
    "https://github.com/actions/runner/releases/download/v${version}/actions-runner-linux-x64-${version}.tar.gz"
  tar -xzf /tmp/actions-runner.tgz -C "$RUNNER_DIR" && rm -f /tmp/actions-runner.tgz
  # The production runner also runs as root (the deploy uses docker and sudo).
  # --no-default-labels: this runner carries ONLY "$LABEL", never the generic
  # "self-hosted" — otherwise any workflow still saying `runs-on: self-hosted`
  # (e.g. production deploys on main) could be picked up here.
  (cd "$RUNNER_DIR" && RUNNER_ALLOW_RUNASROOT=1 ./config.sh --unattended --replace --no-default-labels \
    --url "$REPO_URL" --token "$RUNNER_TOKEN" --name "$(hostname)-$LABEL" --labels "$LABEL")
fi

if ! systemctl list-unit-files 'actions.runner*' --no-legend | grep -q .; then
  (cd "$RUNNER_DIR" && ./svc.sh install root)
fi
unit="$(systemctl list-unit-files 'actions.runner*' --no-legend | awk '{print $1}' | head -n1)"
[[ -n "$unit" ]] || die "runner service was not installed"
# The stock runner unit never restarts itself; after an OOM kill on the old
# server it stayed down for over an hour.
install -d "/etc/systemd/system/${unit}.d"
printf '[Service]\nRestart=always\nRestartSec=15\n' > "/etc/systemd/system/${unit}.d/restart.conf"
systemctl daemon-reload
systemctl enable --now "$unit"
systemctl is-active "$unit"

step "Done"
echo "RAM/swap:"; free -h | sed -n '1,3p'
echo "runner:   $unit (label: $LABEL) — check it shows Idle under repo → Settings → Actions → Runners"
