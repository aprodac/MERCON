#!/usr/bin/env bash
# Copies uploaded files from an old host directory (under /tmp, which Ubuntu
# empties at boot) into their persistent home, and proves nothing was lost.
#
#   sudo bash scripts/provision/migrate-uploads.sh [--finalize] <source-dir> <dest-dir> [owner-uid]
#
# - Never deletes or changes anything in <source-dir>.
# - Never overwrites a file that already exists in <dest-dir> (the API may
#   already be writing there), so it is safe to run on every deploy, before
#   and after the containers are replaced.
# - Exits non-zero if any source file is missing from <dest-dir> or has a
#   different size there. The deploy stops on that.
# - <owner-uid> (default 1000 = `node` in node:20-alpine, the API's user)
#   owns <dest-dir> so the API can write to it; mode 770, not 777.
# - --finalize (the deploy's second pass, after the old container is gone)
#   records the migration as done once everything verifies. Later runs then
#   skip that source entirely, so files the API deletes on purpose (trip
#   media after 60 days) are not copied back from the /tmp originals.
set -euo pipefail

FINALIZE=0
[[ "${1:-}" == "--finalize" ]] && { FINALIZE=1; shift; }
SRC="${1:-}"; DST="${2:-}"; OWNER="${3:-1000}"
die() { echo "migrate-uploads: $*" >&2; exit 1; }

[[ -n "$SRC" && -n "$DST" ]] || die "usage: $0 <source-dir> <dest-dir> [owner-uid]"
[[ "$(id -u)" -eq 0 ]] || die "run as root (sudo)"
[[ "$DST" == /* && "$DST" != "/" ]] || die "destination must be an absolute path"
[[ "$OWNER" =~ ^[0-9]+$ ]] || die "owner uid must be numeric"

# Kept beside, not inside, the served directory.
MARKER="$(dirname "$DST")/.upload-migrations/$(basename "$DST")$(echo "$SRC" | tr '/' '_')"
if [[ -f "$MARKER" ]]; then
  echo "migrate-uploads: $SRC → $DST already completed ($(cat "$MARKER")) — skipped"
  exit 0
fi

install -d -m 770 -o "$OWNER" -g "$OWNER" "$DST"
finalize() {
  [[ "$FINALIZE" -eq 1 ]] || return 0
  install -d -m 700 "$(dirname "$MARKER")"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER"
  echo "  recorded as complete: later deploys skip $SRC"
}

if [[ ! -d "$SRC" ]] || [[ -z "$(ls -A "$SRC" 2>/dev/null)" ]]; then
  echo "migrate-uploads: $SRC is missing or empty — nothing to copy ($DST: $(find "$DST" -type f | wc -l) files)"
  finalize
  exit 0
fi

# Relative path <TAB> size, for every regular file.
list() { (cd "$1" && find . -type f -printf '%P\t%s\n' | LC_ALL=C sort); }

# Copying doubles the space the files take until /tmp is cleaned by hand.
# Refuse (changing nothing) unless the copy leaves at least 2 GB free.
NEED_KB=$(du -sk "$SRC" | cut -f1)
FREE_KB=$(df -Pk "$DST" | awk 'NR==2 {print $4}')
if (( NEED_KB + 2*1024*1024 > FREE_KB )); then
  die "not enough space: copying $SRC needs $((NEED_KB/1024)) MB, $((FREE_KB/1024)) MB free on $DST — nothing copied"
fi

echo "migrate-uploads: $SRC → $DST"
echo "  before: source $(find "$SRC" -type f | wc -l) files / $(du -sh "$SRC" | cut -f1), destination $(find "$DST" -type f | wc -l) files"

if command -v rsync >/dev/null; then
  rsync -a --ignore-existing "$SRC"/ "$DST"/
elif cp --help 2>/dev/null | grep -q -- '--update\[=UPDATE\]\|update=none'; then
  cp -a --update=none "$SRC"/. "$DST"/
else
  cp -a -n "$SRC"/. "$DST"/
fi
chown -R "$OWNER:$OWNER" "$DST"
chmod 770 "$DST"

MISSING=$(LC_ALL=C comm -23 <(list "$SRC") <(list "$DST") || true)
if [[ -n "$MISSING" ]]; then
  echo "migrate-uploads: these source files are missing from $DST or differ in size there:" >&2
  echo "$MISSING" | head -50 >&2
  die "$(echo "$MISSING" | wc -l) file(s) not preserved — $SRC is untouched"
fi

echo "  after:  destination $(find "$DST" -type f | wc -l) files / $(du -sh "$DST" | cut -f1) — every source file present with the same size"
finalize
