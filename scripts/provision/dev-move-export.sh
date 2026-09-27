#!/usr/bin/env bash
# Step 1 of moving the dev stack to its own server. Run on the OLD server
# (the production server) as root. Read-only for everything it touches:
# it packs dev's database, uploads, encryption key and certificates into
# one file to copy across. Production is not touched.
#
#   bash scripts/provision/dev-move-export.sh
#   scp /root/dev-move.tgz root@<new-server>:/root/
#
# Runbook: docs/SERVER_MOVE_DEV.md
set -euo pipefail

WORK=/root/dev-move
OUT=/root/dev-move.tgz
die() { echo "dev-move-export: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "run as root"
[[ "$(docker inspect -f '{{.State.Running}}' dev-postgres 2>/dev/null)" == "true" ]] || die "dev-postgres is not running"

rm -rf "$WORK" && install -d -m 700 "$WORK"

echo "── Database"
# User and database name come from the container's own environment.
docker exec dev-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB"' > "$WORK/dev-db.dump"
[[ -s "$WORK/dev-db.dump" ]] || die "database dump is empty"
echo "   $(du -h "$WORK/dev-db.dump" | cut -f1)"

echo "── Uploaded files (the two directories the dev API mounts)"
for pair in "uploads-app.tgz:/tmp/dev-uploads" "uploads-tmp.tgz:/var/lib/mercon/dev-uploads"; do
  archive="${pair%%:*}"; source="${pair#*:}"
  if [[ -d "$source" ]]; then
    tar -czf "$WORK/$archive" -C "$source" .
    echo "   $source → $(du -h "$WORK/$archive" | cut -f1)"
  else
    echo "   $source missing — skipped"
  fi
done

echo "── Encryption key"
if [[ -f /etc/aprodac/clients/dev/secrets.env ]]; then
  install -m 600 /etc/aprodac/clients/dev/secrets.env "$WORK/secrets.env"
  key="$(sed -n 's/^DATA_ENCRYPTION_KEY=//p' /etc/aprodac/clients/dev/secrets.env | tail -n1)"
  echo "   copied (key id $(printf 'aprodac-key-id:%s' "$key" | sha256sum | cut -c1-8))"
else
  echo "   none yet — the first deploy on the new server creates one"
fi

echo "── Certificates for dev.mercon.tech"
LE=/etc/letsencrypt
items=()
for p in live/dev.mercon.tech archive/dev.mercon.tech renewal/dev.mercon.tech.conf accounts options-ssl-nginx.conf ssl-dhparams.pem; do
  [[ -e "$LE/$p" ]] && items+=("$p")
done
[[ " ${items[*]} " == *" live/dev.mercon.tech "* ]] || die "no certificate at $LE/live/dev.mercon.tech"
tar -czf "$WORK/letsencrypt-dev.tgz" -C "$LE" "${items[@]}"
echo "   ${items[*]}"

tar -czf "$OUT" -C /root dev-move
chmod 600 "$OUT"
rm -rf "$WORK"
echo
echo "Packed $OUT ($(du -h "$OUT" | cut -f1)), sha256 $(sha256sum "$OUT" | cut -c1-16)…"
echo "Next: scp $OUT root@<new-server>:/root/   then run dev-move-import.sh prepare there."
