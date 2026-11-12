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
 assert.match(sql,/a\.reserved_at>=e\.first_sent/u);
 assert.match(sql,/a\.reserved_at<=r\.closes_at/u);
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
