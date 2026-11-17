import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recuperarBuyerReviewD013} from
 '../../src/domain/ia-central/recuperacion-review-v2-d013.ts';
import {localidadOperativaD013} from
 '../../src/domain/ia-central/puente-sql-rondas-v2-d013.ts';

const chat='a'.repeat(64),message='b'.repeat(64),aes='c'.repeat(64);
const original='Necesito 10 bolsas de cemento CPC de 50 kg y arena fina. Entrega: La Plata, Buenos Aires.';
async function example(){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await crypto.subtle.importKey('raw',
  Uint8Array.from(aes.match(/.{2}/gu),s=>parseInt(s,16)),
  'AES-GCM',false,['encrypt']);
 const aad=new TextEncoder().encode(chat+'|'+message+'|text');
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},
  key,new TextEncoder().encode(original));
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(original))),
  x=>x.toString(16).padStart(2,'0')).join('');
 return {state:'ready',message_hmac:message,chat_hmac:chat,
  source_sha256:sha,nonce_b64:Buffer.from(iv).toString('base64'),
  ciphertext_b64:Buffer.from(cipher).toString('base64')};
}
const item={descripcion:'cemento CPC 50 kg',cantidad:'10',unidad:'bag',
 evidencia:'cemento CPC de 50 kg',rubro:'obra_gruesa'};
const matches=[{proveedor:'corralon_ailin',
 correspondencias:[{indicePedido:0,numeroCatalogo:1,
  descripcionCatalogo:'Cemento CPC 50kg',rubroCatalogo:'obra_gruesa',
  tipo:'producto_declarado',explicacion:'Cemento técnicamente compatible'}]}];
const mockPlan=async()=>({
 estado:'plan_validado_sin_envio',motivo:'validado',
 pedido:{zona_entrega:'La Plata, Buenos Aires',articulos:[]},
 ruteo:{estado:'ruteo_valido_para_preparacion'},catalogos:[],
 whatsappEnviado:false,baseModificada:false
});
const mockPrepare=()=>({estado:'plan_sql_listo',params:{
 p_buyer_chat_hmac:chat,p_message_hmac:message,
 p_original_text:original,p_city:'La Plata',
 p_items:[item],p_destinos:matches
}});
const config={habilitado:true,aesKeyHex:aes,apiKey:'sk-test-XXXXXXXXXXXXXXXXXXXX',
 model:'gpt-6-luna',planificar:mockPlan,preparar:mockPrepare};
