#!/usr/bin/env bash
# MVP-049 — LOCAL ONLY, trusted POSIX terminal, no real database URL.
set -euo pipefail
umask 077
die(){ printf 'MVP049_WRAPPER_%s\n' "$1" >&2; exit 1; }
if [[ "$#" -eq 1 && "$1" == '--help' ]]; then
  printf '%s\n' \
   'Ejecutar desde una terminal privada Linux/macOS/WSL, en la raíz del repo:' \
   '  bash scripts/ops/restaurar-dev-aislado.sh' \
   'Requiere backup D075, Docker local y postgres:17-alpine cacheado.' \
   'Pide ruta local del paquete y SHA-256 de manifiesto de D075.' \
   'Nunca requiere URL de la base; nunca sube datos; NO abre gate #175.'
  exit 0
fi
[[ "$#" -eq 0 ]] || die NO_ARGUMENTS
case "$-" in *x*) set +x; die NO_SHELL_TRACE ;; esac
for var in CI GITHUB_ACTIONS VERCEL VERCEL_ENV COTIRONDA_DEV_DB_URL DATABASE_URL PGHOST PGUSER PGPASSWORD DOCKER_CONTEXT; do
 [[ ! -v "$var" ]] || die LOCAL_ONLY
done
[[ -t 0 && -t 1 ]] || die PRIVATE_TERMINAL_REQUIRED
[[ "$(id -u)" != 0 ]] || die NON_ROOT_REQUIRED
for tool in node docker age pg_dump; do
 command -v "$tool" >/dev/null 2>&1 || die MISSING_LOCAL_TOOL
done
node -e 'const [a,b]=process.versions.node.split(".").map(Number);
process.exit(a>22||(a===22&&b>=16)?0:1)' || die NODE22_REQUIRED
docker image inspect postgres:17-alpine >/dev/null 2>&1 || die PG17_IMAGE_NOT_CACHED
repo="$(cd -- "$(dirname -- "$BASH_SOURCE")/../.." && pwd -P)" ||
 die REPO_NOT_FOUND
[[ -f "$repo/scripts/ops/restore-encrypted-dev-lab-mvp049.mjs" ]] ||
 die SCRIPT_MISSING
printf '%s\n' 'COTIRONDA — restauración local en PostgreSQL17 descartable, SIN RED' \
 'Este proceso no toca Supabase DEV ni completa la recuperación de servicios Supabase.'
IFS= read -r -p 'Ruta completa del paquete cifrado: ' bundle || die READ_FAILED
[[ "$bundle" = /* ]] || die BUNDLE_ABSOLUTE_REQUIRED
IFS= read -r -p 'SHA-256 del manifiesto informado por D075: ' sha ||
 die READ_FAILED
[[ "$sha" =~ ^[a-f0-9]{64}$ ]] || die HASH_INVALID
identity="$HOME/.cotironda-keys/identity.txt"
[[ -f "$identity" ]] || die PRIVATE_KEY_MISSING
node "$repo/scripts/ops/restore-encrypted-dev-lab-mvp049.mjs" \
 "$bundle" "$identity" "$sha" || die RESTORE_NOT_VERIFIED
printf '%s\n' 'MVP049_LAB_SQL_REPLAY_FINISHED' \
 'IMPORTANTE: gate_d024_open=false; extensiones/servicios Supabase requieren verificación.'
