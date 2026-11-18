import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {recuperarBuyerReviewD013,diagnosticarBuyerReviewD013,
 diagnosticoPlanD013} from
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
 candidate.ciphertext_b64=(candidate.ciphertext_b64.startsWith('A')?'B':'A')+
  candidate.ciphertext_b64.slice(1);
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
 assert.match(sql,/EXECUTE replace\(v_read,v_old,v_new\)/u);
 assert.doesNotMatch(sql,/cotironda_piloto_ia_publish_mvp222|cron\.schedule|whapi_outbox|http_post/iu);
});

test('D013: diagnóstico de credenciales inválidas se emite ANTES de gastar IA',async()=>{
 const source=await example(),seen=[],calls=[];
 const result=await recuperarBuyerReviewD013({
  ...config,apiKey:'',ejecutar:true,onDiagnostic:c=>seen.push(c),
  rpc:async name=>{calls.push(name);return {data:source,error:null}},
  planificar:async()=>{throw Error('no debe ejecutar OpenAI')}
 });
 assert.equal(result.estado,'needs_operator_review');
 assert.equal(result.outboundSent,false);
 assert.deepEqual(seen,['ai_credentials_invalid']);
 assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
});

test('D013: distingue rechazo IA, falta de catalogo y aclaracion sin PII',async()=>{
 const source=await example();
 const cases=[
  ['ai_credentials_rejected','ai_credentials_rejected'],
  ['citas_no_corresponden_al_original','ai_evidence_mismatch'],
  ['sin_catalogos_consentidos','catalog_no_suppliers'],
  ['catalogo_rpc_indisponible','catalog_rpc_error'],
  ['texto_privado_con_un_telefono_y_secretos','plan_other_rejected']
 ];
 for(const [motivo,want] of cases){
  const seen=[],calls=[];
  const response=await recuperarBuyerReviewD013({
   ...config,ejecutar:true,onDiagnostic:c=>seen.push(c),
   rpc:async name=>{calls.push(name);return {data:source,error:null}},
   planificar:async()=>({estado:'rechazado',motivo})
  });
  assert.equal(response.estado,'needs_operator_review');
  assert.deepEqual(seen,[want]);
  assert.ok(seen.every(c=>!c.includes('texto_privado')));
  assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
 }
 const seen=[];
 const response=await recuperarBuyerReviewD013({
  ...config,ejecutar:true,onDiagnostic:c=>seen.push(c),
  rpc:async()=>({data:source,error:null}),
  planificar:async()=>({estado:'requiere_aclaracion',motivo:'falta_localidad'})
 });
 assert.equal(response.estado,'needs_operator_review');
 assert.deepEqual(seen,['source_missing_city']);
});

test('D013: puente inválido informa presentación/unidades sin intentar SQL',async()=>{
 const source=await example();
 const cases=[
  ['presentacion_fuente_no_representable','bridge_source_invalid'],
  ['cantidad_unidad_no_representable_en_sql','bridge_units_invalid'],
  ['sin_destinos','bridge_destination_invalid'],
  ['otro motivo potencialmente sensible','bridge_other_rejected']
 ];
 for(const [motivo,want] of cases){
  const seen=[],calls=[];
  const response=await recuperarBuyerReviewD013({
   ...config,ejecutar:true,onDiagnostic:c=>seen.push(c),
   rpc:async name=>{calls.push(name);return {data:source,error:null}},
   preparar:()=>({estado:'plan_no_verificable',motivo,params:null})
  });
  assert.equal(response.estado,'needs_operator_review');
  assert.deepEqual(seen,[want]);
  assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
 }
});

test('D013: diferencia error RPC stage, rechazo SQL e inconsistencia sin publicar',async()=>{
 const source=await example();
 const cases=[
  [{data:null,error:{message:'secret_error'}},'stage_rpc_error'],
  [{data:{state:'not_eligible'},error:null},'stage_denied'],
  [{data:{state:'staged',request_id:'123e4567-e89b-42d3-a456-426614174000',
   items_staged:1,matches_staged:1,invitations_sent:0,outbox_sent:1},
   error:null},'stage_inconsistent']
 ];
 for(const [stage,want] of cases){
  const seen=[],calls=[];
  const response=await recuperarBuyerReviewD013({
   ...config,ejecutar:true,onDiagnostic:c=>seen.push(c),
   rpc:async name=>{calls.push(name);return name===
    'cotironda_piloto_v2_d013_review_source_private'
     ?{data:source,error:null}:stage}
  });
  assert.equal(response.estado,'needs_operator_review');
  assert.deepEqual(seen,[want]);
  assert.deepEqual(calls,[
   'cotironda_piloto_v2_d013_review_source_private',
   'cotironda_piloto_v2_d013_recovery_stage_private'
  ]);
 }
});

test('D013: telemetría defectuosa no cambia acciones, excepciones ocultas',async()=>{
 const source=await example();
 const result=await recuperarBuyerReviewD013({
  ...config,ejecutar:true,onDiagnostic:()=>{throw Error('confidencial')},
  rpc:async name=>({data:source,error:null}),
  planificar:async()=>{throw Error('contiene secreto del comprador')}
 });
 assert.equal(result.estado,'needs_operator_review');
 assert.equal(result.outboundSent,false);
 const worker=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-v2-review-recovery-d013/index.ts',
  import.meta.url),'utf8');
 assert.match(worker,/onDiagnostic:code=>console\.warn\('cotironda_d013_recovery_'\+code\)/u);
 assert.doesNotMatch(worker,/console\.warn\([^\n]*(?:raw\.|plaintext|contact|source_sha256|apiKey)/u);
});

