#!/usr/bin/env bash
# Steps 2 and 4 of moving the dev stack. Run on the NEW server as root,
# with /root/dev-move.tgz copied over from the old server.
#
#   bash dev-move-import.sh prepare     # before the first dev deploy here:
#                                       # key, certificates, uploaded files
#   (merge the workflow PR / re-run the dev deploy — it builds on this server)
#   bash dev-move-import.sh restore-db  # after that deploy: load dev's data
#
# Runbook: docs/SERVER_MOVE_DEV.md
set -euo pipefail

BUNDLE=/root/dev-move.tgz
WORK=/root/dev-move
die() { echo "dev-move-import: $*" >&2; exit 1; }

[[ "$(id -u)" -eq 0 ]] || die "run as root"
[[ -f "$BUNDLE" ]] || die "$BUNDLE not found — copy it from the old server first"

unpack() {
  rm -rf "$WORK"
  tar -xzf "$BUNDLE" -C /root
  [[ -d "$WORK" ]] || die "unexpected bundle layout"
}

case "${1:-}" in
  prepare)
    unpack

    echo "── Encryption key"
    if [[ -f "$WORK/secrets.env" ]]; then
      install -d -m 700 /etc/aprodac/clients/dev
      if [[ -f /etc/aprodac/clients/dev/secrets.env ]] && ! cmp -s "$WORK/secrets.env" /etc/aprodac/clients/dev/secrets.env; then
        die "/etc/aprodac/clients/dev/secrets.env already exists with a different key — not overwriting"
      fi
      install -m 600 "$WORK/secrets.env" /etc/aprodac/clients/dev/secrets.env
      echo "   installed"
    else
      echo "   none in bundle — the first deploy creates one"
    fi

    echo "── Certificates"
    install -d -m 755 /etc/letsencrypt
    tar -xzf "$WORK/letsencrypt-dev.tgz" -C /etc/letsencrypt
    [[ -e /etc/letsencrypt/live/dev.mercon.tech/fullchain.pem ]] || die "certificate did not unpack"
    echo "   dev.mercon.tech certificate in place (expires $(openssl x509 -enddate -noout -in /etc/letsencrypt/live/dev.mercon.tech/fullchain.pem | cut -d= -f2))"

    echo "── Uploaded files"
    for pair in "uploads-app.tgz:/tmp/dev-uploads" "uploads-tmp.tgz:/var/lib/mercon/dev-uploads"; do
      archive="${pair%%:*}"; target="${pair#*:}"
      [[ -f "$WORK/$archive" ]] || { echo "   $archive not in bundle — skipped"; continue; }
      install -d -m 777 "$target"
      tar -xzf "$WORK/$archive" -C "$target"
      echo "   $target ($(du -sh "$target" | cut -f1))"
    done
    echo
    echo "Ready. Next: run the dev deploy on this server, then: bash $0 restore-db"
    ;;

  restore-db)
    unpack
    [[ "$(docker inspect -f '{{.State.Running}}' dev-postgres 2>/dev/null)" == "true" ]] \
      || die "dev-postgres is not running here — run the dev deploy on this server first"
    docker cp "$WORK/dev-db.dump" dev-postgres:/tmp/dev-db.dump
    # Replaces the empty database the first deploy created with dev's real one.
    # Same app version on both sides, so the schema and migration ledger match.
    docker exec dev-postgres sh -c \
      'pg_restore --clean --if-exists --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/dev-db.dump'
    docker exec dev-postgres rm -f /tmp/dev-db.dump
    docker restart dev-api dev-frontend >/dev/null
    for _ in $(seq 1 30); do
      curl -fsS http://127.0.0.1:3051/health >/dev/null 2>&1 && break
      sleep 2
    done
    curl -fsS http://127.0.0.1:3051/health || die "dev API is not healthy after the restore"
    echo
    echo "Dev data restored. Next: point the dev DNS records at this server (docs/SERVER_MOVE_DEV.md)."
    ;;

  *)
    die "usage: bash $0 prepare | restore-db"
    ;;
esac
