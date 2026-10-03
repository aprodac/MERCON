#!/usr/bin/env bash
# Dev clean start — run ON THE DEV SERVER, from the repo checkout:
#
#   sudo bash scripts/dev-cleanup/dev-cleanup.sh preview   # counts only, changes nothing
#   sudo bash scripts/dev-cleanup/dev-cleanup.sh wipe      # backup, then remove
#
# What it removes and keeps: see cleanup.sql. Refuses to touch a database whose
# name doesn't contain "dev". `wipe` first saves a full database backup and
# MOVES the removed photos / PDFs to a quarantine folder (nothing is erased from
# disk), so everything can be put back. Delete the quarantine folder yourself
# once dev looks right.
set -euo pipefail

MODE="${1:-preview}"
if [[ "$MODE" != "preview" && "$MODE" != "wipe" ]]; then
  echo "Usage: $0 preview|wipe" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")" && pwd)"
# Current uploads (API writes /tmp/uploads) and older ones (under the app directory).
UPLOADS_DIRS=(${UPLOADS_DIRS:-/var/lib/mercon/dev-uploads /var/lib/mercon/dev-app-uploads})
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DIR="/var/backups/mercon-dev/cleanup-$STAMP"

DB_CONTAINER="$(docker ps -q -f label=com.docker.compose.project=mercon-dev -f label=com.docker.compose.service=postgres-db | head -1)"
if [[ -z "$DB_CONTAINER" ]]; then
  echo "The dev database container (project mercon-dev, service postgres-db) isn't running." >&2
  exit 1
fi
# psql / pg_dump inside the container, with the container's own user and database.
in_db() { docker exec -i "$DB_CONTAINER" sh -c "$1"; }
PSQL='psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

DB_NAME="$(in_db "$PSQL -tA -c 'select current_database()'")"
if [[ "$DB_NAME" != *dev* ]]; then
  echo "Refusing: database \"$DB_NAME\" is not a dev database." >&2
  exit 1
fi
echo "Dev database: $DB_NAME · mode: $MODE"

# Files of the documents that will be removed (trip photos / POD / loading, test customers' and drivers' files).
FILE_LIST="$(mktemp)"
in_db "$PSQL -tA" > "$FILE_LIST" <<'SQL'
SELECT file_url FROM "Document"
 WHERE entity_type = 'Trip'
    OR (entity_type = 'Customer' AND entity_id IN (SELECT id FROM "Customer" WHERE name IN ('Al Noor Trading Co.','Eastern Petro Services','Gulf Cement Supply','Najd Steel Works','Red Sea Logistics','Tabuk Agro Farms','CLAUDE TEST iMile','ZZ QA Customer')))
    OR (entity_type = 'Driver' AND entity_id IN (SELECT id FROM "Driver" WHERE trim(first_name || ' ' || coalesce(last_name,'')) IN ('ZZ QA Driver','Claude PushTest','Claude2 PushTest')))
UNION
SELECT f.file_url FROM "DocumentFile" f JOIN "Document" d ON d.id = f."documentId"
 WHERE d.entity_type = 'Trip'
    OR (d.entity_type = 'Customer' AND d.entity_id IN (SELECT id FROM "Customer" WHERE name IN ('Al Noor Trading Co.','Eastern Petro Services','Gulf Cement Supply','Najd Steel Works','Red Sea Logistics','Tabuk Agro Farms','CLAUDE TEST iMile','ZZ QA Customer')))
    OR (d.entity_type = 'Driver' AND d.entity_id IN (SELECT id FROM "Driver" WHERE trim(first_name || ' ' || coalesce(last_name,'')) IN ('ZZ QA Driver','Claude PushTest','Claude2 PushTest')));
SQL
locate() { local n="$1" d; for d in "${UPLOADS_DIRS[@]}"; do [[ -f "$d/$n" ]] && { echo "$d/$n"; return 0; }; done; return 1; }
FOUND=0; MISSING=0
while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  if locate "${url##*/uploads/}" >/dev/null; then FOUND=$((FOUND + 1)); else MISSING=$((MISSING + 1)); fi
done < "$FILE_LIST"
echo "Files on disk to move away: $FOUND (already missing: $MISSING) in ${UPLOADS_DIRS[*]}"

if [[ "$MODE" == "preview" ]]; then
  { cat "$HERE/cleanup.sql"; echo "ROLLBACK;"; } | in_db "$PSQL"
  echo
  echo "Preview only — nothing changed. Run with 'wipe' to do it."
  rm -f "$FILE_LIST"
  exit 0
fi

read -r -p "Type WIPE DEV to remove all trips, test data and finance records on $DB_NAME: " answer
if [[ "$answer" != "WIPE DEV" ]]; then
  echo "Stopped — nothing changed."
  exit 1
fi

mkdir -p "$KEEP_DIR/uploads"
echo "Backing up the database to $KEEP_DIR/db-before.dump …"
in_db 'pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB"' > "$KEEP_DIR/db-before.dump"
[[ -s "$KEEP_DIR/db-before.dump" ]] || { echo "Backup is empty — stopping, nothing changed." >&2; exit 1; }

{ cat "$HERE/cleanup.sql"; echo "COMMIT;"; } | in_db "$PSQL"

# Only after the database change committed: move the files out of the uploads folder.
MOVED=0
while IFS= read -r url; do
  [[ -z "$url" ]] && continue
  name="${url##*/uploads/}"
  if path="$(locate "$name")"; then
    mkdir -p "$KEEP_DIR/uploads/$(dirname "$name")"
    mv "$path" "$KEEP_DIR/uploads/$name"
    echo "$path" >> "$KEEP_DIR/original-paths.txt"
    MOVED=$((MOVED + 1))
  fi
done < "$FILE_LIST"
cp "$FILE_LIST" "$KEEP_DIR/moved-files.txt"
rm -f "$FILE_LIST"

echo
echo "Done. $MOVED files moved to $KEEP_DIR/uploads."
echo "Backup: $KEEP_DIR/db-before.dump (restore: pg_restore --clean -d <dev db> < db-before.dump)."
echo "Restart the dev API so caches refresh:  docker compose -p mercon-dev restart mercon-api"
