import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildReviewNoticeSql} from '../../scripts/piloto/mvp286-review-notice-builder.mjs';
import {AVISO_LECTURA_NO_VALIDADA_MVP286,avisarRevisionSemanticaMvp286}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-review-notice-mvp286.ts';
import {codigoRevisionSemanticaMvp286}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-mvp226.ts';
import {interpretarConIaCentralV1}
 from '../../src/domain/ia-central/cliente-openai-v1.ts';
const h='a'.repeat(64),m='b'.repeat(64);
const dest='5492215000000@s.whatsapp.net';
const args={habilitado:true,compradorAutenticado:true,chatHmac:h,
 messageHmac:m,destinatario:dest};
test('MVP286 notifica una sola vez, sin fabricar una ronda ni identificador',async()=>{
 let state='fresh',sent=0,finishes=[];
 const rpc=async(name,p)=>{
  if(name.includes('reserve_review_notice')){
   const s=state==='fresh'?'leased':'already_reserved';state='reserved';
   return {data:{state:s},error:null};
  }
  if(name.includes('finish_review_notice')){
   finishes.push(p);return {data:true,error:null};
  }
  throw Error('unexpected rpc');
 };
 const send=async(recipient,body)=>{
  sent++;assert.equal(recipient,dest);
  assert.equal(body,AVISO_LECTURA_NO_VALIDADA_MVP286);
  assert.match(body,/No envié nada a los proveedores/u);
  return {accepted:true,messageId:'whapi-mvp286-001'};
 };
 const first=await avisarRevisionSemanticaMvp286({...args,rpc,send});
 assert.equal(first.estado,'api_aceptada');
 assert.equal(first.whatsappIdVerificado,true);
 const second=await avisarRevisionSemanticaMvp286({...args,rpc,send});
 assert.equal(second.estado,'no_elegible');
 assert.equal(sent,1);
 assert.equal(finishes.length,1);
 assert.equal(finishes[0].p_state,'api_accepted');
 assert.equal(finishes[0].p_whapi_message_id,'whapi-mvp286-001');
});
test('MVP286 respuesta 2xx sin ID queda incierta, no reenvío automático',async()=>{
 let sends=0;
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  return name.includes('reserve_review_notice')
   ?{data:{state:'leased'},error:null}:{data:true,error:null};
 };
 const x=await avisarRevisionSemanticaMvp286({...args,rpc,
  send:async()=>{sends++;return {accepted:true,messageId:null};}
 });
 assert.equal(x.estado,'incierto');
 assert.equal(x.whatsappIdVerificado,false);
 assert.equal(sends,1);
 assert.equal(calls.at(-1).p.p_state,'uncertain');
 assert.equal(calls.at(-1).p.p_whapi_message_id,null);
});
test('MVP286 si no hay permiso o identidad no llama Whapi ni SQL',async()=>{
 let hits=0;
 const x=await avisarRevisionSemanticaMvp286({
  ...args,compradorAutenticado:false,
  rpc:async()=>{hits++;throw Error('unexpected')},
  send:async()=>{hits++;throw Error('unexpected')}
 });
 assert.equal(x.estado,'no_autorizado');
 assert.equal(hits,0);
});
test('MVP286 categorización segura de fallas por HTTP, sin prompt ni key',async()=>{
 const input='Hola, necesito cotizar 20 bolsas de cemento. Entrega en La Plata.';
 for(const [status,category] of [
  [401,'ai_credentials_rejected'],[429,'ai_rate_limited'],
  [400,'ai_request_rejected'],[503,'ai_upstream_failure']
 ]){
  let n=0;
  const r=await interpretarConIaCentralV1({
   fuente:input,apiKey:'sk-'+'x'.repeat(22),model:'gpt-6-luna',
   fetchImpl:async()=>{n++;return new Response('',{status});}
  });
  assert.equal(r.estado,'rechazado');
  assert.equal(r.motivo,category);
  assert.equal(n,1);
  assert.equal(codigoRevisionSemanticaMvp286(r.motivo),category);
 }
 assert.equal(codigoRevisionSemanticaMvp286('raw_customer_text'),'semantic_review_required');
 assert.equal(codigoRevisionSemanticaMvp286('ai_rate_limited'),'ai_rate_limited');
});
test('MVP286 contratos SQL se insertan antes del único ROLLBACK',()=>{
 const sql=buildReviewNoticeSql();
 const at=sql.indexOf('\\ir ../../piloto/mvp286_notificacion_revision_semantica_sin_reenvio.sql');
 const testAt=sql.indexOf('\\ir ./mvp286-review-notice-pg17.sql');
 const end=sql.indexOf('\nROLLBACK;\nSELECT');
 assert.ok(at>0&&testAt>at&&end>testAt);
 assert.equal(sql.split(/^ROLLBACK;\s*$/gm).length,2);
 const original=readFileSync(new URL(
  '../../supabase/piloto/mvp286_notificacion_revision_semantica_sin_reenvio.sql',import.meta.url),'utf8');
 assert.match(original,/m.received_at>clock_timestamp\(\)-interval '10 minutes'/u);
 assert.match(original,/a.state='review'/u);
 assert.match(original,/IF n>=2 THEN RETURN jsonb_build_object\('state','quota_exceeded'\)/u);
 assert.match(original,/TO service_role/u);
 assert.doesNotMatch(original,/^\s*COMMIT\b/mi);
});
