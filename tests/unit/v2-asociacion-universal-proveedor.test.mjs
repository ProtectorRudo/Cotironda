import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {elegirRondaUnicaMvp291,correlacionAutomaticaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-contextual-v2.ts';
import {extraerMaterialesTextoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-text-materials-contextual-v2.ts';
const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const c='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const hash='c'.repeat(64),chat='d'.repeat(64);
const line=(line_no,description,quantity=null,unit=null)=>({
 line_no,description,quantity,unit
});
const proposal=(selected_candidate,matches)=>({selected_candidate,matches});
const match=(candidate,source_line,request_line,relation='same')=>({
 candidate,source_line,request_line,relation
});
const latest=()=>({request_id:a,bind_allowed:true,lines:[
 line(1,'bolsas de cemento CPC 50 kg','10','bag'),
 line(2,'bolsones arena fina 1 m³','2','bag'),
 line(3,'bolsón piedra partida 1 m³','1','bag'),
 line(4,'montantes de 70 mm','15','unit'),
 line(5,'placas yeso 12,5 mm','8','unit')
]});
const former=()=>({request_id:b,bind_allowed:false,lines:[
 line(1,'bolsas de cemento CPC 50 kg','10','bag'),
 line(2,'bolsón arena fina 1 m³','1','bag'),
 line(3,'bolsón piedra partida 1 m³','1','bag')
]});
const quote=()=>[
 line(1,'Cemento CPC 50 kg marca libre','10','bolsas'),
 line(2,'bolsón de arena fina','2','bolsones'),
 line(3,'bolsón piedra partida','1','bolsón')
];
const snap=()=>({quote:quote(),options:[latest(),former()]});
const allLinks=()=>[1,2,3].flatMap(i=>[
 match('r1',i,i,'equivalent'),match('r2',i,i,'equivalent')
]);
const sql=readFileSync(new URL(
 '../../supabase/piloto/v2_ia_central_asociacion_ultima_ronda_CANDIDATE.sql',
 import.meta.url),'utf8');

test('IA Central elige la ronda actual sin segunda interpretación numérica',()=>{
 const s=snap();
 const pick=elegirRondaUnicaMvp291(s,proposal('r1',allLinks()));
 assert.equal(pick.requestId,a);
 assert.equal(pick.reason,'ai_central_selected_v2');
 assert.deepEqual(pick.scores,[]);
});
test('La IA puede elegir una ronda con marca o presentación diferente',()=>{
 const s={quote:[line(1,'Ceresita hidrófugo bidones 5 L','3','bidones')],
 options:[{request_id:a,lines:[line(1,'Cemento','10','bolsas')]},
 {request_id:b,lines:[line(1,'Hidrófugo 20 litros','2','bidones')]}]};
 assert.equal(elegirRondaUnicaMvp291(s,
  proposal('r2',[match('r2',1,1,'equivalent')])).requestId,b);
});
test('La IA puede elegir un parcial: Cotironda no inventa requisitos de cantidad',()=>{
 const s={quote:[line(1,'Cemento','7','bolsas')],
 options:[{request_id:a,lines:[line(1,'Cemento CPC 50kg','10','bag')]},
 {request_id:b,lines:[line(1,'Cemento CPC 50kg','9','bag')]}]};
 const choice=elegirRondaUnicaMvp291(s,
  proposal('r1',[match('r1',1,1),match('r2',1,1)]));
 assert.equal(choice.requestId,a);
 assert.equal(choice.reason,'ai_central_selected_v2');
});
test('Una ronda ya cerrada jamás es destino de una selección IA',()=>{
 const s=snap();
 assert.equal(elegirRondaUnicaMvp291(s,
  proposal('r2',allLinks())).requestId,null);
 assert.equal(elegirRondaUnicaMvp291(s,
  proposal('r2',allLinks())).reason,'historical_round_selected');
});
test('Una elección sin vínculo material comprobable no se publica',()=>{
 const s=snap();
 assert.equal(elegirRondaUnicaMvp291(s,proposal('r1',[])).requestId,null);
 assert.equal(elegirRondaUnicaMvp291(s,
  proposal('r1',[match('r1',1,1,'uncertain')])).requestId,null);
});
test('Los punteros inventados o duplicados se rechazan',()=>{
 const s=snap();
 for(const bad of [
  proposal('r1',[match('r1',99,1)]),
  proposal('r1',[match('r1',1,99)]),
  proposal('r9',[match('r1',1,1)]),
  proposal('r1',[match('r1',1,1),match('r1',1,2)])
 ])assert.equal(elegirRondaUnicaMvp291(s,bad).requestId,null);
});
test('Abstención IA con ronda más reciente compatible abre ÚNICAMENTE último recurso SQL',()=>{
 const result=elegirRondaUnicaMvp291(snap(),proposal(null,allLinks()));
 assert.equal(result.requestId,a);
 assert.equal(result.reason,'last_resort_latest_unanswered_v2');
 assert.deepEqual(result.scores,[]);
});
test('Abstención IA sin ninguna vinculación al pedido reciente permanece privada',()=>{
 const s=snap();
 assert.equal(elegirRondaUnicaMvp291(s,proposal(null,[
  match('r2',1,1)])).requestId,null);
});
test('Tres rondas simultáneas jamás admiten último recurso de recencia',()=>{
 const s=snap();s.options.push({request_id:c,lines:[line(1,'Cemento','10','bolsas')]});
 assert.equal(elegirRondaUnicaMvp291(s,proposal(null,
  [match('r1',1,1),match('r2',1,1),match('r3',1,1)])).requestId,null);
});
test('IA no pudo resolver por relación uncertain: no se fuerza una asociación',()=>{
 const s=snap();
 const selected=elegirRondaUnicaMvp291(s,proposal(null,
  [match('r1',2,2,'uncertain'),match('r2',2,2)]));
 assert.equal(selected.requestId,null);
});
test('Una decisión IA explícita anterior nunca se cambia silenciosamente por reciente',()=>{
 const s=snap();s.options[1].bind_allowed=true;
 const selected=elegirRondaUnicaMvp291(s,proposal('r2',allLinks()));
 assert.equal(selected.requestId,b);
 assert.equal(selected.reason,'ai_central_selected_v2');
});
test('Dos lecturas divergentes de fixture se invalidan, pero producción usa solo una',()=>{
 const s=snap();
 assert.equal(elegirRondaUnicaMvp291(s,proposal('r1',allLinks()),
  proposal('r2',[match('r2',1,1)])).requestId,null);
});
test('Una decisión con un original inventado jamás genera vínculo',async()=>{
 const original='Cotizo 10 bolsas de cemento CPC 50 kg.';
 const output=await extraerMaterialesTextoMvp292({
  source:original,apiKey:'k'.repeat(24),model:'gpt-6-luna',
  read:async()=>({items:[{
   original:'20 bolsas de pintura',
   description:'pintura',quantity:'20',unit:'bolsas'
  }]})
 });
 assert.equal(output,null);
});
test('Texto: IA de extracción conserva cantidades originales, sin completar IVA',async()=>{
 let reads=0;
 const text='Cotizo 10 bolsas de cemento CPC 50 kg.';
 const output=await extraerMaterialesTextoMvp292({
  source:text,apiKey:'k'.repeat(24),model:'gpt-6-luna',
  read:async()=>{reads++;return {items:[{
   original:'10 bolsas de cemento CPC 50 kg',
   description:'cemento CPC 50 kg',quantity:'10',unit:'bolsas'
  }]}}
 });
 assert.equal(output?.[0]?.quantity,'10');
 assert.equal(reads,1);
});
test('Operativo IA selecciona una sola vez; asociación va por SQL aislado',async()=>{
 const s=snap(),events=[];let reads=0;
 const rpc=async(name,args)=>{
  events.push({name,args});
  if(name==='cotironda_piloto_stage_supplier_text_mvp292')
   return {data:{state:'already_staged'},error:null};
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:hash,
    quote:s.quote,candidates:s.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_ai_selected_v2'){
   assert.equal(args.p_request,a);
   return {data:{state:'linked_private'},error:null};
  }
  throw Error('unexpected rpc '+name);
 };
 const outcome=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:hash,chatHmac:chat,
  textQuote:s.quote,textSha256:hash,apiKey:'k'.repeat(24),
  model:'gpt-6-luna',rpc,compare:async()=>{reads++;return proposal('r1',allLinks())}
 });
 assert.equal(outcome.state,'linked_private');
 assert.equal(outcome.reason,'ai_central_selected_v2');
 assert.equal(reads,1);
 assert.equal(outcome.outboundMessages,0);
 assert.equal(events.filter(x=>x.name.includes('_bind_')).length,1);
});
test('Si IA se abstiene, se consulta exclusivamente la RPC SQL del último recurso',async()=>{
 const s=snap(),calls=[];let reads=0;
 const rpc=async(name,args)=>{
  calls.push(name);
  if(name==='cotironda_piloto_stage_supplier_text_mvp292')
   return {data:{state:'already_staged'},error:null};
  if(name==='cotironda_piloto_auto_correlation_retry_quantity_prepare_v2')
   return {data:{state:'reserved',source_sha256:hash,quote:s.quote,candidates:s.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_latest_unanswered_v2'){
   assert.equal(args.p_request,a);
   return {data:{state:'linked_private'},error:null};
  }
  throw Error(name);
 };
 const outcome=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:hash,chatHmac:chat,
  textQuote:s.quote,textSha256:hash,retryQuantityAfterReview:true,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>{reads++;return proposal(null,allLinks())}
 });
 assert.equal(outcome.state,'linked_private');
 assert.equal(outcome.reason,'last_resort_latest_unanswered_v2');
 assert.equal(reads,1);
 assert.equal(outcome.outboundMessages,0);
 assert.deepEqual(calls.filter(x=>x.includes('_bind_')),
  ['cotironda_piloto_auto_correlation_bind_latest_unanswered_v2']);
});
test('Si SQL deniega último recurso, original permanece privado y auditado',async()=>{
 const s=snap(),calls=[];
 const rpc=async(name)=>{
  calls.push(name);
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:hash,quote:s.quote,candidates:s.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_latest_unanswered_v2')
   return {data:{state:'different_buyers'},error:null};
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291')
   return {data:{state:'recorded'},error:null};
  throw Error(name);
 };
 const out=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:hash,chatHmac:chat,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>proposal(null,allLinks())
 });
 assert.equal(out.state,'unresolved_private');
 assert.equal(out.reason,'fallback_not_verified');
 assert.equal(out.outboundMessages,0);
 assert.equal(calls.filter(x=>x.includes('_bind_')).length,1);
});
test('Si SQL deniega la elección IA, no hay segundo intérprete ni publicación',async()=>{
 const s=snap(),calls=[];
 const rpc=async(name)=>{
  calls.push(name);
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:hash,quote:s.quote,candidates:s.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_ai_selected_v2')
   return {data:{state:'buyer_isolation_not_verified'},error:null};
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291')
   return {data:{state:'recorded'},error:null};
  throw Error(name);
 };
 const out=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:hash,chatHmac:chat,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>proposal('r1',allLinks())
 });
 assert.notEqual(out.state,'linked_private');
 assert.equal(out.outboundMessages,0);
 assert.equal(calls.filter(x=>x.includes('_bind_')).length,1);
});
test('No permite reintentar automáticamente sin texto auténtico corroborado',async()=>{
 const base={enabled:true,webhookAuthenticated:true,sourceHmac:hash,
  chatHmac:chat,apiKey:'k'.repeat(24),model:'gpt-6-luna',
  rpc:async()=>{throw Error('should not access DB')},
  retryQuantityAfterReview:true};
 assert.equal((await correlacionAutomaticaMvp291(base)).state,'not_eligible');
 assert.equal((await correlacionAutomaticaMvp291({
  ...base,retryReviewedOnce:true,textQuote:quote(),textSha256:hash
 })).state,'not_eligible');
});
test('Último recurso exige exactamente dos rondas, mismo comprador y presupuesto anterior',()=>{
 for(const must of [
  "v_n<>2", "different_buyers","latest_not_active","latest_already_quoted",
  "prior_quote_missing","non_unique_order","not_two_latest",
  "l.request_id=v_previous","l.supplier_key=v_source.participant_key",
  "prior.received_at<v_source.received_at",
  "l.request_id=v_latest","seen.request_id=v_latest",
  "q.request_id=v_latest","r.state IN('prepared','closed')",
  "r.created_at<=v_source.received_at","r.closes_at>v_source.received_at",
  "r.closed_at>v_source.received_at","buyer.consent_at IS NOT NULL",
  "supplier.consent_at IS NOT NULL","i.state='prepared'",
  "d.state='api_accepted'","o.state='api_accepted'",
  "public.cotironda_piloto_auto_correlation_bind_mvp291("
 ])assert.ok(sql.includes(must),must);
});
test('Decisión IA nunca vincula rondas de compradores diferentes',()=>{
 assert.match(sql,/count\(DISTINCT candidates\.buyer_key\)/u);
 assert.match(sql,/v_buyers<>1/u);
 assert.match(sql,/buyer_isolation_not_verified/u);
});
test('RLS y acceso privados: ninguna RPC de asociación nueva disponible al cliente',()=>{
 for(const name of [
  'cotironda_piloto_auto_correlation_bind_latest_unanswered_v2',
  'cotironda_piloto_auto_correlation_bind_ai_selected_v2'
 ]){
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+name));
  assert.ok(sql.includes('FROM PUBLIC,anon,authenticated'));
  assert.ok(sql.includes('TO service_role'));
 }
 assert.doesNotMatch(sql,/\bDELETE\s+FROM\b|\bDROP\s+TABLE\b/iu);
 assert.doesNotMatch(sql,/UPDATE cotironda_piloto_privado\.whapi_inbox SET request_id/u);
});

test('Si el original menciona corrección de oferta anterior no aplica recencia',()=>{
 const s=snap();
 s.quote[0].description='Corrección: cemento CPC 50 kg';
 const outcome=elegirRondaUnicaMvp291(s,proposal(null,allLinks()));
 assert.equal(outcome.requestId,null);
 assert.equal(outcome.reason,'explicit_prior_quote_correction');
});
test('Sin palabras correctivas, una abstención conserva último recurso SQL',()=>{
 const s=snap();
 const result=elegirRondaUnicaMvp291(s,proposal(null,allLinks()));
 assert.equal(result.reason,'last_resort_latest_unanswered_v2');
});
