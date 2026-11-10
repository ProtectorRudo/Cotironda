import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ejecutarSolicitudSombraV2B3} from
 '../../supabase/functions/cotironda-piloto-v2-shadow/handler.ts';
import {procesarSombraArchivadaV2} from
 '../../src/domain/presupuestos-v2/worker-archivo-sombra.ts';
import {leerPresupuestoSombraV2} from
 '../../src/domain/presupuestos-v2/lector-sombra.ts';

const root='https://ilggkalaafhtiysyzlmg.supabase.co';
const secret='r'.repeat(64);
const role=['e'.repeat(24),'y'.repeat(24),'z'.repeat(24)].join('.');
const openaiKey='sk-'+'x'.repeat(40);
const source='a'.repeat(64);
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const sha=createHash('sha256').update(bytes).digest('hex');
const auth={
 'Authorization':'Bearer '+role,
 'x-cotironda-recovery-secret':secret
};
const env={
 COTIRONDA_PILOT_V2_SHADOW_ENABLED:'true',
 COTIRONDA_PILOT_AUTO_RECOVERY_SECRET:secret,
 COTIRONDA_PILOT_OPENAI_API_KEY:openaiKey,
 COTIRONDA_PILOT_AI_CENTRAL_MODEL:'gpt-6.1-sol',
 SUPABASE_URL:root,SUPABASE_SERVICE_ROLE_KEY:role,
 SUPABASE_SECRET_KEYS:'{}'
};
const candidate={
 document_kind:'supplier_quote',
 lines:[
  {ordinal:1,kind:'material',original_line_raw:'20 bolsas cemento CPC 50 kg $100',
   original_description_raw:'Cemento CPC 50 kg',
   quantity_raw:'20',unit_raw:'bolsas',
   unit_price_raw:'$ 100',unit_price_role:'list_explicit',
   line_total_raw:'$ 2.000',source_location_raw:'página 1 fila 3'},
  {ordinal:2,kind:'material',original_line_raw:'3 bolsones arena precio ilegible',
   original_description_raw:'Arena',quantity_raw:'3',unit_raw:'bolsones',
   unit_price_raw:null,unit_price_role:'absent',
   line_total_raw:null,source_location_raw:'página 1 fila 4'}
 ],
 total_declared_raw:null,currency_declared_raw:null,
 commercial_conditions_raw:['Flete a convenir']
};
const answer={
 status:'completed',output:[{type:'message',role:'assistant',content:[{
  type:'output_text',text:JSON.stringify({
   quote:candidate,more_content_unread:false,unread_reason:'none'
  })
 }]}]
};
function scenario({
 sqlState='claimed',altered=false,upstreamStatus=200
}={}){
 const calls=[];
 const record={candidate:null,reason:null,diagnostics:null};
 const rpc=async(name,params={})=>{
  calls.push(name);
  if(name==='cotironda_piloto_claim_v2_shadow_b2')
   return {data:sqlState==='claimed'?{
    state:'claimed',source_hmac:source,source_sha256:sha,
    mime:'application/pdf',size_bytes:bytes.length,
    processor_version:'v2_b2_20261110'
   }:{state:sqlState},error:null};
  if(name==='cotironda_piloto_finish_v2_shadow_b2'){
   record.candidate=params.p_candidate;
   record.reason=params.p_reason_code;
   record.diagnostics=params.p_line_diagnostics;
   return {data:{state:'recorded'},error:null};
  }
  throw Error('Unexpected SQL RPC '+name);
 };
 const storage={from:bucket=>{
  assert.equal(bucket,'cotironda-piloto-originals');
  return {download:async path=>{
   calls.push('storage_download');
   assert.equal(path,'media/'+source);
   const copy=Uint8Array.from(bytes);
   if(altered)copy[copy.length-1]^=1;
   return {data:new Blob([copy]),error:null};
  }};
 }};
 const deps={
  createDb:(url,key)=>{
   assert.equal(url,root);
   assert.equal(key,role);
   calls.push('client_created');
   return {rpc,storage};
  },
  run:async args=>procesarSombraArchivadaV2({
   ...args,
   read:async params=>leerPresupuestoSombraV2({
    ...params,
    fetchImpl:async(url,init)=>{
     calls.push('mock_model_request');
     assert.equal(url,'https://api.openai.com/v1/responses');
     const payload=JSON.parse(init.body);
     assert.equal(payload.store,false);
     assert.deepEqual(payload.tools,[]);
     assert.equal(payload.input[1].content[0].filename,
      'cotironda-source.pdf');
     return upstreamStatus===200
      ?new Response(JSON.stringify(answer),{status:200})
      :new Response('blocked',{status:upstreamStatus});
    }
   })
  })
 };
 return {record,calls,deps};
}
const request=()=>new Request(root+'/functions/v1/cotironda-piloto-v2-shadow',{
 method:'POST',headers:auth
});
test('B3 E2E sintético: POST -> doble factor -> SQL -> Storage SHA -> AI -> ledger PRIVADO',async()=>{
 const state=scenario();
 const res=await ejecutarSolicitudSombraV2B3(request(),env,state.deps);
 assert.equal(res.status,200);
 assert.deepEqual(await res.json(),{state:'candidate_private'});
 assert.deepEqual(state.calls,[
  'client_created','cotironda_piloto_claim_v2_shadow_b2',
  'storage_download','mock_model_request','cotironda_piloto_finish_v2_shadow_b2'
 ]);
 assert.deepEqual(state.record.candidate,candidate);
 assert.equal(state.record.candidate.lines.length,2);
 assert.equal(state.record.reason,'shadow_candidate_unverified');
 assert.equal(state.record.diagnostics[0].state,'extracted_pending_source_check');
 assert.equal(state.record.diagnostics[1].reason,'commercial_amount_missing');
 assert.ok(!state.calls.some(x=>/publish|whapi|ranking|reveal/i.test(x)));
});
test('B3 E2E sintético: SHA cambiado bloquea modelo y conserva revisión',async()=>{
 const state=scenario({altered:true});
 const res=await ejecutarSolicitudSombraV2B3(request(),env,state.deps);
 assert.deepEqual(await res.json(),{state:'review_required'});
 assert.equal(state.record.candidate,null);
 assert.equal(state.record.reason,'shadow_sha_mismatch');
 assert.ok(!state.calls.includes('mock_model_request'));
});
test('B3 E2E sintético: SQL flag deshabilitado impide descargar original',async()=>{
 const state=scenario({sqlState:'disabled'});
 const res=await ejecutarSolicitudSombraV2B3(request(),env,state.deps);
 assert.deepEqual(await res.json(),{state:'shadow_disabled'});
 assert.deepEqual(state.calls,[
  'client_created','cotironda_piloto_claim_v2_shadow_b2'
 ]);
});
test('B3 E2E sintético: archivo ya consumido no se vuelve a descargar',async()=>{
 const state=scenario({sqlState:'empty'});
 const res=await ejecutarSolicitudSombraV2B3(request(),env,state.deps);
 assert.deepEqual(await res.json(),{state:'queue_empty'});
 assert.ok(!state.calls.includes('storage_download'));
 assert.ok(!state.calls.includes('mock_model_request'));
});
test('B3 E2E sintético: error de API NO crea candidata ni alerta a proveedor',async()=>{
 const state=scenario({upstreamStatus:429});
 const res=await ejecutarSolicitudSombraV2B3(request(),env,state.deps);
 assert.deepEqual(await res.json(),{state:'review_required'});
 assert.equal(state.record.candidate,null);
 assert.equal(state.record.reason,'shadow_reader_review_required');
 assert.ok(!state.calls.some(x=>/whapi|publish/i.test(x)));
});
