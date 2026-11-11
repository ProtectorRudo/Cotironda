/**
 * MVP334 — decide desde evidencia agregada si vale probar UNA ronda con
 * comprador + exactamente 2 proveedores. Sin secretos ni API ni SQL mutador.
 * SOLO PREPARACION. El backend real nunca llama a este módulo.
 */
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SQL_PATH='scripts/piloto/mvp334-dos-proveedores-preflight-readonly.sql';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const num=x=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
export function inspeccionarSqlMvp334(source){
 if(typeof source!=='string'||source.length<1000||source.length>12000)
  throw Error('mvp334_sql_missing_or_oversized');
 const plain=source.replace(/--[^\n]*/gu,'').trim();
 if(!/^WITH\s+personas\s+AS\s*\(/iu.test(plain)||
  !/AS\s+evidence_snapshot\s+FROM\s+personas\s+p\s+CROSS\s+JOIN\s+catalogos\s+c\s+CROSS\s+JOIN\s+controles\s+g\s+CROSS\s+JOIN\s+operaciones\s+o\s*;\s*$/iu.test(plain)||
  /\b(INSERT|UPDATE|DELETE|UPSERT|MERGE|CREATE|DROP|ALTER|TRUNCATE|COPY|EXECUTE|CALL|GRANT|REVOKE|DO)\b/iu.test(plain)||
  (plain.match(/;/gu)??[]).length!==1||
  !plain.includes('proveedor_contactable_mvp307')||
  !plain.includes('cotironda_piloto_ia_trial_flags_mvp229')||
  !plain.includes('cotironda_piloto_ia_review_launch_mvp285'))
  throw Error('mvp334_not_audited_readonly_sql');
 return Object.freeze({state:'readonly_sql_checked',allow_mutations:false});
}
function validateShape(s){
 if(!isObj(s)||s.fase!=='mvp334_preflight_solo_lectura')return false;
 const p=s.participantes_activos,c=s.catalogos,a=s.permisos_administrativos,
  g=s.servicios,w=s.gates_nuevos,r=s.riesgos_de_reenvio,b=s.presupuestos_de_intentos;
 if(![p,c,a,g,w,r,b].every(isObj))return false;
 return [p.comprador,p.proveedores,p.comprador_vinculado,p.proveedores_contactables,
  c.articulos,c.con_familia,c.en_revision,c.proveedores_con_familias,
  c.sin_confirmacion_formal,a.comprador,a.proveedores,
  r.trabajos_inseguros,r.mensajes_inseguros,
  s.evidencia_recepcion_24h,s.programadores_lote,
  b.lote_diario,b.lote_por_comprador,b.avisos_diarios].every(num)&&
  [g.whatsapp_entrada,g.whatsapp_salida,g.ia_central,g.despacho_legacy,
   g.comprador_operativo,w.auto_release,w.batch,w.buyer_notice,
   s.preflight_sql_apto,s.verificacion_externa_pendiente,
   s.publicacion_autorizada].every(x=>typeof x==='boolean');
}
export function decidirPilotoDosProveedoresMvp334(snapshot){
 const fallos=[];
 if(!validateShape(snapshot))fallos.push('evidencia_sql_invalida');
 else {
  const p=snapshot.participantes_activos,c=snapshot.catalogos,
   a=snapshot.permisos_administrativos,g=snapshot.servicios,
   w=snapshot.gates_nuevos,r=snapshot.riesgos_de_reenvio;
  if(p.comprador!==1||p.proveedores!==2||p.comprador_vinculado!==1||
   p.proveedores_contactables!==2)fallos.push('participantes_o_canales_incompletos');
  if(a.comprador!==1||a.proveedores!==2)fallos.push('permisos_sin_evidencia');
  if(c.proveedores_con_familias!==2||c.con_familia<2)
   fallos.push('catalogos_insuficientes');
  if(!g.whatsapp_entrada||!g.whatsapp_salida||!g.ia_central||
   !g.despacho_legacy||!g.comprador_operativo)
   fallos.push('flujo_ia_o_whatsapp_inhabilitado');
  // Auto-release is the APPROVED no-confirmation flow, not a rollout
  // hazard. Batch and deferred notices are intentionally still off.
  if(!w.auto_release||w.batch||w.buyer_notice)
   fallos.push('configuracion_auto_liberacion_o_lotes_incorrecta');
  if(r.trabajos_inseguros!==0||r.mensajes_inseguros!==0)
   fallos.push('reconciliar_envios_inciertos');
  // A recent inbound message proves E2E activity, but must NOT be
  // required BEFORE the first message of a fresh controlled round.
  if(snapshot.preflight_sql_apto!==true)fallos.push('preflight_sql_no_apto');
  if(snapshot.verificacion_externa_pendiente!==true||
   snapshot.publicacion_autorizada!==false)fallos.push('sello_fuera_de_lectura');
 }
 const warnings=[];
 if(validateShape(snapshot)&&snapshot.evidencia_recepcion_24h===0)
  warnings.push('sin_ingreso_comprador_reciente_no_prueba_whatsapp_e2e');
 if(validateShape(snapshot)&&snapshot.catalogos.sin_confirmacion_formal>0)
  warnings.push('catalogos_registrados_sin_confirmacion_stock');
 if(validateShape(snapshot)&&snapshot.catalogos.en_revision>0)
  warnings.push('renglones_catalogo_por_revisar');
 return Object.freeze({
  estado:fallos.length?'no_apto_para_activar':'sql_apto_para_preparacion_controlada',
  bloqueos_sql:Object.freeze(fallos),
  advertencias:Object.freeze(warnings),
  max_proveedores_por_prueba:2,
  requerir_procesador_lotes_mvp314:false,
  requerir_aviso_diferido_mvp315:false,
  requerir_auto_release_mvp306:true,
  pendiente_whapi_sandbox_auth_cupo_y_token:true,
  pendiente_verificacion_secretos_y_presupuesto_ia:true,
  pendiente_publicar_mvp333:true,
  sin_permisos_para_produccion:true,
  habilitacion_ejecucion:false,
  cambios_en_base:0,
  mensajes_enviados:0
 });
}
export function comprobarRutaMinimaFuenteMvp334(indexSource,workerSource){
 if(typeof indexSource!=='string'||typeof workerSource!=='string')return false;
 return indexSource.includes("Deno.env.get('COTIRONDA_PILOT_BUYER_AUTO_RELEASE_MVP306_ENABLED')==='true'")&&
   indexSource.includes("buyerLinkRequests.push({mode:'auto'")&&
   indexSource.includes('maxJobs:2,')&&
   indexSource.includes('notificarSeguimientoMvp289({')&&
   indexSource.includes("if(sec.outbound&&trialDispatchChats.size>0)")&&
   workerSource.includes("Deno.env.get('COTIRONDA_PILOT_AI_BATCH_MVP314_ENABLED')!=='true'")&&
   workerSource.includes("Deno.env.get('COTIRONDA_PILOT_BUYER_NOTICE_MVP315_ENABLED')==='true'");
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const source=readFileSync(resolve(ROOT,SQL_PATH),'utf8');
 const checked=inspeccionarSqlMvp334(source);
 process.stdout.write(JSON.stringify({
  ...checked,proyecto:'ilggkalaafhtiysyzlmg',
  publicacion_autorizada:false,mensajes_enviados:0
 })+'\n');
}
