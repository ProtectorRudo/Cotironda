import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {recepcionDocumentalMvp354} from
 '../../src/domain/ia-central/recepcion-documental-mvp354.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const sql=readFileSync(resolve(root,
 'supabase/piloto/mvp354_document_receipts_private.sql'),'utf8');
const edge=readFileSync(resolve(root,
 'supabase/functions/cotironda-piloto-seguimiento/index.ts'),'utf8');

const raw=()=>({
 state:'recepcion_documental_anonima_mvp354',
 invitados:2,archivos_recibidos:1,pendientes:1,
 precios_validados:false,originales_disponibles:false,
 identidades_reveladas:false,comparacion_permitida:false
});
test('MVP354: un PDF recibido no requiere lectura de precios ni nuevos mensajes',()=>{
 const r=recepcionDocumentalMvp354(raw(),{state:'waiting',can_open:false,received_count:0});
 assert.deepEqual(r,raw());
 assert.equal(Object.isFrozen(r),true);
 assert.equal(r.precios_validados,false);
 assert.equal(r.originales_disponibles,false);
});
test('MVP354: dos proveedores y duplicados no se convierten en mas de dos recibidos',()=>{
 assert.deepEqual(recepcionDocumentalMvp354({...raw(),archivos_recibidos:2,pendientes:0},
   {state:'closed'}).archivos_recibidos,2);
 for(const n of [-1,3,1.5,'2',NaN,Infinity,26]){
   assert.equal(recepcionDocumentalMvp354(
     {...raw(),archivos_recibidos:n},{state:'waiting'}),null);
 }
});
test('MVP354: no aceptar payload inyectado, condiciones falsas o aritmetica inexacta',()=>{
 for(const changed of [
  {pendientes:0},{invitados:0},{precios_validados:true},
  {identidades_reveladas:true},{originales_disponibles:true},
  {comparacion_permitida:true},{whatsapp:'549221000000'},
  {supplier_key:'supplier_1'},{total:'1000'}, {source_sha256:'a'.repeat(64)},
  {state:'not_found'}
 ]){
   assert.equal(recepcionDocumentalMvp354({...raw(),...changed},
     {state:'waiting'}),null);
 }
});
test('MVP354: nunca abrir sin comprador con ronda vigente y token validado',()=>{
 for(const v of [null,undefined,{},[],{state:'not_found'},{state:'cancelled'},
  {state:'draft'},{state:'invalid'}]){
  assert.equal(recepcionDocumentalMvp354(raw(),v),null);
 }
 for(const v of [null,undefined,[],{},'valid',1]){
  assert.equal(recepcionDocumentalMvp354(v,{state:'waiting'}),null);
 }
});
test('MVP354: SQL valida token, proveedor, invitacion y archivo sin depender de IA',()=>{
 assert.match(sql,/buyer_tracking_mvp091/u);
 assert.match(sql,/t\.revoked_at IS NULL/u);
 assert.match(sql,/t\.expires_at>clock_timestamp\(\)/u);
 assert.match(sql,/buyer\.opted_out_at IS NULL/u);
 assert.match(sql,/other_job\.request_id<>r\.request_id/u);
 assert.match(sql,/other_job\.state='api_accepted'/u);
 assert.match(sql,/j\.state='api_accepted'/u);
 assert.match(sql,/p\.chat_hmac=a\.chat_hmac/u);
 assert.match(sql,/a\.state='stored'/u);
 assert.match(sql,/a\.content_sha256 ~ /u);
 assert.match(sql,/a\.storage_path=\('media\/'\|\|a\.message_hmac\)/u);
 assert.match(sql,/m\.received_at>=e\.first_sent/u);
 assert.match(sql,/m\.request_id=r\.request_id/u);
 assert.match(sql,/m\.message_hmac=a\.message_hmac/u);
 assert.match(sql,/proof\.source_sha256=a\.content_sha256/u);
 assert.match(sql,/proof\.association IN \('quoted_whapi_id','single_active_round',[\s\S]*?'prior_supplier_preamble'\)/u);
 assert.match(sql,/unresolved\.state IN/u);
 assert.match(sql,/other_job\.finished_at<=m\.received_at/u);
 assert.match(sql,/m\.received_at<=r\.closes_at/u);
 assert.match(sql,/SELECT DISTINCT e\.supplier_key/u);
 assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/iu);
});
test('MVP354: RPC reservada a service_role; SQL entrega SOLO ocho campos inocuos',()=>{
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*?FROM PUBLIC,anon,authenticated/u);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION[\s\S]*?TO service_role/u);
 const start=sql.indexOf("SELECT jsonb_build_object(");
 const end=sql.indexOf(") FROM contexto c CROSS JOIN totales t",start);
 assert(start>=0&&end>start);
 const response=sql.slice(start,end);
 const keys=[...response.matchAll(/'([a-z_]+)',/gu)].map(m=>m[1]);
 assert.deepEqual(keys,[
  'state','invitados','archivos_recibidos','pendientes','precios_validados',
  'originales_disponibles','identidades_reveladas','comparacion_permitida'
 ]);
 for(const sensitive of ['source_sha256','message_hmac','supplier_key','request_id',
    'storage_path','phone','chat_hmac','buyer_key','importe_renglon','monto_total']){
   assert(!response.includes(sensitive));
 }
});
test('MVP354: Edge OFF por defecto y no reemplaza ofertas ni recibidos legados',()=>{
 assert.match(edge,/COTIRONDA_PILOT_DOCUMENT_RECEIPTS_MVP354_ENABLED'\)==='true'/u);
 assert.match(edge,/recepcionDocumentalMvp354\(docs\.data,publicResult\)/u);
 assert.match(edge,/publicResult=\{\.\.\.publicResult,document_receipts:reduced\}/u);
 assert.match(edge,/docReceipts/u);
 assert.match(edge,/receipt\.originales_disponibles===false/u);
 assert.match(edge,/receipt\.identidades_reveladas===false/u);
 assert.match(edge,/No implica precios verificados ni habilita descargas/u);
});

test('MVP355: no basta el request_id escrito en archive por archivista',()=>{
 assert.match(sql,/JOIN cotironda_piloto_privado\.whapi_inbox m/u);
 assert.match(sql,/JOIN cotironda_piloto_privado\.ai_supplier_links_mvp225 proof/u);
 assert.match(sql,/m\.participant_key=e\.supplier_key/u);
 assert.match(sql,/m\.chat_hmac=a\.chat_hmac/u);
 assert.match(sql,/m\.kind=a\.kind/u);
 assert.match(sql,/proof\.request_id=r\.request_id/u);
 assert.match(sql,/proof\.supplier_key=e\.supplier_key/u);
 assert.match(sql,/proof\.kind=a\.kind/u);
 assert.match(sql,/a\.reserved_at>=m\.received_at/u);
 assert.doesNotMatch(sql,/other_job\.finished_at<=a\.reserved_at/u);
});
test('MVP355: fixture contempla vinculaciones verdaderas, negativas y revocaciones',()=>{
 const fixture=readFileSync(resolve(root,
  'supabase/tests/ci/mvp354-document-receipts-pg17.sql'),'utf8');
 for(const marker of [
  'mvp355_archive_request_id_alone_counted',
  'mvp355_inbox_request_id_alone_counted',
  'mvp355_excel_without_proof_counted',
  'mvp355_forged_link_sha_counted',
  'mvp355_weak_semantic_link_counted',
  'mvp355_unresolved_conflict_counted',
  'mvp354_ambiguous_round_was_counted',
  'mvp354_revoked_token_count_leaked',
  'ROLLBACK;'
 ])assert(fixture.includes(marker));
});
