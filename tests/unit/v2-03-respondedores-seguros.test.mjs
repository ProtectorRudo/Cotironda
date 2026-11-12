import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {proyectarRespuestasV2} from '../../src/server/v2-03-catalogo-respondedores.ts';
import {responderCotizacionesV2,respuestasV2Habilitadas}
 from '../../src/server/v2-03-respuestas-http.ts';

const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_03_catalogo_respondedores_privado.sql',
 import.meta.url),'utf8');
const goodId='11111111-1111-4111-8111-111111111111';
const sessionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ronda='aaaaaaaa-1111-4111-8111-111111111111';
const env={
 COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'true',
 COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'f'.repeat(40),
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'f'.repeat(40),
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:'https://ilggkalaafhtiysyzlmg.supabase.co',
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_fake_no_access',
 COTIRONDA_PILOT_SUPABASE_SECRET_KEY:'sb_secret_fake_no_access'
};
const row=(id,name,mime='application/pdf')=>({
 documentId:id,supplierName:name,mime,kind:'document',
 receivedAt:Date.now()-120000,sourceSha256:'a'.repeat(64),
 storage_path:'media/'+ 'b'.repeat(64),mensajeHmac:'c'.repeat(64)
});
const one=row('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','Corralón Oriental');
const two=row('bbbbbbbb-bbbb-4bbb-aaaa-bbbbbbbbbbbb','Pinturería Azul',
 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
const raw=(docs=[])=>({state:'authorized_responders_v2',buyerKey:'buyer_a',
 total:docs.length,originals:docs,invite_count:50,supplier_pending:'NO MOSTRAR',
 whapi_message_id:'secreto',storage_path:'media/secreto'});
const encode=(v)=>Buffer.from(JSON.stringify(v)).toString('base64url');
const validToken=()=>{
 const now=Math.floor(Date.now()/1000);
 return encode({alg:'HS256',typ:'JWT'})+'.'+encode({
  iss:'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
  role:'authenticated',aud:'authenticated',sub:goodId,session_id:sessionId,
  exp:now+3600
 })+'.'+'x'.repeat(64);
};
const req=(token)=>new Request('https://cotironda.example/api/piloto/v2/rondas/'+ronda+'/respuestas',{
 headers:{authorization:'Bearer '+token}
});

test('V2-03: 0, 1 y 2 respondedores; nunca invitados ni datos crudos',()=>{
 const none=proyectarRespuestasV2(raw([]));
 assert.equal(none?.mensaje,'Todavía no recibimos cotizaciones');
 assert.equal(none?.respuestas.length,0);
 const oneOnly=proyectarRespuestasV2(raw([one]));
 assert.equal(oneOnly?.respuestas.length,1);
 assert.equal(oneOnly?.respuestas[0].comercio,'Corralón Oriental');
 assert.equal(oneOnly?.respuestas[0].analisis,'Análisis en preparación');
 const both=proyectarRespuestasV2(raw([one,two]));
 assert.deepEqual(both?.respuestas.map(x=>x.formato),['PDF','Excel']);
 const text=JSON.stringify(both);
 for(const prohibited of ['buyerKey','supplier_pending','invite_count',
  'whapi_message_id','storage_path','sourceSha256','mensajeHmac',
  'precios','telefono','pending','secret']){
  assert.ok(!text.includes(prohibited),prohibited);
 }
});

test('V2-03: origen malformado, duplicado o con contacto es bloqueado',()=>{
 for(const item of [
  {...one,supplierName:'54911234567890'},
  {...one,supplierName:'mail@example.com'},
  {...one,documentId:'../archivo'},
  {...one,mime:'application/x-executable'},
  {...one,receivedAt:Date.now()+3600_000},
  {...one,kind:'audio'}
 ])assert.equal(proyectarRespuestasV2(raw([item])),null);
 assert.equal(proyectarRespuestasV2(raw([one,one])),null);
 assert.equal(proyectarRespuestasV2({...raw([one]),total:17}),null);
 assert.equal(proyectarRespuestasV2({...raw([one]),buyerKey:''}),null);
});

test('V2-03: env preview + SHA exacto; no publicación por defecto',()=>{
 assert.equal(respuestasV2Habilitadas(env),true);
 for(const change of [
  {COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false'},
  {COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'a'.repeat(40)},
  {VERCEL_ENV:'production'},
  {COTIRONDA_REGISTRATION_ENABLED:'true'},
  {COTIRONDA_PILOT_SUPABASE_SECRET_KEY:''},
  {COTIRONDA_PILOT_SUPABASE_URL:'https://otra.supabase.co'}
 ])assert.equal(respuestasV2Habilitadas({...env,...change}),false);
 assert.equal(respuestasV2Habilitadas({}),false);
});

test('V2-03: HTTP exige Auth real antes de consultar origen privado',async()=>{
 let calls=0;
 const ports={
  getUser:async token=>{
   calls++;return token===validTokenCached
    ?{id:goodId,phone:'5491123456789',
      phone_confirmed_at:'2026-11-10T00:00:00Z',is_anonymous:false}
    :null;
  },
  consultarPrivado:async q=>{
   calls++;
   assert.deepEqual(q,{rondaId:ronda,usuarioId:goodId,sessionId});
   return raw([one,two]);
  }
 };
 const validTokenCached=validToken();
 const response=await responderCotizacionesV2(req(validTokenCached),ronda,ports,env);
 assert.equal(response.status,200);
 const json=await response.json();
 assert.equal(json.respuestas.length,2);
 assert.equal(json.respuestas[0].comercio,'Corralón Oriental');
 assert.equal(response.headers.get('cache-control')?.includes('no-store'),true);
 assert.equal(calls,2);
 calls=0;
 assert.equal((await responderCotizacionesV2(req(validTokenCached),ronda,
  ports,{...env,COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'false'})).status,503);
 assert.equal(calls,0);
 const missing=await responderCotizacionesV2(new Request('https://cotironda.example'),
  ronda,ports,env);
 assert.equal(missing.status,401);
 assert.equal(calls,0);
 const invalid=await responderCotizacionesV2(req('x.y.z'),ronda,ports,env);
 assert.equal(invalid.status,401);
 assert.equal(calls,0);
});

test('V2-03: SQL evita cierre economico, exige evidencia y permiso V2',()=>{
 for(const expected of [
  "policy.enabled=true",
  "r.state IN ('prepared','closed')",
  "u.is_anonymous=false",
  "s.id=p_auth_session_id AND s.user_id=u.id",
  "link.association IN ('quoted_whapi_id','single_active_round')",
  "link.status='awaiting_semantic_review'",
  "a.content_sha256=link.source_sha256",
  "a.state='stored'",
  "source.request_id=link.request_id",
  "c.version='cotironda-originales-v2'",
  "c.accepted_at<=inv.created_at",
  "c.revoked_at IS NULL",
  "dispatch.state='api_accepted'",
  "link.kind IN ('document','image')",
  "TO service_role;"
 ])assert.ok(sql.includes(expected),expected);
 assert.doesNotMatch(sql,/supplier_evidence_mvp138/u);
 assert.doesNotMatch(sql,/r\.state='closed'/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC,anon,authenticated,service_role/u);
 assert.match(sql,/v2_original_share_policy[\s\S]*enabled boolean NOT NULL DEFAULT false/u);
});
