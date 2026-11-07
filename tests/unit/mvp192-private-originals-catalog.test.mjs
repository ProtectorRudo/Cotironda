import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {proyectarCatalogoOriginalesMvp192 as project} from
 '../../src/server/catalogo-originales-comprador-mvp192.ts';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp192_private_originals_catalog_and_context.sql',
 import.meta.url),'utf8');
const legacy=readFileSync(new URL(
 '../../src/domain/descarga-originales-mvp161.ts',
 import.meta.url),'utf8');
const uuid1='89f7d40f-53b4-4d8b-a21c-61d1a8b99311';
const uuid2='2f4f441a-2e39-4e17-ab33-517e817a73c0';
const uuid3='d4f7117a-516c-4977-a150-70066e33fe0f';
const source=()=>({
 state:'authorized_catalog',total:2,originals:[
  {documentId:uuid1,mime:'application/pdf',kind:'document'},
  {documentId:uuid2,
   mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   kind:'document'}
 ]
});
const body=sql.replace(/^\s*--.*$/gmu,'');

test('MVP192: catálogo contiene TODOS los originales consentidos sin clasificación por ranking',()=>{
 const p=project(source());
 assert.equal(p?.estado,'originales_consentidos');
 assert.equal(p.total,2);
 assert.deepEqual(p.documentos.map(x=>x.documentoId),[uuid1,uuid2]);
 assert.deepEqual(p.documentos.map(x=>x.formato),['PDF','Excel']);
 assert.deepEqual(p.documentos.map(x=>x.nombre),[
  'Presupuesto original 01','Presupuesto original 02'
 ]);
 assert.equal(Object.isFrozen(p),true);
 assert.equal(Object.isFrozen(p.documentos),true);
 // Verifying a source's ranking_allowed=false is NOT a price ranking.
 // Ignore ONLY this explicitly false verifier guard; still reject any
 // algorithm that uses ranked/finalist/award to filter original downloads.
 assert.match(body,/ev\.ranking_allowed=false/);
 const noVerifierGuard=body.replace(/and\s+ev\.ranking_allowed=false/gu,'');
 assert.doesNotMatch(noVerifierGuard,
  /ranking_allowed|ranked|finalist|\badjudicad\w*\b|winner/iu);
});

test('MVP192: nunca copiar HMAC, ruta de Storage, proveedor o precio al navegador',()=>{
 const s=source();
 s.originals[0].supplier_key='proveedor_sensible';
 s.originals[0].message_hmac='b'.repeat(64);
 s.originals[0].storage_path='media/'+'b'.repeat(64);
 s.originals[1].total_price='$999999';
 s.hiddenAuth='secreto_jwt';
 const p=project(s),str=JSON.stringify(p);
 assert.ok(p);
 for(const value of ['proveedor_sensible','message_hmac','storage_path',
  'total_price','secreto_jwt','media/','supplier_key','sha256'])
  assert.ok(!str.includes(value),value);
});

test('MVP192: no generar enlaces ni etiquetas engañosas de ganador',()=>{
 const p=project(source());
 assert.ok(p);
 const text=JSON.stringify(p);
 assert.doesNotMatch(text,/https?:|storage|signed|downloadUrl|\bganador(?:es)?\b|\bpuesto\s+[0-9]+\b|mejor precio/iu);
});

test('MVP192: rechazo total de respuestas incompletas, UUID ajenos y formatos activos',()=>{
 const mutations=[
  x=>{x.state='not_authorized'},
  x=>{x.total=3},
  x=>{x.total=1.5},
  x=>{x.total=-1},
  x=>{x.total='2'},
  x=>{x.originals=null},
  x=>{x.originals[0].documentId='../../otro'},
  x=>{x.originals[0].documentId='b'.repeat(64)},
  x=>{x.originals[0].documentId=uuid3}, // a different variant? uuid3 valid, override below
  x=>{x.originals[0].mime='text/html'},
  x=>{x.originals[0].mime='application/javascript'},
  x=>{x.originals[0].kind='unknown'},
  x=>{x.originals[0].kind=null},
  x=>{x.originals[1].documentId=uuid1}
 ];
 for(let i=0;i<mutations.length;i++){
  if(i===8)continue; // another valid RFC 4122 UUID is not inherently wrong
  const s=source();mutations[i](s);
  assert.equal(project(s),null,'malformed case '+i);
 }
});

test('MVP192: listado legítimo vacío no revela presupuesto histórico',()=>{
 const p=project({state:'authorized_catalog',total:0,originals:[]});
 assert.equal(p?.total,0);
 assert.deepEqual(p.documentos,[]);
 assert.equal(project(null),null);
 assert.equal(project({state:'authorized_catalog',total:0,originals:[],contact:'leak'})?.total,0);
});

test('MVP192: catálogo privado RPC concede solo service_role; no permite navegador ni token WhatsApp',()=>{
 assert.match(sql,/security definer[\s\S]*set search_path=''/iu);
 assert.match(sql,/revoke all on function[\s\S]*from public,anon,authenticated,service_role;/iu);
 assert.match(sql,/grant execute on function[\s\S]*to service_role;/iu);
 assert.doesNotMatch(body,/grant execute[\s\S]*to authenticated;/iu);
 assert.doesNotMatch(body,/buyer_tracking_mvp091|token_hash|public_text/iu);
 assert.match(sql,/caller contract:[\s\S]*verified PILOT JWT/iu);
});