test('D013: localidad SQL canónica conserva texto fuente y NO iguala ciudades vecinas',()=>{
 for(const city of [
  'La Plata','La Plata, Buenos Aires',
  'La Plata, Buenos Aires, Argentina',
  'La Plata, Provincia de Buenos Aires',
  'La Plata, Provincia de Buenos Aires, Argentina'
 ])assert.equal(localidadOperativaD013(city),'La Plata');
 for(const city of ['La Plata, Córdoba','Berisso','Ensenada',
   'La Plata, Córdoba, Argentina'])
  assert.equal(localidadOperativaD013(city),city);
});
test('D013: preflight lee origen auténtico, verifica AES/SHA y NO ejecuta IA ni staging',async()=>{
 const candidate=await example();
 const calls=[];
 const result=await recuperarBuyerReviewD013({...config,ejecutar:false,
  rpc:async(name)=>{calls.push(name);return {data:candidate,error:null}},
  planificar:async()=>{throw Error('must not call AI')}
 });
 assert.equal(result.estado,'source_verified');
 assert.equal(result.outboundSent,false);
 assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
});
test('D013: source SHA incorrecta falla cerrado sin plan ni SQL de ronda',async()=>{
 const candidate=await example();candidate.source_sha256='0'.repeat(64);
 const calls=[];
 const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
  rpc:async(name)=>{calls.push(name);return {data:candidate,error:null}},
  planificar:async()=>{throw Error('must not call')}
 });
 assert.equal(result.estado,'needs_operator_review');
 assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
});
test('D013: origen cifrado manipulado no se reinyecta',async()=>{
 const candidate=await example();
 candidate.ciphertext_b64=candidate.ciphertext_b64.replace(/^./u,'A');
 let calls=0;
 const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
  rpc:async()=>{calls++;return {data:candidate,error:null}}});
 assert.equal(result.estado,'needs_operator_review');
 assert.equal(calls,1);
});
test('D013: origen ambiguo o agotado no dispara IA',async()=>{
 for(const state of ['empty','ambiguous']){
  let calls=0;
  const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
   rpc:async()=>{calls++;return {data:{state},error:null}}});
  assert.equal(result.estado,state==='empty'?'no_candidate':'needs_operator_review');
  assert.equal(calls,1);
 }
});
test('D013: staging exitoso es solo borrador, sin invitaciones ni mensajes',async()=>{
 const candidate=await example();const calls=[];
 const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name==='cotironda_piloto_v2_d013_review_source_private')
    return {data:candidate,error:null};
   if(name==='cotironda_piloto_v2_d013_recovery_stage_private'){
    assert.equal(params.p_chat_hmac,chat);
    assert.equal(Object.hasOwn(params,'p_buyer_chat_hmac'),false,
     'PostgREST wrapper never accepts legacy parameter name');
    assert.deepEqual(Object.keys(params).sort(),[
     'p_chat_hmac','p_message_hmac','p_source_sha256','p_original_text',
     'p_city','p_items','p_destinos'].sort());
    assert.equal(params.p_message_hmac,message);
    assert.equal(params.p_original_text,original);
    assert.equal(params.p_city,'La Plata');
    assert.equal(params.p_source_sha256,candidate.source_sha256);
    return {data:{state:'staged',
     request_id:'123e4567-e89b-42d3-a456-426614174000',
     items_staged:1,matches_staged:1,
     invitations_sent:0,outbox_sent:0},error:null};
   }
   throw Error('unexpected rpc');
  }
 });
 assert.equal(result.estado,'staged_no_send');
 assert.equal(result.outboundSent,false);
 assert.equal(calls.length,2);
});
test('D013: rechaza resultados parciales o con envíos declarados',async()=>{
 const candidate=await example();
 for(const mismatch of [{items_staged:0},{matches_staged:0},
  {invitations_sent:1},{outbox_sent:1},{state:'already_staged'}]){
  const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
   rpc:async(name)=>({data:name==='cotironda_piloto_v2_d013_review_source_private'
    ?candidate:{state:'staged',
     request_id:'123e4567-e89b-42d3-a456-426614174000',
     items_staged:1,matches_staged:1,invitations_sent:0,outbox_sent:0,
     ...mismatch},error:null})
  });
  assert.equal(result.estado,'needs_operator_review');
 }
});
test('D013: SQL candidato deniega público, preserva review y no publica',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_d013_recover_reviewed_buyer_once_CANDIDATE.sql',
  import.meta.url),'utf8');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
 assert.match(sql,/REVOKE ALL ON FUNCTION/u);
 assert.match(sql,/TO service_role;/u);
 assert.match(sql,/a\.state='review'/u);
 assert.match(sql,/a\.failure_code='ia_error_de_lectura'/u);
 assert.match(sql,/FOR UPDATE OF m/u);
 assert.match(sql,/cotironda_piloto_v2_shadow_prepare_d013/u);
 assert.doesNotMatch(sql,/UPDATE\s+cotironda_piloto_privado\.ai_central_attempts_mvp226/iu);
 assert.doesNotMatch(sql,/cotironda_piloto_v2_auto_release_d013\s*\(/iu);
 assert.doesNotMatch(sql,/cotironda_piloto_ia_publish_mvp222\s*\(/iu);
});

test('D013: SQL candidato recupera desacuerdo semántico sin tocar WhatsApp',()=>{
 const sql=readFileSync(new URL(
  '../../supabase/piloto/v2_d013_recover_semantic_discrepancy_CANDIDATE.sql',
  import.meta.url),'utf8');
 assert.match(sql,/lecturas_discrepan_en_articulo/u);
 assert.match(sql,/ia_error_de_lectura/u);
 assert.match(sql,/v_source\.failure_code/u);
 assert.match(sql,/cotironda_d016_pilot_project_ref/u);
 assert.match(sql,/v2_d013_review_recovery_receipts/u);
 assert.match(sql,/FOR UPDATE OF m/u);
 assert.doesNotMatch(sql,/cotironda_piloto_ia_publish_mvp222|cron\.schedule|whapi_outbox|http_post/iu);
});
