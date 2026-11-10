import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 inspeccionarSqlMvp334,decidirPilotoDosProveedoresMvp334,
 comprobarRutaMinimaFuenteMvp334,SQL_PATH
} from '../../scripts/piloto/mvp334-minimal-two-supplier-decision.mjs';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=readFileSync(resolve(ROOT,SQL_PATH),'utf8');
const index=readFileSync(resolve(ROOT,'supabase/functions/cotironda-piloto-whapi/index.ts'),'utf8');
const worker=readFileSync(resolve(ROOT,'supabase/functions/cotironda-piloto-ai-batch/index.ts'),'utf8');
const fixture=()=>({
 fase:'mvp334_preflight_solo_lectura',
 participantes_activos:{comprador:1,proveedores:2,comprador_vinculado:1,proveedores_contactables:2},
 catalogos:{articulos:106,con_familia:86,en_revision:20,
  proveedores_con_familias:2,sin_confirmacion_formal:2},
 permisos_administrativos:{comprador:1,proveedores:2},
 servicios:{whatsapp_entrada:true,whatsapp_salida:true,ia_central:true,
  despacho_legacy:true,comprador_operativo:true},
 gates_nuevos:{auto_release:false,batch:false,buyer_notice:false},
 riesgos_de_reenvio:{trabajos_inseguros:0,mensajes_inseguros:0},
 presupuestos_de_intentos:{lote_diario:20,lote_por_comprador:8,avisos_diarios:10},
 evidencia_recepcion_24h:1,programadores_lote:0,
 verificacion_externa_pendiente:true,publicacion_autorizada:false,
 preflight_sql_apto:true
});
const decide=s=>decidirPilotoDosProveedoresMvp334(s);
test('MVP334: solo lectura, consulta única sin escrituras ni secretos',()=>{
 assert.deepEqual(inspeccionarSqlMvp334(source),
  {state:'readonly_sql_checked',allow_mutations:false});
 for(const key of ['contact_sha256','nonce_b64','ciphertext_b64','source_reference','message_body'])
  assert(!source.includes(key),'SQL selecting sensitive field '+key);
 assert(!/\b(INSERT|UPDATE|DELETE)\b/iu.test(source.replace(/--[^\n]*/gu,'')));
});
test('MVP334: una sentencia de escritura falla antes de tocar base',()=>{
 assert.throws(()=>inspeccionarSqlMvp334(source+'\nUPDATE tabla SET enabled=true;'),
  /mvp334_not_audited_readonly_sql/u);
 assert.throws(()=>inspeccionarSqlMvp334(source.replace('WITH personas AS (','WITH cambiado AS (')),
  /mvp334_not_audited_readonly_sql/u);
});
test('MVP334: fuente de verdad usa ruta inmediata para máximo dos proveedores',()=>{
 assert.equal(comprobarRutaMinimaFuenteMvp334(index,worker),true);
});
test('MVP334: resultado SQL viable nunca autoriza envío ni publicación',()=>{
 const r=decide(fixture());
 assert.equal(r.estado,'sql_apto_para_preparacion_controlada');
 assert.deepEqual(r.bloqueos_sql,[]);
 assert.equal(r.max_proveedores_por_prueba,2);
 assert.equal(r.requerir_procesador_lotes_mvp314,false);
 assert.equal(r.requerir_aviso_diferido_mvp315,false);
 assert.equal(r.requerir_auto_release_mvp306,true);
 assert.equal(r.pendiente_whapi_sandbox_auth_cupo_y_token,true);
 assert.equal(r.pendiente_verificacion_secretos_y_presupuesto_ia,true);
 assert.equal(r.pendiente_publicar_mvp333,true);
 assert.equal(r.habilitacion_ejecucion,false);
 assert.equal(r.mensajes_enviados,0);
 assert.equal(r.cambios_en_base,0);
});
test('MVP334: catálogos sin confirmación no implican stock',()=>{
 const r=decide(fixture());
 assert(r.advertencias.includes('catalogos_registrados_sin_confirmacion_stock'));
 assert(r.advertencias.includes('renglones_catalogo_por_revisar'));
});
for(const [name,transform,reason] of [
 ['proveedor adicional',s=>{s.participantes_activos.proveedores=3},'participantes_o_canales_incompletos'],
 ['proveedor fuera de canal',s=>{s.participantes_activos.proveedores_contactables=1},'participantes_o_canales_incompletos'],
 ['comprador sin vincular',s=>{s.participantes_activos.comprador_vinculado=0},'participantes_o_canales_incompletos'],
 ['sin permiso comercial',s=>{s.permisos_administrativos.proveedores=1},'permisos_sin_evidencia'],
 ['sin catalogo reconocido',s=>{s.catalogos.proveedores_con_familias=1},'catalogos_insuficientes'],
 ['sin ruta IA',s=>{s.servicios.comprador_operativo=false},'flujo_ia_o_whatsapp_inhabilitado'],
 ['auto liberacion ya activa',s=>{s.gates_nuevos.auto_release=true},'gates_ya_activos_revisar_previamente'],
 ['lotes ya activos',s=>{s.gates_nuevos.batch=true},'gates_ya_activos_revisar_previamente'],
 ['avisos ya activos',s=>{s.gates_nuevos.buyer_notice=true},'gates_ya_activos_revisar_previamente'],
 ['outbox incierto',s=>{s.riesgos_de_reenvio.mensajes_inseguros=1},'reconciliar_envios_inciertos'],
 ['job leased',s=>{s.riesgos_de_reenvio.trabajos_inseguros=1},'reconciliar_envios_inciertos'],
 ['sin ultimo ingreso',s=>{s.evidencia_recepcion_24h=0},'falta_recepcion_reciente'],
 ['SQL dice no apto',s=>{s.preflight_sql_apto=false},'preflight_sql_no_apto'],
 ['permiso publicar accidental',s=>{s.publicacion_autorizada=true},'sello_fuera_de_lectura'],
 ['check externo falsamente negado',s=>{s.verificacion_externa_pendiente=false},'sello_fuera_de_lectura']
]){
 test('MVP334 bloquea: '+name,()=>{
  const s=fixture();transform(s);
  const r=decide(s);
  assert.equal(r.estado,'no_apto_para_activar');
  assert(r.bloqueos_sql.includes(reason),JSON.stringify(r.bloqueos_sql));
  assert.equal(r.habilitacion_ejecucion,false);
  assert.equal(r.mensajes_enviados,0);
 });
}
test('MVP334: sin evidencia o tipos inyectados se bloquea',()=>{
 for(const v of [null,undefined,{},[],{...fixture(),catalogos:null},
  {...fixture(),evidencia_recepcion_24h:'1'},
  {...fixture(),presupuestos_de_intentos:{...fixture().presupuestos_de_intentos,lote_diario:-1}}]){
  const r=decide(v);
  assert.equal(r.estado,'no_apto_para_activar');
  assert(r.bloqueos_sql.includes('evidencia_sql_invalida'));
 }
});
test('MVP334: no prometer aprobación por estar en el Sandbox',()=>{
 const s=fixture();
 s.programadores_lote=5; // programador externo no cambia la ruta mínima
 const r=decide(s);
 assert.equal(r.requerir_procesador_lotes_mvp314,false);
 assert.equal(r.habilitacion_ejecucion,false);
 assert.equal(r.pendiente_whapi_sandbox_auth_cupo_y_token,true);
});