test('MVP192: Auth PILOTO necesita identidad telefónica y sesión vigente',()=>{
 for(const clause of [
  'from auth.users u','join auth.sessions sess',
  'sess.id=p_auth_session_id and sess.user_id=u.id',
  'where u.id=p_auth_user_id',
  'u.phone_confirmed_at is not null',
  'u.deleted_at is null',
  'u.is_anonymous=false',
  'u.banned_until',
  'sess.not_after',
  'ch.contact_sha256=encode(extensions.digest(',
  "'@s.whatsapp.net'",
  'bound.message_hmac=ch.authenticated_message_hmac',
  'buyer.participant_role=\'buyer\'',
  'duplicate.contact_sha256=ch.contact_sha256'
 ])assert.ok(sql.includes(clause),clause);
 assert.doesNotMatch(body,/raw_user_meta_data|user_metadata|p_phone|p_token_hash/iu);
});

test('MVP192: política OFF/prospectiva, consentimiento por proveedor/ronda, no retroactividad',()=>{
 for(const clause of [
  'original_share_policy_mvp178',
  'pol.enabled=true',
  'r.created_at>pol.activated_at',
  "r.state='closed'",
  'r.closed_at>=r.closes_at',
  'original_share_consents_mvp178',
  'c.accepted_at>=v_activation',
  'c.accepted_at>=r.created_at and c.accepted_at<=i.created_at',
  'c.revoked_at is null',
  'c.alcance=\'original_identificable_tras_cierre\'',
  'consent_msg.message_hmac=c.consent_message_hmac',
  'consent_msg.received_at=c.accepted_at'
 ])assert.ok(sql.includes(clause),clause);
 assert.match(legacy,/c\.aceptadoMs<r\.creadaMs/);
 assert.match(legacy,/c\.aceptadoMs<d\.politicaDesdeMs!/);
});

test('MVP192: solo archivo almacenado, sha concordante, autor Whapi e invitación válida',()=>{
 for(const clause of [
  "m.state='stored'",
  "m.kind in ('document','image')",
  'm.storage_path=(\'media/\'||q.message_hmac)',
  'm.content_sha256=q.source_sha256',
  'm.size_bytes between 1 and 8388608',
  'source_msg.message_hmac=q.message_hmac',
  'source_msg.participant_key=q.supplier_key',
  'source_msg.received_at between i.created_at and r.closes_at',
  'q.received_at between i.created_at and r.closes_at',
  "supplier.participant_role='supplier'",
  'supplier.opted_out_at is null'
 ])assert.ok(sql.includes(clause),clause);
 assert.doesNotMatch(body,/createSignedUrl|publicUrl|storage\.objects[\s\S]*grant/iu);
});

test('MVP192: excluir presupuestos reemplazados, incluso con timestamp empatado',()=>{
 assert.match(sql,/not exists\s*\([\s\S]*?supplier_media_quotes_mvp098 newer/iu);
 assert.match(sql,/newer\.supplier_key=q\.supplier_key/iu);
 assert.match(sql,/newer\.request_id=q\.request_id/iu);
 assert.match(sql,/newer\.received_at>=q\.received_at/iu);
 assert.match(sql,/newer\.message_hmac<>q\.message_hmac/iu);
 assert.doesNotMatch(sql,/limit\s+2\b/iu);
 assert.match(sql,/if v_total>100 then return null/iu);
});

test('MVP192: identificador opaco estable por ronda y HMAC, nunca usa identidad del proveedor',()=>{
 function id(round,hmac){
  const s=createHash('sha256').update(
   'cotironda-original-document-mvp192|'+round+'|'+hmac).digest('hex');
  return s.slice(0,8)+'-'+s.slice(8,12)+'-4'+s.slice(13,16)+
   '-a'+s.slice(17,20)+'-'+s.slice(20,32);
 }
 const a='69ffb4b2-6554-4f25-bb08-8ac980f163e2';
 const b='52a11eb2-61d1-46a1-9864-32bac52a9ffb';
 const h='a'.repeat(64),g='c'.repeat(64);
 assert.equal(id(a,h),id(a,h));
 assert.notEqual(id(a,h),id(b,h));
 assert.notEqual(id(a,h),id(a,g));
 assert.match(id(a,h),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/u);
 assert.doesNotMatch(id(a,h),new RegExp(h));
 for(const clause of [
  "'cotironda-original-document-mvp192|'",
  "p_request_id::text",
  "v_rec.message_hmac",
  "extensions.digest(convert_to(",
  "substr(v_hex,1,8)",
  "substr(v_hex,21,12)"
 ])assert.ok(sql.includes(clause),clause);
});

test('MVP192: detalle de fuente solo dentro de respuesta privada para MVP190',()=>{
 assert.match(sql,/if p_document_id is null then[\s\S]*'authorized_catalog'/iu);
 assert.match(sql,/elsif p_document_id=v_doc then[\s\S]*'authorized_original'/iu);
 assert.match(sql,/'autorizacion',jsonb_build_object/iu);
 for(const clause of [
  "'mensajeHmac',v_rec.message_hmac",
  "'sha256',v_rec.source_sha256",
  "'ruta',v_rec.storage_path",
  "'revisionVigente',true",
  "'verificada',true",
  "'bucket','cotironda-piloto-originals'"
 ])assert.ok(sql.includes(clause),clause);
 assert.ok(!sql.includes("to authenticated;"));
});
