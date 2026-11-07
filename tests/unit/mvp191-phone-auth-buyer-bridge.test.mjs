import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {procesarDescargaOriginalMvp190} from
 '../../src/server/originales-descarga-http-mvp190.ts';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp191_buyer_verified_phone_identity_prospect_only.sql',
 import.meta.url),'utf8');
const handler=readFileSync(new URL(
 '../../src/server/originales-descarga-http-mvp190.ts',
 import.meta.url),'utf8');
const security=readFileSync(new URL(
 '../../supabase/piloto/mvp178_original_share_consent_private.sql',
 import.meta.url),'utf8');
const msg='cotironda_piloto_buyer_identity_mvp191';

test('MVP191: verificación de identidad no agrega contactos, endpoints ni tablas',()=>{
 assert.match(sql,/create or replace function public\.cotironda_piloto_buyer_identity_mvp191\(/iu);
 assert.match(sql,/\) returns boolean[\s\S]*language sql volatile security definer/iu);
 assert.doesNotMatch(sql,/create table|insert into|update auth\.|delete from|http_post|net\.http_post/iu);
 assert.doesNotMatch(sql,/returns jsonb|returns text|phone\s+as|contact_sha256\s+as/iu);
 const executable=sql.replace(/^\s*--.*$/gmu,'');
 assert.doesNotMatch(executable,/raw_user_meta_data|user_metadata|p_phone|p_chat_hmac|p_token_hash/iu);
 assert.match(sql,/returns boolean/iu);
 assert.match(handler,/verificarVinculoPiloto/);
 assert.match(handler,/if\(await deps\.verificarVinculoPiloto\(rondaId\)!==true\)return failure\(404\)/gu);
 const hits=handler.match(/verificarVinculoPiloto\(rondaId\)/gu);
 assert.equal(hits?.length,2); // before and after reading the storage bytes
});

test('MVP191: solo Auth del MISMO Supabase PILOTO, sesión REAL y teléfono confirmado',()=>{
 for(const clause of [
  "auth.jwt()->>'role'","auth.jwt()->>'iss'",
  "https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1",
  "auth.uid()",
  "auth.users u","auth.sessions sess",
  "sess.user_id=u.id",
  "u.id=auth.uid()",
  "auth.jwt()->>'session_id'",
  "sess.not_after",
  "u.deleted_at is null",
  "u.is_anonymous is false",
  "u.phone_confirmed_at is not null",
  "u.banned_until",
  "auth.jwt()->>'exp'"
 ])assert.ok(sql.includes(clause),clause);
 assert.doesNotMatch(sql,/qkercsoqhehbenbbncwk|COTIRONDA_DEV_REF/iu);
 assert.doesNotMatch(sql,/authorization.*service_role/iu);
});

test('MVP191: solo cruza el contacto privado YA autenticado por Whapi',()=>{
 for(const clause of [
  "r.buyer_key",
  "buyer.participant_role='buyer'",
  "buyer.consent_at is not null",
  "buyer.opted_out_at is null",
  "contact.participant_key=buyer.key",
  "contact.chat_hmac=buyer.chat_hmac",
  "proof.message_hmac=contact.authenticated_message_hmac",
  "proof.participant_key=buyer.key",
  "proof.chat_hmac=buyer.chat_hmac",
  "contact.contact_sha256=encode(extensions.digest(",
  "regexp_replace(u.phone,'^[+]','','')||'@s.whatsapp.net'",
  "duplicate.contact_sha256=contact.contact_sha256"
 ])assert.ok(sql.includes(clause),clause);
 const makeJid=phone=>phone.replace(/^\+/u,'')+'@s.whatsapp.net';
 const hash=x=>createHash('sha256').update(x).digest('hex');
 const expected=hash('5492215551234@s.whatsapp.net');
 assert.equal(hash(makeJid('+5492215551234')),expected);
 assert.equal(hash(makeJid('5492215551234')),expected);
 assert.notEqual(hash(makeJid('+5492215551235')),expected);
 assert.notEqual(hash('5492215551234'),expected);
 assert.notEqual(hash('+5492215551234@s.whatsapp.net'),expected);
});

test('MVP191: prospectividad y cierre, nunca descargar originales de una ronda histórica',()=>{
 for(const clause of [
  "original_share_policy_mvp178",
  "policy.enabled=true",
  "policy.activated_at is not null",
  "r.created_at>policy.activated_at",
  "r.state='closed'",
  "r.closed_at>=r.closes_at",
  "r.closed_at<=clock_timestamp()"
 ])assert.ok(sql.includes(clause),clause);
 assert.match(security,/enabled boolean not null default false/iu);
 assert.match(security,/values\s*\(true,false,null\)/iu);
 assert.doesNotMatch(sql,/\b(?:price_rank|finalist|adjudicacion|winner)\b/iu);
});

test('MVP191: API Auth únicamente, nunca anon, service role ni el link compartible',()=>{
 assert.match(sql,/revoke all on function[\s\S]*?buyer_identity_mvp191\(uuid\)[\s\S]*?from public,anon,authenticated,service_role;/iu);
 assert.match(sql,/grant execute on function[\s\S]*?buyer_identity_mvp191\(uuid\)[\s\S]*?to authenticated;/iu);
 assert.doesNotMatch(sql,/grant execute[\s\S]*to (?:anon|service_role);/iu);
 assert.doesNotMatch(sql,/buyer_tracking_mvp091|token_hash|public_text/iu);
 assert.doesNotMatch(sql,/request\.jwt\.claims.*:=/iu);
});

test('MVP191: document handler no lee ni sirve los originales si falla el puente',async()=>{
 const now=1800000000000,round='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
 const doc='a3c659f4-40b7-4fbe-9246-c2de912811a3';
 const req=new Request('https://cotironda.test/originales/'+doc);
 let lookup=0,storage=0,session=0,linked=0;
 const deps={
  habilitado:true,ahora:()=>now,
  verificarSesion:async()=>{session++;return {
    usuarioId:'buyer_user',empresaId:'buyer_org',autenticada:true,
    rol:'buyer',identidadVerificada:true,anonima:false,
    venceMs:now+3600000,revocadaMs:null
  }},
  verificarVinculoPiloto:async id=>{linked++;assert.equal(id,round);return false},
  leerContexto:async()=>{lookup++;return null},
  leerArchivo:async()=>{storage++;return null}
 };
 const res=await procesarDescargaOriginalMvp190(req,round,doc,deps);
 assert.equal(res.status,404);
 assert.deepEqual({session,linked,lookup,storage},{session:1,linked:1,lookup:0,storage:0});
 assert.equal(res.headers.get('cache-control').includes('no-store'),true);
});
