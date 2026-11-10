import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {vistaProveedoresCierreMvp303 as reduce} from
 '../../src/domain/ia-central/vista-proveedores-cierre-mvp303.ts';
import {buildMvp303Sql} from '../../scripts/piloto/mvp303-all-suppliers-builder.mjs';
const base={
 state:'proveedores_revelados_al_cierre',
 proveedores:[
  {nombre:'Pinturería Ejemplo',oferta:'Presupuesto 1',
   estado:'presupuesto_verificado'},
  {nombre:'Corralón Ejemplo',oferta:'Presupuesto 2',
   estado:'presupuesto_verificado'},
  {nombre:'Electricidad Ejemplo',oferta:null,
   estado:'envio_no_confirmado'},
  {nombre:'Ferretería Ejemplo',oferta:null,
   estado:'sin_respuesta'}
 ],cantidad:4,invitados:4,solo_post_cierre:true,
 identidades_reveladas:true,telefonos_revelados:false,
 ranking_global_permitido:false,adjudicacion_automatica:false,
 mensajes_enviados:false
};
const fresh=()=>structuredClone(base);
test('MVP303: todos los invitados, no solo 2 cotizantes verificados',()=>{
 const v=reduce(fresh());
 assert.equal(v.state,'proveedores_revelados_al_cierre');
 assert.equal(v.cantidad,4);
 assert.equal(v.proveedores.length,4);
 assert.deepEqual(v.proveedores.map(p=>p.oferta),
  ['Presupuesto 1','Presupuesto 2',null,null]);
 assert.equal(v.identidades_reveladas,true);
 assert.equal(v.telefonos_revelados,false);
 assert.equal(v.adjudicacion_automatica,false);
 assert.equal(v.mensajes_enviados,false);
 assert.equal(Object.isFrozen(v.proveedores),true);
});
test('MVP303: todas las ofertas siguen anónimas en espera; no validar sin RPC',()=>{
 for(const bad of [null,undefined,[],{},true,
  {state:'not_ready'}, {state:'not_found'},
  {state:'waiting',proveedores:fresh().proveedores},
  {state:'closed',proveedores:fresh().proveedores}]){
  assert.equal(reduce(bad),null);
 }
});
test('MVP303: rechazo estricto de falsificación de estado, contactos y ganadores',()=>{
 const variations=[
  x=>{x.state='waiting'},
  x=>{x.solo_post_cierre=false},
  x=>{x.identidades_reveladas=false},
  x=>{x.telefonos_revelados=true},
  x=>{x.adjudicacion_automatica=true},
  x=>{x.ranking_global_permitido=true},
  x=>{x.mensajes_enviados=true},
  x=>{x.cantidad=2},
  x=>{x.invitados=2},
  x=>{x.proveedores[0].whatsapp='5492210000000'},
  x=>{x.proveedores[0].supplier_key='supplier_private'},
  x=>{x.proveedores[0].nombre='<img onerror=alert(1)>'},
  x=>{x.proveedores[0].nombre='Corralón 5492211234567'},
  x=>{x.proveedores[0].oferta='Presupuesto 200'},
  x=>{x.proveedores[0].oferta=null},
  x=>{x.proveedores[1].oferta='Presupuesto 1'},
  x=>{x.proveedores[2].estado='presupuesto_verificado'},
  x=>{x.proveedores[3].estado='ganador'},
  x=>{x.proveedores[1].estado='sin_respuesta'},
  x=>{x.proveedores=Array(101).fill(x.proveedores[0]);x.cantidad=101;x.invitados=101;},
  x=>{x.internal_contacts=['phone']}
 ];
 for(const alter of variations){
  const input=fresh();alter(input);
  assert.equal(reduce(input),null,JSON.stringify(input).slice(0,300));
 }
});
test('MVP303: tolera lista parcial por retiro de consentimiento sin divulgarlo',()=>{
 const v=fresh();v.proveedores=v.proveedores.slice(0,2);v.cantidad=2;
 assert.equal(reduce(v)?.cantidad,2);
 assert.equal(reduce(v)?.invitados,4);
});
test('MVP303: SQL es prospectivo, service-only, sin contactos ni cron',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql',
  import.meta.url),'utf8');
 for(const phrase of [
  'all_supplier_reveal_activation_mvp303',
  'NOT enabled OR activated_at IS NOT NULL',
  'buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL',
  "v_request.state<>'closed'",
  'v_request.closes_at>now()',
  "inv.state='prepared'",
  "p.participant_role='supplier'",
  "p.opted_out_at IS NULL",
  'cotironda_piloto_privado.ai_buyer_review_mvp279',
  'cotironda_piloto_privado.ai_supplier_review_mvp227',
  "'telefonos_revelados',false",
  "'adjudicacion_automatica',false",
  "'mensajes_enviados',false",
  'REVOKE ALL ON FUNCTION',
  'TO service_role'
 ]) assert.ok(sql.includes(phrase),phrase);
 const code=sql.replace(/^--.*$/gm,'');
 assert.doesNotMatch(code,/\b(?:CALL|UPDATE|DELETE|TRUNCATE|NOTIFY|COPY|net\.http_post|cron\.schedule)\b/iu);
 assert.doesNotMatch(code,/\b(?:whatsapp|ciphertext|nonce_b64|contact_sha256|chat_hmac)\b/iu);
});
test('MVP303: SQL sintético reutiliza ronda MVP284 y revierte todo',()=>{
 const sql=buildMvp303Sql();
 const start=sql.indexOf('\\ir ./mvp284-roundtrip-e2e-pg17.sql');
 const migration=sql.indexOf('\\ir ../../piloto/mvp303_revelar_todos_los_proveedores_al_cierre.sql');
 const tests=sql.indexOf('\\ir ./mvp303-proveedores-todos-cierre-pg17.sql');
 assert.ok(start>=0&&migration>start&&tests>migration);
 assert.ok(sql.indexOf('\nROLLBACK;\nSELECT ')>tests);
 assert.equal(sql.split(/^ROLLBACK;\s*$/gm).length,2);
});