test('D013: diagnóstico cubre rechazos de lectura histórica y central única',()=>{
 const mod=readFileSync(new URL(
  '../../src/domain/ia-central/contrato-v2-d013.ts',import.meta.url),'utf8');
 const reasons=[
  ...Array.from(mod.matchAll(/rejection\('([^']+)'\)/gu),x=>x[1]),
  ...Array.from(mod.matchAll(/motivo:'([^']+)'/gu),x=>x[1])
 ].filter(reason=>reason!=='ia_central_unica_con_fuente'&&
   reason!=='doble_lectura_con_fuente'&&
   reason!=='articulos_en_revision_sin_bloquear_ronda');
 // Éxito no es un error: nunca enviar código de fracaso por un pedido válido.
 assert.ok(reasons.length>=12,'controlar inventario de validaciones');
 for(const reason of reasons){
  assert.notEqual(diagnosticoPlanD013(reason),'plan_other_rejected',
    'un motivo legítimo quedó oculto: '+reason);
  assert.match(diagnosticoPlanD013(reason),/^(?:source_|ai_)/u);
 }
 assert.equal(diagnosticoPlanD013('motivo_usuario_inyectado_con_contactos'),
  'plan_other_rejected');
 assert.equal(diagnosticoPlanD013(null),'plan_other_rejected');
 assert.equal(diagnosticoPlanD013('__proto__'),'plan_other_rejected');
});

test('D013: zona y diferencias de lecturas distinguen fallos sin contactar proveedores',async()=>{
 const candidate=await example();
 for(const [motivo,want] of [
  ['zona_de_entrega_faltante','source_missing_city'],
  ['lecturas_incompletas_o_divergentes','source_readings_disagree'],
  ['posibles_articulos_no_representados','source_missing_items'],
  ['segundo_lector_identifica_articulo_sin_fuente','source_second_reader_unanchored'],
  ['ningun_articulo_conciliado','source_no_confirmed_item']
 ]){
  const seen=[],calls=[];
  const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
   onDiagnostic:v=>seen.push(v),
   rpc:async name=>{calls.push(name);return {data:candidate,error:null}},
   planificar:async()=>({estado:'requiere_aclaracion',motivo})
  });
  assert.equal(result.estado,'needs_operator_review');
  assert.equal(result.outboundSent,false);
  assert.deepEqual(seen,[want]);
  assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
 }
});

test('D013: primera lectura sin prueba y fuentes superpuestas se diferencian',async()=>{
 const candidate=await example();
 for(const [motivo,want] of [
  ['articulo_sin_evidencia_verificable','source_item_evidence_invalid'],
  ['evidencias_superpuestas','source_overlapping_evidence'],
  ['segunda_lectura_invalida','source_second_reader_invalid'],
  ['esquema_invalido','source_schema_invalid'],
  ['campos_inseguros','source_unsafe_fields'],
  ['sin_articulos','source_without_items'],
  ['intencion_no_comercial','source_not_a_quote']
 ]){
  const seen=[];
  const result=await recuperarBuyerReviewD013({...config,ejecutar:true,
   onDiagnostic:code=>seen.push(code),
   rpc:async()=>({data:candidate,error:null}),
   planificar:async()=>({estado:'rechazado',motivo})
  });
  assert.equal(result.estado,'needs_operator_review');
  assert.deepEqual(seen,[want]);
 }
});

test('D013: nunca se cambia la validación comercial ni el original por instrumentar errores',()=>{
 const source=readFileSync(new URL(
  '../../src/domain/ia-central/recuperacion-review-v2-d013.ts',
  import.meta.url),'utf8');
 assert.match(source,/source_item_evidence_invalid/u);
 assert.match(source,/source_no_confirmed_item/u);
 assert.match(source,/source_second_reader_invalid/u);
 assert.match(source,/plan_other_rejected/u);
 assert.match(source,/return review\('recovery_exception'\)/u);
 const worker=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-v2-review-recovery-d013/index.ts',
  import.meta.url),'utf8');
 assert.doesNotMatch(worker,/http_post|whapi_outbox|dispatchPending/u);
});


test('D013: diagnóstico AES genuino solo lee fuente, jamás stage ni catálogo',async()=>{
 const candidate=await example();
 const calls=[];let interpreted=0;
 const result=await diagnosticarBuyerReviewD013({
  ...config,rpc:async(name)=>{
   calls.push(name);
   assert.equal(name,'cotironda_piloto_v2_d013_review_source_private');
   return {data:candidate,error:null};
  },
  leer:async args=>{
   interpreted++;
   assert.equal(args.fuente,original);
   assert.equal(args.model,config.model);
   return {estado:'cantidad_inacreditable',detalle:null};
  }
 });
 assert.equal(result.estado,'diagnostico_seguro');
 assert.equal(result.outboundSent,false);
 assert.equal(result.diagnostico.estado,'cantidad_inacreditable');
 assert.equal(interpreted,1);
 assert.deepEqual(calls,['cotironda_piloto_v2_d013_review_source_private']);
});
test('D013: diagnóstico no consulta IA con fuente AES alterada',async()=>{
 const candidate=await example();
 candidate.source_sha256='f'.repeat(64);
 let reads=0;
 const result=await diagnosticarBuyerReviewD013({
  ...config,rpc:async name=>{
   assert.equal(name,'cotironda_piloto_v2_d013_review_source_private');
   return {data:candidate,error:null};
  },
  leer:async()=>{reads++;throw Error('forbidden')}
 });
 assert.equal(result.estado,'fuente_no_verificada');
 assert.equal(reads,0);
 assert.equal(result.outboundSent,false);
});
