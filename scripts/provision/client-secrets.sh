#!/usr/bin/env bash
# Per-client secrets that live on the client's own server — never in git or
# GitHub. One root-only file per client deployment:
#
#   /etc/aprodac/clients/<client>/secrets.env   (dir 700, file 600)
#
# Today it holds the data encryption key (encrypts stored integration
# secrets such as the ZATCA certificate key). Runbook: docs/CLIENT_SECRETS.md
#
# Usage (as root):
#   client-secrets.sh ensure <client>       create the file + key if missing (idempotent; deploys run this)
#   client-secrets.sh export <client>       print `export …` lines for the deploy to eval
#   client-secrets.sh fingerprint <client>  print key ids (safe to log/share; reveal nothing)
#   client-secrets.sh show <client>         print the key itself — for the one-time password-manager backup
#   client-secrets.sh rotate <client>       new key; old one kept as DATA_ENCRYPTION_KEY_PREVIOUS
#   client-secrets.sh finish-rotation <client>  drop previous keys once the API has re-encrypted
#
# CLIENT_SECRETS_ROOT overrides /etc/aprodac/clients (tests).
set -euo pipefail

ROOT="${CLIENT_SECRETS_ROOT:-/etc/aprodac/clients}"
CMD="${1:-}"
CLIENT="${2:-}"

die() { echo "client-secrets: $*" >&2; exit 1; }

[[ -n "$CMD" && -n "$CLIENT" ]] || die "usage: $0 <ensure|export|fingerprint|show|rotate|finish-rotation> <client>"
[[ "$CLIENT" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || die "client name must be lowercase letters, digits and dashes: '$CLIENT'"

DIR="$ROOT/$CLIENT"
FILE="$DIR/secrets.env"

# Same id the API computes (secretBox.parseDataKey): identifies a key without revealing it.
key_id() { printf 'aprodac-key-id:%s' "$1" | sha256sum | cut -c1-8; }

new_key() { openssl rand -base64 32; }

get_var() { [[ -f "$FILE" ]] && sed -n "s/^$1=//p" "$FILE" | tail -n1 || true; }

# Rewrite the file atomically with one variable set (or removed when value is empty).
set_var() {
  local name="$1" value="$2" tmp
  tmp="$(mktemp "$DIR/.secrets.XXXXXX")"
  chmod 600 "$tmp"
  [[ -f "$FILE" ]] && grep -v "^$name=" "$FILE" > "$tmp" || true
  [[ -n "$value" ]] && printf '%s=%s\n' "$name" "$value" >> "$tmp"
  mv -f "$tmp" "$FILE"
}

check_key() {
  local bytes
  bytes="$(printf '%s' "$1" | base64 -d 2>/dev/null | wc -c)" || bytes=0
  [[ "$bytes" -eq 32 ]] || die "DATA_ENCRYPTION_KEY in $FILE is not a 32-byte base64 key — fix it or restore it from the password manager"
}

require_file() { [[ -f "$FILE" ]] || die "no secrets file for '$CLIENT' ($FILE) — run: $0 ensure $CLIENT"; }

case "$CMD" in
  ensure)
    install -d -m 700 "$DIR"
    [[ -f "$FILE" ]] || install -m 600 /dev/null "$FILE"
    chmod 600 "$FILE"
    current="$(get_var DATA_ENCRYPTION_KEY)"
    if [[ -z "$current" ]]; then
      current="$(new_key)"
      set_var DATA_ENCRYPTION_KEY "$current"
      echo "client-secrets: created DATA_ENCRYPTION_KEY for '$CLIENT' (id $(key_id "$current"))." >&2
      echo "client-secrets: back it up once: sudo $0 show $CLIENT  → team password manager (see docs/CLIENT_SECRETS.md)" >&2
    else
      check_key "$current"
      echo "client-secrets: '$CLIENT' uses DATA_ENCRYPTION_KEY id $(key_id "$current")" >&2
    fi
    ;;

  export)
    require_file
    current="$(get_var DATA_ENCRYPTION_KEY)"
    [[ -n "$current" ]] || die "no DATA_ENCRYPTION_KEY for '$CLIENT' — run: $0 ensure $CLIENT"
    check_key "$current"
    printf 'export DATA_ENCRYPTION_KEY=%q\n' "$current"
    printf 'export DATA_ENCRYPTION_KEY_PREVIOUS=%q\n' "$(get_var DATA_ENCRYPTION_KEY_PREVIOUS)"
    ;;

  fingerprint)
    require_file
    current="$(get_var DATA_ENCRYPTION_KEY)"
    [[ -n "$current" ]] && echo "current $(key_id "$current")"
    IFS=',' read -ra previous <<< "$(get_var DATA_ENCRYPTION_KEY_PREVIOUS)"
    for k in "${previous[@]}"; do [[ -n "$k" ]] && echo "previous $(key_id "$k")"; done
    ;;

  show)
    require_file
    echo "# $CLIENT — store in the password manager as 'Aprodac / $CLIENT / DATA_ENCRYPTION_KEY'" >&2
    get_var DATA_ENCRYPTION_KEY
    ;;

  rotate)
    require_file
    current="$(get_var DATA_ENCRYPTION_KEY)"
    [[ -n "$current" ]] || die "nothing to rotate — run: $0 ensure $CLIENT"
    previous="$(get_var DATA_ENCRYPTION_KEY_PREVIOUS)"
    set_var DATA_ENCRYPTION_KEY_PREVIOUS "$current${previous:+,$previous}"
    fresh="$(new_key)"
    set_var DATA_ENCRYPTION_KEY "$fresh"
    echo "client-secrets: '$CLIENT' rotated $(key_id "$current") → $(key_id "$fresh"). Redeploy; the API re-encrypts on startup." >&2
    echo "client-secrets: back up the new key (sudo $0 show $CLIENT), then after the deploy log shows the re-encryption, run: $0 finish-rotation $CLIENT" >&2
    ;;

  finish-rotation)
    require_file
    set_var DATA_ENCRYPTION_KEY_PREVIOUS ""
    echo "client-secrets: '$CLIENT' previous keys removed." >&2
    ;;

  *) die "unknown command '$CMD'" ;;
esac
