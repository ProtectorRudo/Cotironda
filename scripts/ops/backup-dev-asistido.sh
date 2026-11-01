#!/usr/bin/env bash
# MVP-035 — an INTERACTIVE LOCAL wrapper around D075. This script does NOT
# restore databases or open the commercial pilot. Never run with real
# credentials in CI, cloud workspaces, shared machines or terminals recorded.
set -euo pipefail
umask 077

fail() { printf 'COTIRONDA_BACKUP_%s\n' "$1" >&2; exit 1; }

if [[ "${1:-}" == '--help' && "$#" -eq 1 ]]; then
  printf '%s\n' 'Desde la raíz del repositorio, en terminal privada Linux/macOS/WSL:' \
    '  bash scripts/ops/backup-dev-asistido.sh' \
    'Requiere Node 22+, pg_dump/pg_dumpall/psql 17 y age/age-keygen.' \
    'Solicita la URL de cotironda-dev sin mostrarla; no restaura bases.'
  exit 0
fi
[[ "$#" -eq 0 ]] || fail ARGUMENTS_NOT_ALLOWED

# Do not proceed if command tracing, cloud/CI or a non-interactive shell
# might record the database URL, even if the D075 module is strict too.
case "$-" in *x*) set +x; fail TRACE_NOT_ALLOWED ;; esac
[[ -z "${CI:-}" && -z "${GITHUB_ACTIONS:-}" && -z "${VERCEL:-}" &&
   -z "${VERCEL_ENV:-}" && -z "${COTIRONDA_CI_AUTH_SANDBOX:-}" &&
   -z "${COTIRONDA_CI_WA_PREVIEW_SANDBOX:-}" ]] || fail LOCAL_ONLY
[[ -t 0 && -t 1 ]] || fail PRIVATE_TERMINAL_REQUIRED
[[ -n "${HOME:-}" && "$HOME" = /* ]] || fail HOME_REQUIRED
[[ "$(id -u)" != '0' ]] || fail NON_ROOT_REQUIRED

for tool in node pg_dump pg_dumpall psql age age-keygen mktemp; do
  command -v "$tool" >/dev/null 2>&1 || fail TOOL_MISSING
done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
process.exit(a>22||(a===22&&b>=16)?0:1)' || fail NODE22_REQUIRED

# Keep key and archives in distinct private local directories. Both must
# remain out of synced/shared folders and later be backed up SEPARATELY.
keydir="$HOME/.cotironda-keys"
backupdir="$HOME/.cotironda-backups"
[[ ! -L "$keydir" && ! -L "$backupdir" ]] || fail UNSAFE_DIRECTORY
mkdir -p -m 700 "$keydir" "$backupdir" || fail DIRECTORY_CREATE_FAILED
[[ -d "$keydir" && -d "$backupdir" ]] || fail UNSAFE_DIRECTORY
identity="$keydir/identity.txt"
[[ ! -L "$identity" ]] || fail IDENTITY_SYMLINK

if [[ ! -e "$identity" ]]; then
  # age-keygen refuses an existing file; never overwrite a recovery key.
  age-keygen -o "$identity" >/dev/null 2>&1 || fail IDENTITY_GENERATION_FAILED
fi
[[ -f "$identity" ]] || fail IDENTITY_NOT_FILE

# Cleanup never recursively deletes output or key, even on a failed run.
bundle=''
done_ok=0
cleanup() {
  unset COTIRONDA_DEV_DB_URL COTIRONDA_AGE_RECIPIENT
  if [[ "$done_ok" -ne 1 && -n "$bundle" ]]; then
    rmdir "$bundle" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

printf '%s\n' 'COTIRONDA DEV — Respaldo local cifrado. NO restaura ni habilita envíos.' \
  'Copiá la cadena de conexión exclusiva del proyecto cotironda-dev, puerto 5432 y sslmode=require.' \
  'La contraseña no aparecerá en pantalla ni debe enviarse por chat.'
IFS= read -r -s -p 'URL privada de Supabase DEV: ' COTIRONDA_DEV_DB_URL ||
  fail PRIVATE_INPUT_FAILED
printf '\n'
[[ -n "$COTIRONDA_DEV_DB_URL" ]] || fail EMPTY_CONNECTION
export COTIRONDA_DEV_DB_URL
COTIRONDA_AGE_RECIPIENT="$(age-keygen -y "$identity" 2>/dev/null)" ||
  fail IDENTITY_INVALID
export COTIRONDA_AGE_RECIPIENT

bundle="$(mktemp -d "$backupdir/respaldo-dev-XXXXXXXX")" ||
  fail OUTPUT_CREATE_FAILED
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)" ||
  fail REPOSITORY_UNAVAILABLE
node "$repo_root/scripts/ops/cotironda-private-backup-d075.mjs" "$bundle" "$identity" ||
  fail BACKUP_INCOMPLETE

done_ok=1
printf '%s\n' 'COTIRONDA_BACKUP_ENCRYPTED_AND_DECRYPT_TESTED_NOT_RESTORED' \
  "Paquete cifrado local: $bundle" \
  'Guardar identity.txt fuera del equipo/soporte donde se copie el respaldo.' \
  'IMPORTANTE: restore_verified=false, gate_d024_open=false; falta probar restauración aislada.'
