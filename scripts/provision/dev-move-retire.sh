#!/usr/bin/env bash
# Last step of moving the dev stack: take dev off the OLD server once the new
# one is serving dev.mercon.tech. Run on the old server as root.
#
# Stops and removes the dev containers and their nginx site. Keeps the dev
# database volume, uploads and key for a week as a fallback; the command to
# delete them for good is printed at the end. Production is not touched.
#
# Runbook: docs/SERVER_MOVE_DEV.md
set -euo pipefail

die() { echo "dev-move-retire: $*" >&2; exit 1; }
[[ "$(id -u)" -eq 0 ]] || die "run as root"

new_ip="$(getent ahostsv4 dev.mercon.tech | awk 'NR==1 {print $1}')"
my_ips="$(hostname -I)"
if [[ -z "$new_ip" || " $my_ips " == *" $new_ip "* ]]; then
  die "dev.mercon.tech still resolves to this server ($new_ip) — switch DNS first"
fi
# An AAAA record still pointing here would keep sending IPv6 visitors (and
# Let's Encrypt, which prefers IPv6) to this server after dev is removed.
for v6 in $(getent ahostsv6 dev.mercon.tech | awk '$1 ~ /:/ && $1 !~ /^::ffff:/ {print $1}' | sort -u); do
  ip -6 addr | grep -qi " ${v6}/" && die "dev.mercon.tech still has an AAAA record for this server ($v6) — delete or repoint it first"
done
echo "dev.mercon.tech → $new_ip (not this server). Retiring the dev stack here."

for c in dev-api dev-frontend dev-postgres; do
  if docker inspect "$c" >/dev/null 2>&1; then
    docker stop "$c" >/dev/null && docker rm "$c" >/dev/null && echo "   removed container $c"
  fi
done

rm -f /etc/nginx/sites-enabled/dev-mercon-api.conf
nginx -t && systemctl reload nginx
echo "   dev nginx site disabled"

echo
echo "Kept for a week (delete once the new dev server has been fine):"
docker volume ls --format '{{.Name}}' | grep -E '^mercon-dev_' | sed 's/^/   volume /' || true
echo "   /tmp/dev-uploads  /var/lib/mercon/dev-uploads  /etc/aprodac/clients/dev"
echo "Delete later with:"
echo "   docker volume rm \$(docker volume ls -q | grep '^mercon-dev_') && rm -rf /tmp/dev-uploads /var/lib/mercon/dev-uploads /etc/aprodac/clients/dev"
