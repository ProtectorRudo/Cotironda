import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../../scripts/ci/pg17-backup-restore-drill.sh',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../../.github/workflows/postgres-rls.yml',import.meta.url),'utf8');
const check=readFileSync(new URL('../../scripts/ci/check-backup-inventory.mjs',import.meta.url),'utf8');
const doc=readFileSync(new URL('../../docs/60-backup-recovery-free-plan.md',import.meta.url),'utf8');

test('el ensayo está confinado a GitHub CI, PG17 local y base cotironda_ci_fresh',()=>{
 for(const guard of [
  'GITHUB_ACTIONS:-','COTIRONDA_CI_BACKUP_RESTORE:-','PGHOST:-',
  '127.0.0.1','PGPORT:-','5432','PGDATABASE:-',
  'cotironda_ci_fresh','PGUSER:-','postgres','ci_only_password'
 ]) assert.ok(script.includes(guard),'No existe guard: '+guard);
 assert.match(script,/current_setting\('server_version_num'\)/);
 assert.match(script,/count\(\*\) from auth.users/);
 assert.match(script,/count\(\*\) from public.organizations/);
 assert.match(script,/count\(\*\) from storage.objects/);
 assert.match(script,/false 0 0 0 0/);
 assert.doesNotMatch(script,/supabase db dump|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ACCESS_TOKEN/);
});

test('dump PG17 completo, SHA256 e inventario son prerequisitos de restauración',()=>{
 assert.match(script,/postgres:17-alpine/);
 assert.match(script,/pg_dump --format=custom/);
 assert.match(script,/--schema=public --schema=cotironda_private --schema=auth --schema=storage/);
 assert.match(script,/pg_restore --list/);
 assert.match(script,/check-backup-inventory\.mjs/);
 assert.match(script,/sha256sum -c/);
 assert.match(script,/data\.corrupt/);
 assert.match(script,/corrupt_sha/);
 assert.match(script,/original_sha/);
});

test('la restauración usa otra base, transacción y borra datos temporales',()=>{
 assert.match(script,/restore_db="cotironda_ci_restored"/);
 assert.match(script,/create database \$restore_db/);
 assert.match(script,/pg_restore --dbname="\$restore_db" --clean --if-exists --no-owner/);
 assert.match(script,/--single-transaction --exit-on-error/);
 assert.match(script,/rm -rf -- "\$workdir"/);
 assert.match(script,/trap cleanup EXIT/);
 assert.match(script,/drop database \$restore_db/);
 assert.doesNotMatch(workflow,/actions\/upload-artifact|upload-artifact@/);
});

test('prueba pérdida real del fixture ficticio y verifica políticas en destino',()=>{
 assert.match(script,/insert into public.catalog_categories/);
 assert.match(script,/delete from public.catalog_categories where code='ci_recuperacion'/);
 assert.match(script,/recovery_fixture_no_restored/);
 assert.match(script,/recovery_rls_inventory_invalid/);
 assert.match(script,/recovery_session_guard_invalid/);
 assert.match(script,/recovery_registrar_policies_invalid/);
 assert.match(script,/recovery_storage_private_invalid/);
 assert.match(script,/recovery_guard_acl_invalid/);
 assert.match(script,/recovery_registro_abierto/);
});

test('CI restaura solo después de aplicar migraciones y limpiar tests',()=>{
 const migrations=workflow.indexOf('Aplicar las 12 migraciones HISTÓRICAS desde cero');
 const clean=workflow.indexOf("Verificar limpieza final: flag apagado y cero datos de pruebas");
 const restore=workflow.indexOf('Restaurar backup PG17 en base aislada sin datos ni secretos reales');
 assert.ok(migrations>=0&&clean>migrations&&restore>clean);
 assert.match(workflow,/COTIRONDA_CI_BACKUP_RESTORE: 'true'/);
 assert.match(workflow,/run: bash scripts\/ci\/pg17-backup-restore-drill\.sh/);
 assert.match(check,/validarInventarioRespaldo/);
 assert.match(check,/process\.env\.GITHUB_ACTIONS!=='true'/);
});

test('documentación no equipara backup SQL sintético con recuperación gestionada completa',()=>{
 assert.match(doc,/plan=free/);
 assert.match(doc,/\*\*NO contienen los bytes de Storage\*\*/);
 assert.match(doc,/esquemas gestionados \u0060auth\u0060 y \u0060storage\u0060/);
 assert.match(doc,/\*\*No hay evidencia de un backup externo/);
 assert.match(doc,/\*\*todavía NO realizado\*\*/);
 assert.match(doc,/\*\*PENDIENTE\*\*|\[ \] \*\*Crear primera copia REAL/);
});
