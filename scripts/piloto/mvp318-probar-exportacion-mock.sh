#!/usr/bin/env bash
# MVP318: offline simulation of local export; NO real Supabase, users, or secrets.
# The age substitute is intentionally NOT cryptography: this test checks orchestration.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
link_file="$repo/supabase/.temp/project-ref"
if [[ -e "$link_file" ]]; then
  echo "Refusing to overwrite existing Supabase project link in test" >&2
  exit 10
fi
work="$(mktemp -d)"
cleanup() {
  rm -f -- "$link_file"
  rmdir "$repo/supabase/.temp" 2>/dev/null || true
  rm -rf -- "$work"
}
trap cleanup EXIT
mkdir -p "$work/bin" "$work/home" "$(dirname "$link_file")"
printf '%s\n' 'ilggkalaafhtiysyzlmg' > "$link_file"

cat > "$work/bin/supabase" <<'MOCK_CLI'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_CALLS"
if [[ "$1" == db && "$2" == dump && "$3" == --help ]]; then
  echo "--linked"
  exit 0
fi
if [[ "$1" == storage && "$2" == cp && "$3" == --help ]]; then
  echo "--linked --experimental"
  exit 0
fi
if [[ "$1" == db && "$2" == dump ]]; then
  output=""
  previous=""
  for arg in "$@"; do
    if [[ "$previous" == --file ]]; then output="$arg"; break; fi
    previous="$arg"
  done
  test -n "$output"
  if [[ " $* " == *" --role-only "* ]]; then
    printf '%s\n' '-- example role inventory' > "$output"
  elif [[ " $* " == *" --data-only "* ]]; then
    if [[ "$MOCK_EMPTY_DATA" == 1 ]]; then
      printf '%s\n' '-- only comments (should be rejected)' > "$output"
    else
      printf 'COPY cotironda_piloto_privado.participants (id) FROM stdin;\n1\n\\.\n' > "$output"
    fi
  else
    printf 'CREATE SCHEMA cotironda_piloto_privado;\nCREATE TABLE cotironda_piloto_privado.participants (id int);\n' > "$output"
  fi
  exit 0
fi
if [[ "$1" == storage && "$2" == cp ]]; then
  destination=""
  for arg in "$@"; do destination="$arg"; done
  mkdir -p "$destination"
  i=1
  while (( i <= MOCK_COUNT )); do
    printf 'synthetic document %s\n' "$i" > "$destination/document_$i.txt"
    ((i+=1))
  done
  if [[ "$MOCK_ZERO" == 1 ]]; then : > "$destination/document_1.txt"; fi
  exit 0
fi
echo "UNEXPECTED mock Supabase command" >&2
exit 1
MOCK_CLI

cat > "$work/bin/age" <<'MOCK_AGE'
#!/usr/bin/env bash
# No encryption! Safe because all inputs in this CI test are synthetic.
set -euo pipefail
if [[ "$1" == -p && "$2" == -o ]]; then
  cat > "$3"
elif [[ "$1" == -d ]]; then
  if [[ "$MOCK_CORRUPT" == 1 ]]; then
    printf '%s\n' 'not a tar archive'
  else
    cat "$2"
  fi
else
  exit 2
fi
MOCK_AGE
chmod +x "$work/bin/supabase" "$work/bin/age"
export PATH="$work/bin:$PATH" HOME="$work/home"
export MOCK_CALLS="$work/cli.log" MOCK_COUNT=7 MOCK_ZERO=0 MOCK_CORRUPT=0 MOCK_EMPTY_DATA=0
script="$repo/scripts/piloto/mvp318-exportar-resguardo-local.sh"
target="$HOME/Cotironda-Resguardos-Privados"

# Happy path: all components are carried, hashes in decrypted tar match.
bash "$script" > "$work/happy.log" 2>&1 || { cat "$work/happy.log"; exit 11; }
archive="$(find "$target" -maxdepth 1 -type f -name '*.age' -print -quit)"
test -n "$archive"
test -s "$archive.sha256"
(cd "$target" && sha256sum --check --status "$(basename "$archive").sha256")
mkdir -p "$work/inspect"
tar -C "$work/inspect" -xf "$archive"
(cd "$work/inspect" && sha256sum --check --status SHA256SUMS)
test "$(find "$work/inspect/storage/cotironda-piloto-originals" -type f | wc -l | tr -d '[:space:]')" = 7
rm -rf -- "$target"
echo "PASS: synthetic export has 7 originals, SQL, manifest and archive checksum"

# Wrong ref must refuse before any Supabase CLI call.
printf '%s\n' 'not-cotironda' > "$link_file"
: > "$MOCK_CALLS"
if bash "$script" > "$work/wrong-ref.log" 2>&1; then
  echo "FAIL: wrong project was accepted" >&2; exit 12
fi
test ! -s "$MOCK_CALLS"
test ! -e "$target"
printf '%s\n' 'ilggkalaafhtiysyzlmg' > "$link_file"
echo "PASS: wrong project did not contact CLI"

# Missing Storage file, zero-length Storage file, and comments-only data all fail closed.
export MOCK_COUNT=6
if bash "$script" > "$work/short.log" 2>&1; then
  echo "FAIL: 6 of 7 originals accepted" >&2; exit 13
fi
test -z "$(find "$target" -maxdepth 1 -name '*.age' -print -quit)"
export MOCK_COUNT=7 MOCK_ZERO=1
if bash "$script" > "$work/empty.log" 2>&1; then
  echo "FAIL: zero-byte original accepted" >&2; exit 14
fi
test -z "$(find "$target" -maxdepth 1 -name '*.age' -print -quit)"
export MOCK_ZERO=0 MOCK_EMPTY_DATA=1
if bash "$script" > "$work/no-data.log" 2>&1; then
  echo "FAIL: no actual SQL row data accepted" >&2; exit 15
fi
test -z "$(find "$target" -maxdepth 1 -name '*.age' -print -quit)"
export MOCK_EMPTY_DATA=0
echo "PASS: missing, zero-length and data-less exports rejected"

# A corrupted decrypted stream must leave neither an archive nor a misleading checksum.
export MOCK_CORRUPT=1
if bash "$script" > "$work/corrupt.log" 2>&1; then
  echo "FAIL: corrupted archive accepted" >&2; exit 16
fi
test -z "$(find "$target" -maxdepth 1 -name '*.age' -print -quit)"
test -z "$(find "$target" -maxdepth 1 -name '*.sha256' -print -quit)"
echo "PASS: corrupt archive rejected and incomplete backup deleted"
echo "MVP318 MOCK PASS (no actual Supabase, no real cryptography, no real restore)"
