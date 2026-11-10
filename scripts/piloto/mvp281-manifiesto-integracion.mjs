// MVP281: orden explícito de migraciones candidatas; NO instala ni conecta a servicios.
// Aún se necesita revisar dependencias, simular transacción y autorizar «Publicalo».
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const migrationFiles=Object.freeze([
  'mvp245_media_quote_ia_central_verified.sql',
  'mvp248_publicador_documental_multirubro_privado.sql',
  'mvp250_marcas_materiales_seguras_publicador.sql',
  'mvp253_visual_ocr_policy_provenance.sql',
  'mvp256_document_retry_policy_safe.sql',
  'mvp257_whapi_uncertain_evidence.sql',
  'mvp258_uncertain_noid_triage.sql',
  'mvp259_commercial_memory_scoped.sql',
  'mvp260_memory_broker_bridge.sql',
  'mvp261_source_versions_commercial.sql',
  'mvp262_private_supervisor_readonly.sql',
  'mvp263_supervisor_bounded_watchdog.sql',
  'mvp264_openai_usage_meters.sql',
  'mvp265_supervisor_operator_casebook.sql',
  'mvp266_openai_unknown_persistent_review.sql',
  'mvp267_operator_supabase_auth_mfa_bridge.sql',
  'mvp274_continuous_pilot_optional_off.sql',
  'mvp276_comprador_archivo_txt_csv_autoridad_sha.sql',
  'mvp278_autorizacion_binarios_lectura_independiente.sql',
  'mvp279_revision_confirmacion_whatsapp_binarios.sql',
  'mvp280_confirmacion_unificada_comprador.sql'
]);

const repoRoot=fileURLToPath(new URL('../../', import.meta.url));
export function checkManifest(names=migrationFiles, exists=fs.existsSync, root=repoRoot) {
  const errors=[], seen=new Set();
  let previous=-1;
  for (const name of names) {
    if (!/^mvp\d{3}_[a-z0-9_]+\.sql$/.test(name) ||
        /(?:rollback|manual|activate|readiness|smoke)/i.test(name)) {
      errors.push('Nombre no instalable: '+name);
      continue;
    }
    if (seen.has(name)) errors.push('Duplicada: '+name);
    seen.add(name);
    const current=Number(name.match(/^mvp(\d{3})_/)[1]);
    if (current<previous) errors.push('Orden incorrecto: '+name);
    previous=current;
    if (!exists(path.join(root,'supabase','piloto',name))) {
      errors.push('Archivo ausente: '+name);
    }
  }
  if (!names.includes('mvp280_confirmacion_unificada_comprador.sql')) {
    errors.push('Falta la autorización universal MVP280');
  }
  if (names.length===0) errors.push('Manifiesto vacío');
  return {valid: errors.length===0, count:names.length, errors};
}

if (process.argv[1] && import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  if (process.argv.length>3 || (process.argv[2] && process.argv[2]!=='--check')) {
    process.stderr.write('Uso: node scripts/piloto/mvp281-manifiesto-integracion.mjs [--check]\n');
    process.exitCode=2;
  } else {
    const result=checkManifest();
    process.stdout.write(JSON.stringify({
      ...result,
      mode:'local_read_only', deploy_authorized:false,
      database_checked:false, migrations_applied:false, whatsapp_sent:false,
      ordered_files:migrationFiles.map(name=>'supabase/piloto/'+name)
    },null,2)+'\n');
    if (!result.valid) process.exitCode=1;
  }
}
