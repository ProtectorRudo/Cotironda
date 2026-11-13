import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {descifrarTextoWhatsAppV2}
 from '../../src/server/v2-14-texto-whatsapp-cifrado.ts';
import {descargarOriginalV2}
 from '../../src/server/v2-03b-descarga-originales.ts';
import {proyectarRespuestasV2}
 from '../../src/server/v2-03-catalogo-respondedores.ts';
import {analizarOriginalPorPedidoV2}
 from '../../src/server/v2-04b-analisis-automatica-http.ts';

const requestId='aaaaaaaa-1111-4111-8111-111111111111';
const doc='bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
const user='11111111-1111-4111-8111-111111111111';
const session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const messageHmac='c'.repeat(64);
const chatHmac='d'.repeat(64);
const secret='41'.repeat(32);
const original='Cotización de materiales: 10 bolsas cemento a $8.200 c/u. Entrega a coordinar. IVA no informado.\nGracias.';
const textBytes=Buffer.from(original,'utf8');
const sha=createHash('sha256').update(textBytes).digest('hex');
const iv=Buffer.alloc(12,21);
const cipher=createCipheriv('aes-256-gcm',Buffer.from(secret,'hex'),iv);
cipher.setAAD(Buffer.from(chatHmac+'|'+messageHmac+'|text','utf8'));
const ct=Buffer.concat([cipher.update(textBytes),cipher.final(),cipher.getAuthTag()]);
const source={
 state:'authorized_text_v2',requestId,documentId:doc,buyerKey:'buyer_a',
 supplierKey:'supplier_a',messageHmac,chatHmac,
 nonceB64:iv.toString('base64'),ciphertextB64:ct.toString('base64'),
 mime:'text/plain',sha256:sha,
 consentAt:Date.now()-7200000,invitedAt:Date.now()-3600000
};
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const jwt=enc({alg:'HS256',typ:'JWT'})+'.'+enc({
 iss:'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1',
 role:'authenticated',aud:'authenticated',sub:user,session_id:session,
 exp:Math.floor(Date.now()/1000)+3600
})+'.'+'x'.repeat(64);
const env={
 COTIRONDA_PILOT_V2_RESPONDERS_ENABLED:'true',
 COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'true',
 COTIRONDA_PILOT_V2_RESPONDERS_RELEASE_SHA:'f'.repeat(40),
 VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_SHA:'f'.repeat(40),
 COTIRONDA_REGISTRATION_ENABLED:'false',
 COTIRONDA_PILOT_SUPABASE_URL:'https://ilggkalaafhtiysyzlmg.supabase.co',
 COTIRONDA_PILOT_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',
 COTIRONDA_PILOT_SUPABASE_SECRET_KEY:'sb_secret_synthetic'
};
const getUser=async()=>({
 id:user,phone:'5491123456789',
 phone_confirmed_at:'2026-11-11T12:00:00Z',is_anonymous:false
});
const downloadReq=()=>new Request(
 'https://cotironda.invalid/api/piloto/v2/rondas/'+requestId+'/originales/'+doc,
 {headers:{Authorization:'Bearer '+jwt}}
);

test('V2-14: cifrado AES-GCM original se recupera byte a byte, sin ajustar IVA/moneda',()=>{
 const out=descifrarTextoWhatsAppV2(source,secret);
 assert.ok(out instanceof Uint8Array);
 assert.deepEqual(Buffer.from(out),textBytes);
 assert.equal(Buffer.from(out).toString('utf8'),original);
});

test('V2-14: SHA/AAD/key/tag/ciphertext/fuente inválida fallan cerrados',()=>{
 const mutate=(x)=>descifrarTextoWhatsAppV2({...source,...x},secret);
 assert.equal(mutate({sha256:'0'.repeat(64)}),null);
 assert.equal(mutate({chatHmac:'0'.repeat(64)}),null);
 assert.equal(mutate({messageHmac:'0'.repeat(64)}),null);
 assert.equal(mutate({state:'untrusted'}),null);
 assert.equal(mutate({mime:'text/html'}),null);
 assert.equal(mutate({nonceB64:Buffer.alloc(12,1).toString('base64')}),null);
 const badCt=Buffer.from(ct);badCt[3]^=1;
 assert.equal(mutate({ciphertextB64:badCt.toString('base64')}),null);
 assert.equal(descifrarTextoWhatsAppV2(source,'0'.repeat(64)),null);
 assert.equal(descifrarTextoWhatsAppV2(source,'f'.repeat(64)),null);
 assert.equal(descifrarTextoWhatsAppV2(source,undefined),null);
});

test('V2-14: proyección buyer muestra exclusivamente respuesta textual autorizada',()=>{
 const payload={state:'authorized_responders_v2',buyerKey:'buyer_a',
  total:1,originals:[{
   documentId:doc,supplierName:'Corralón Sur',
   mime:'text/plain',kind:'text',receivedAt:Date.now()-60_000
  }]};
 const result=proyectarRespuestasV2(payload);
 assert.equal(result?.respuestas[0]?.formato,'WhatsApp (texto)');
 assert.equal(result?.respuestas[0]?.documentoId,doc);
 assert.equal(proyectarRespuestasV2({...payload,
  originals:[{...payload.originals[0],mime:'application/pdf'}]}),null);
 assert.equal(JSON.stringify(result).includes('ciphertext'),false);
});

