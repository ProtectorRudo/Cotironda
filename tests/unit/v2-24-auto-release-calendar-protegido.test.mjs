import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {liberarPedidoAutomaticoV2D013}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-auto-release-v2-d013.ts';
import {generarCandidatoV202DesdeLive76}
 from '../../scripts/piloto/v2-live76-candidate.mjs';

const H='a'.repeat(64),S='b'.repeat(64);
const ID='47c23e65-8985-48c4-85ca-e4a972938afb';
const file=p=>readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const base=()=>{
 const calls=[];
 return {calls,args:{
  enabled:true,webhookAutenticado:true,compradorVerificado:true,
  chatHmac:H,sourceHmac:S,
  rpc:async(name,params)=>{
   calls.push({name,params});
   assert.equal(name,'cotironda_piloto_v2_auto_release_d013');
   return {data:{state:'ready_for_delivery',request_id:ID},error:null};
  }
 }};
};
test('V2-24: acceso OFF no llama SQL ni prepara envíos',async()=>{
 const m=base();m.args.enabled=false;
 assert.deepEqual(await liberarPedidoAutomaticoV2D013(m.args),
  {estado:'apagado',requestId:null});
 assert.equal(m.calls.length,0);
});
test('V2-24: solo mensajes autenticos de comprador con HMAC válido',async()=>{
 for(const patch of [{webhookAutenticado:false},{compradorVerificado:false},
  {chatHmac:'incorrecto'},{sourceHmac:'incorrecto'},{rpc:null}]){
  const m=base();
  assert.deepEqual(await liberarPedidoAutomaticoV2D013({...m.args,...patch}),
   {estado:'no_autorizado',requestId:null});
  assert.equal(m.calls.length,0);
 }
});
test('V2-24: UNA RPC privada hace aprobación y publicación, no llama legacy directamente',async()=>{
 const m=base();
 assert.deepEqual(await liberarPedidoAutomaticoV2D013(m.args),
  {estado:'publicado',requestId:ID});
 assert.deepEqual(m.calls.map(c=>c.name),
  ['cotironda_piloto_v2_auto_release_d013']);
 assert.deepEqual(m.calls[0].params,{p_chat_hmac:H,p_source_hmac:S});
});
test('V2-24: política, feriados, consentimiento, vigencia y timing incorrectos no publican',async()=>{
 for(const state of ['invalid','disabled','calendar_not_installed',
  'calendar_disabled','source_not_eligible','v2_timing_invalid',
  'deadline_not_verified','calendar_revision_invalid',
  'auto_release_not_authorized','publication_not_ready']){
  const m=base();m.args.rpc=async(name,params)=>{
   m.calls.push({name,params});return {data:{state},error:null};
  };
  assert.deepEqual(await liberarPedidoAutomaticoV2D013(m.args),
   {estado:'no_elegible',requestId:null});
  assert.equal(m.calls.length,1);
 }
});
test('V2-24: SQL desconocido, timeout, error o UUID inválido nunca son éxito',async()=>{
 for(const reply of [
  async()=>{throw Error('Lost response')},
  async()=>({data:null,error:{code:'PGRST202'}}),
  async()=>({data:{state:'ready_for_delivery',request_id:'bad'},error:null}),
  async()=>({data:{state:'ready_for_delivery',request_id:ID},error:'timeout'}),
  async()=>({data:{state:'unrecognized'},error:null}),
  async()=>({data:[],error:null})
 ]){
  const m=base();m.args.rpc=reply;
  assert.equal((await liberarPedidoAutomaticoV2D013(m.args)).estado,
   'conciliacion_requerida');
 }
});
test('V2-24: salida idempotente de SQL solo si identidad de ronda es válida',async()=>{
 const m=base();m.args.rpc=async(name,params)=>{
  m.calls.push({name,params});
  return {data:{state:'already_published',request_id:ID},error:null};
 };
 assert.equal((await liberarPedidoAutomaticoV2D013(m.args)).estado,'publicado');
 assert.equal(m.calls.length,1);
});
test('V2-24: overlay Whapi v76 OFF explícito y SQL V2, sin tocar fuente v76',()=>{
 const original=file('scripts/piloto/baselines/cotironda-whapi-v76.index.ts.txt');
 const supplier=file('supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.v76-snapshot.ts');
 const candidate=generarCandidatoV202DesdeLive76(original,supplier);
 assert.match(original,/from '\.\/ai-central-buyer-auto-release-mvp306\.ts';/u);
 assert.match(candidate,/from '\.\/ai-central-buyer-auto-release-v2-d013\.ts';/u);
 assert.match(candidate,/const auto=await liberarPedidoAutomaticoV2D013\(/u);
 assert.match(candidate,/Deno\.env\.get\('COTIRONDA_PILOT_V2_AUTO_RELEASE_ENABLED'\)!=='true'/u);
 assert.doesNotMatch(candidate,/from '\.\/ai-central-buyer-auto-release-mvp306\.ts';/u);
 assert.doesNotMatch(candidate,/const auto=await liberarPedidoAutomaticoMvp306\(/u);
 assert.match(candidate,/habilitado:true,publicar:false/u);
 assert.match(candidate,/COTIRONDA_PILOT_BUYER_TRACKING_ENABLED/u);
 assert.match(candidate,/connectivityOnlyMvp333/u);
 assert.match(candidate,/processedInboundMvp333/u);
});
test('V2-24: SQL candidato es PRIVADO, calendario obligatorio y nunca altera legado',()=>{
 const sql=file('supabase/piloto/v2_24_auto_release_calendar_guarded_candidate.sql');
 for(const x of ['enabled boolean NOT NULL DEFAULT false',
  'v2_business_policy','v2_business_calendar',
  'cotironda_piloto_privado.v2_deadline(',
  "v_request.timing_mode IS DISTINCT FROM 'business_two_days'",
  'v_request.round_days IS DISTINCT FROM 2',
  'v_expected IS DISTINCT FROM v_request.closes_at',
  'v_revision IS DISTINCT FROM v_request.v2_calendar_revision',
  'r.created_at>=policy.activated_at',
  'FOR UPDATE OF r',
  'cotironda_piloto_ia_auto_release_mvp306(',
  'cotironda_piloto_ia_publish_mvp222(',
  'FROM PUBLIC,anon,authenticated,service_role',
  'TO service_role;',
  'ENABLE ROW LEVEL SECURITY'])
  assert.ok(sql.includes(x),x);
 assert.doesNotMatch(sql,/\bUPDATE\s+cotironda_piloto_privado\.ai_auto_release_gate_mvp306\b/iu);
 assert.doesNotMatch(sql,/\bUPDATE\s+cotironda_piloto_privado\.v2_business_policy\b/iu);
 assert.doesNotMatch(sql,/\bDROP\s+(?:FUNCTION|TABLE|SCHEMA)\b/iu);
 assert.doesNotMatch(sql,/\bTRUNCATE\b/iu);
 assert.doesNotMatch(sql,/\bINSERT\s+INTO\s+cotironda_piloto_privado\.invitations\b/iu);
});
test('V2-24: ensayo PG17 incluye casos válidos e inválidos y rollback total',()=>{
 const sql=file('supabase/tests/ci/v2-24-auto-release-guard-pg17.sql');
 for(const err of ['v2_24_off_allowed','v2_24_calendar_off_allowed',
  'v2_24_legacy_calendar_allowed','v2_24_wrong_deadline_allowed',
  'v2_24_wrong_revision_allowed','v2_24_revoked_buyer_allowed',
  'v2_24_old_round_allowed','v2_24_duplicate_release',
  'V2_24_AUTO_RELEASE_GUARDED_PG17_PASS',
  'ROLLBACK;'])
 assert.ok(sql.includes(err),err);
});
