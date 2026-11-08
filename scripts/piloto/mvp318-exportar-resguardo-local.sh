#!/usr/bin/env bash
# MVP318: user-run FREE local export (never a server/CI task).
# STRICTLY READS from linked Supabase; does NOT apply migrations or send WhatsApp.
# Requires locally authenticated supabase CLI, age, tar, sha256sum and Docker for db dump.
set -euo pipefail
umask 077
expected_ref="ilggkalaafhtiysyzlmg"
expected_originals=7 # Read-only snapshot 08/11/2026. Re-audit if count changes.
repo="$(cd "$(dirname "$0")/../.." && pwd)"
linked_ref="$repo/supabase/.temp/project-ref"
if [[ ! -f "$linked_ref" || "$(tr -d '[:space:]' < "$linked_ref")" != "$expected_ref" ]]; then
  echo "STOP: link your local CLI to the EXACT cotironda-piloto project first." >&2
  echo "No export was attempted." >&2
  exit 20
fi
for binary in supabase age tar sha256sum find; do
  command -v "$binary" >/dev/null || { echo "STOP: missing $binary" >&2; exit 21; }
done
# Supabase currently supports --linked, but the CLI is evolving.
# Fail closed instead of silently dumping a local/other database.
if supabase db dump --help 2>&1 | grep -q -- '--linked'; then
  remote_flag="--linked"
elif supabase db dump --help 2>&1 | grep -q -- '--remote'; then
  remote_flag="--remote"
else
  echo "STOP: no explicit remote flag in installed Supabase CLI." >&2; exit 22
fi
if supabase storage cp --help 2>&1 | grep -q -- '--linked'; then
  storage_flag="--linked"
elif supabase storage cp --help 2>&1 | grep -q -- '--remote'; then
  storage_flag="--remote"
else
  echo "STOP: no explicit remote Storage flag." >&2; exit 23
fi
if ! supabase storage cp --help 2>&1 | grep -q -- '--experimental'; then
  echo "STOP: Supabase Storage CLI options changed; audit required." >&2
  exit 24
fi
target="$HOME/Cotironda-Resguardos-Privados"
mkdir -p "$target"
chmod 700 "$target" || true
stage="$(mktemp -d)"
chmod 700 "$stage"
cleanup() { rm -rf -- "$stage"; }
trap cleanup EXIT HUP INT TERM
mkdir -p "$stage/storage/cotironda-piloto-originals"
cd "$repo"
echo "Exporting app schema/data/roles from the EXACT linked pilot (read only)..."
supabase db dump "$remote_flag" --role-only \
  --file "$stage/roles.sql"
supabase db dump "$remote_flag" --schema cotironda_piloto_privado,public \
  --file "$stage/schema.sql"
supabase db dump "$remote_flag" --schema cotironda_piloto_privado,public \
  --data-only --file "$stage/data.sql"
for name in roles.sql schema.sql data.sql; do
  if [[ ! -s "$stage/$name" ]]; then
    echo "STOP: missing or empty $name; no valid backup." >&2; exit 25
  fi
done
echo "Downloading private original documents (READ-only Storage copy)..."
supabase storage cp "$storage_flag" --experimental --recursive \
  ss:///cotironda-piloto-originals \
  "$stage/storage/cotironda-piloto-originals"
copied="$(find "$stage/storage/cotironda-piloto-originals" -type f | wc -l | tr -d '[:space:]')"
if [[ "$copied" != "$expected_originals" ]]; then
 echo "STOP: downloaded $copied originals, audit expected $expected_originals." >&2
 echo "If the live bucket changed, inspect it read-only and update this script." >&2
 exit 26
fi
(
 cd "$stage"
 {
   echo "Project ref: $expected_ref"
   echo "Generated UTC: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
   echo "Original files: $copied"
   echo "WARNING: Auth/Storage managed SQL not included by Supabase db dump."
   echo "WARNING: Real restoration NOT yet verified."
 } > README-RESGUARDO.txt
 find . -type f ! -name SHA256SUMS -print0 | sort -z | xargs -0 sha256sum > SHA256SUMS
)
stamp="$(date -u '+%Y%m%dT%H%M%SZ')"
archive="$target/cotironda-piloto-$stamp.age"
if [[ -e "$archive" || -e "$archive.sha256" ]]; then
  echo "STOP: backup filename already exists" >&2; exit 27
fi
echo "Encrypting with age passphrase (you will enter it, NEVER share it)."
tar -C "$stage" -cf - . | age -p -o "$archive"
test -s "$archive" || { rm -f -- "$archive"; exit 28; }
# Authenticated decryption and tar read, no unencrypted archive created on disk.
echo "Verifying encrypted archive: enter the same passphrase again..."
age -d "$archive" | tar -tf - >/dev/null
sha256sum "$archive" > "$archive.sha256"
echo "Encrypted backup verified LOCALLY; file count matches pilot snapshot."
echo "Saved OUTSIDE GitHub: $archive"
echo "RESTORATION OF REAL PILOT NOT VERIFIED; do not publish on this evidence alone."