test('V2-14: descarga .txt exacta con doble Auth y auditoría antes de bytes',async()=>{
 let sources=0,audits=0,readStorage=0;
 const ports={
  getUser,source:async()=>{sources++;return source},
  read:async()=>{readStorage++;return null},
  readText:async s=>descifrarTextoWhatsAppV2(s,secret),
  audit:async()=>{throw Error('wrong_audit')},
  auditText:async q=>{
   audits++;
   assert.equal(q.sha256,sha);
   assert.equal(q.byteCount,textBytes.length);
   return true;
  }
 };
 const res=await descargarOriginalV2(downloadReq(),requestId,doc,ports,env);
 assert.equal(res.status,200);
 assert.equal(res.headers.get('content-type'),'text/plain');
 assert.match(res.headers.get('content-disposition'),/\.txt"/u);
 assert.deepEqual(Buffer.from(await res.arrayBuffer()),textBytes);
 assert.equal(audits,1);
 assert.equal(readStorage,0);
 assert.equal(sources,2);
 assert.match(res.headers.get('cache-control'),/no-store/u);
});

test('V2-14: revocación entre lecturas o auditoría fallida impide la descarga',async()=>{
 let calls=0,audits=0;
 const ports={getUser,
  source:async()=>{calls++;return calls===1?source:null},
  read:async()=>null,
  readText:async s=>descifrarTextoWhatsAppV2(s,secret),
  audit:async()=>false,
  auditText:async()=>{audits++;return true}
 };
 const res=await descargarOriginalV2(downloadReq(),requestId,doc,ports,env);
 assert.equal(res.status,404);assert.equal(audits,0);
 const noAudit=await descargarOriginalV2(downloadReq(),requestId,doc,{
  ...ports,source:async()=>source,auditText:async()=>false
 },env);
 assert.equal(noAudit.status,503);
 const noKey=await descargarOriginalV2(downloadReq(),requestId,doc,{
  ...ports,source:async()=>source,readText:async()=>null
 },env);
 assert.equal(noKey.status,404);
});

test('V2-14: guía individual del texto sólo desde fuente autenticada y SHA',async()=>{
 let claimed=0,finished=0,analyzed=0;
 const ports={
  getUser,source:async()=>source,
  claim:async()=>{claimed++;return {
   state:'analysis_claimed_v2',
   jobToken:'99999999-9999-4999-8999-999999999999',
   sourceSha256:sha
  }},
  read:async()=>null,
  readText:async s=>descifrarTextoWhatsAppV2(s,secret),
  analyze:async args=>{
   analyzed++;assert.equal(args.fuente.fuente,original);
   assert.equal(args.fuente.sha256,sha);
   return {estado:'analisis_disponible',puntos:[
    {categoria:'material',evidencia:'10 bolsas cemento',
     observacion:'Cotizó diez bolsas de cemento, sin especificar la marca.'},
    {categoria:'iva',evidencia:'IVA no informado',
     observacion:'El original no especifica si los importes incluyen IVA.'}
   ]}
  },
  finish:async q=>{finished++;
   assert.equal(q.status,'ready');assert.equal(q.sourceSha256,sha);
   return true;
  }
 };
 const req=new Request(
  'https://cotironda.invalid/api/piloto/v2/rondas/'+requestId+
  '/originales/'+doc+'/analizar',{
   method:'POST',headers:{Authorization:'Bearer '+jwt}
  });
 const res=await analizarOriginalPorPedidoV2(req,requestId,doc,ports,env);
 assert.equal(res.status,200);
 assert.equal(claimed,1);assert.equal(analyzed,1);assert.equal(finished,1);
 const disabled=await analizarOriginalPorPedidoV2(req,requestId,doc,ports,{
  ...env,COTIRONDA_PILOT_V2_ANALYSIS_ENABLED:'false'
 });
 assert.equal(disabled.status,503);assert.equal(claimed,1);
});

test('V2-14: SQL conserva privados, correlación fuerte y no comparte cifrado en catálogo',()=>{
 const catalog=readFileSync(new URL(
  '../../supabase/piloto/v2_03_catalogo_respondedores_privado.sql',import.meta.url),'utf8');
 const sourceSql=readFileSync(new URL(
  '../../supabase/piloto/v2_03b_fuente_original_auditoria_privada.sql',import.meta.url),'utf8');
 const analysisSql=readFileSync(new URL(
  '../../supabase/piloto/v2_04b_analisis_original_idempotente_privado.sql',import.meta.url),'utf8');
 for(const s of [
  "decision.state='linked'","decision.selected_request_id=link.request_id",
  "decision.source_sha256=link.source_sha256",
  "source.plaintext_sha256=link.source_sha256",
  "source.nonce_b64","source.processing_state='needs_review'",
  "c.revoked_at IS NULL","policy.enabled=true"
 ])assert.ok(catalog.includes(s),s);
 for(const s of [
  "'authorized_text_v2'","m.plaintext_sha256=link.source_sha256",
  "'nonceB64',v_source.nonce_b64",
  "'ciphertextB64',v_source.ciphertext_b64",
  "v2_record_text_download","v2_original_download_audit",
  "TO service_role;"
 ])assert.ok(sourceSql.includes(s),s);
 assert.match(analysisSql,/authorized_original_v2','authorized_text_v2/u);
 assert.doesNotMatch(catalog,/ciphertextB64|nonceB64/u);
});
