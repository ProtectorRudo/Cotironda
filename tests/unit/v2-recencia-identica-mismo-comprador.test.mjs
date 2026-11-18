import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {elegirRondaUnicaMvp291,correlacionAutomaticaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-mvp336.ts';

const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sourceHash='c'.repeat(64),chatHash='d'.repeat(64);
const lines=()=>[
 {line_no:1,description:'Cemento CPC 50 kg',quantity:'10',unit:'bolsas'},
 {line_no:2,description:'Arena fina',quantity:'2',unit:'bolsones'},
 {line_no:3,description:'Piedra partida',quantity:'1',unit:'bolsón'}
];
const snapshot=()=>({
 quote:lines(),
 options:[{request_id:a,lines:lines(),bind_allowed:true},
          {request_id:b,lines:lines(),bind_allowed:true}]
});
const agreement=(snap=snapshot())=>({
 matches:snap.options.flatMap((candidate,index)=>candidate.lines.map((line,i)=>({
  candidate:'r'+(index+1),source_line:i+1,request_line:line.line_no,relation:'same'
 })))
});
test('V2 desempata sólo rondas idénticas, doble IA concordante y evidencia física',()=>{
 const s=snapshot(),proposal=agreement(s);
 const picked=elegirRondaUnicaMvp291(s,proposal,proposal);
 assert.equal(picked.reason,'recent_identical_same_buyer_v2');
 assert.equal(picked.requestId,a,'selección tentativa por orden SQL, a verificar en el servidor');
 assert.deepEqual([...picked.scores],[9,9]);
});
test('V2 no impone recencia con pedidos parcialmente distintos como el caso real de Ailín',()=>{
 const s=snapshot();
 s.options[1].lines[2].description='Piedra granítica (variante distinta)';
 const verdict=elegirRondaUnicaMvp291(s,agreement(s),agreement(s));
 assert.notEqual(verdict.reason,'recent_identical_same_buyer_v2');
});
test('V2 nunca desempata con cantidades, unidades, presentaciones o líneas faltantes distintas',()=>{
 for(const update of [
  (l)=>{l[0].quantity='5';},
  (l)=>{l[0].unit='kilogramos';},
  (l)=>{l[0].description='Cemento CPC 25 kg';},
  (l)=>{l.pop();}
 ]){
  const s=snapshot();update(s.options[1].lines);
  const result=elegirRondaUnicaMvp291(s,agreement(s),agreement(s));
  assert.notEqual(result.reason,'recent_identical_same_buyer_v2');
 }
});
test('V2 si hay historial cerrado o lecturas IA en desacuerdo no aplica recencia',()=>{
 const s=snapshot(),p=agreement(s);
 s.options[1].bind_allowed=false;
 assert.notEqual(elegirRondaUnicaMvp291(s,p,p).reason,'recent_identical_same_buyer_v2');
 const t=snapshot();
 assert.equal(elegirRondaUnicaMvp291(t,agreement(t),{matches:[]}).reason,'independent_reads_disagree');
});
test('V2 no adivina la ronda si el presupuesto no tiene correspondencias verificables',()=>{
 const s=snapshot(),none={matches:[]};
 const result=elegirRondaUnicaMvp291(s,none,none);
 assert.equal(result.requestId,null);
 assert.notEqual(result.reason,'recent_identical_same_buyer_v2');
});
test('V2 SQL frena recencia entre compradores distintos y conserva el original',async()=>{
 const events=[],s=snapshot(),proposal=agreement(s);
 const rpc=async(name,params)=>{
  events.push({name,params});
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:sourceHash,quote:s.quote,candidates:s.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_latest_same_buyer_v2')
   return {data:{state:'different_buyers'},error:null};
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291')
   return {data:{state:'recorded'},error:null};
  throw Error('unexpected RPC '+name);
 };
 const result=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:sourceHash,chatHmac,
  apiKey:'x'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>proposal
 });
 assert.equal(result.state,'unresolved_private');
 assert.equal(result.reason,'recency_not_verified');
 assert.equal(result.outboundMessages,0);
 assert.equal(events.filter(e=>e.name.includes('bind_')).length,1);
 assert.ok(events.every(e=>e.name!=='cotironda_piloto_auto_correlation_bind_mvp291'));
 assert.equal(events.at(-1).params.p_reason,'recency_not_verified');
});
test('V2 sólo declara asociado cuando SQL prueba la coincidencia integral',async()=>{
 const events=[],s=snapshot(),p=agreement(s);
 const rpc=async(name,params)=>{
  events.push(name);
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:sourceHash,quote:s.quote,candidates:s.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_latest_same_buyer_v2')
   return {data:{state:'linked_private'},error:null};
  throw Error('unexpected RPC');
 };
 const result=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:sourceHash,chatHmac,
  apiKey:'x'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>p
 });
 assert.equal(result.state,'linked_private');
 assert.equal(result.reason,'recent_identical_same_buyer_v2');
 assert.equal(events.filter(n=>n.includes('bind_')).length,1);
});
const sql=readFileSync(new URL('../../supabase/piloto/v2_recencia_identica_mismo_comprador_CANDIDATE.sql',import.meta.url),'utf8');
test('V2 candidato SQL comprueba mismo comprador, pedidos completos y últimas fechas',()=>{
 for(const key of [
  'v_round.buyer_key IS DISTINCT FROM v_buyer',
  'v_full IS DISTINCT FROM v_original_signature',
  'v_supplied IS DISTINCT FROM v_supplier_signature',
  'v_latest_id IS DISTINCT FROM p_request',
  'v_round.created_at=v_latest_at',
  "decision.state='reserved'",
  "unresolved.state='ambiguous_round'",
  "r.state='prepared'",
  "v_round.timing_mode IS DISTINCT FROM 'business_two_days'",
  'v_round.v2_calendar_revision IS NULL',
  'v_source.received_at',
  "j.state='api_accepted'",
  "o.state='api_accepted'",
  "supplier.opted_out_at IS NULL",
  'buyer.opted_out_at IS NULL',
  'public.cotironda_piloto_auto_correlation_bind_mvp291(',
  "reason='recent_identical_same_buyer_v2'",
  'FROM PUBLIC,anon,authenticated',
  'TO service_role'
 ])assert.ok(sql.includes(key),key);
 assert.doesNotMatch(sql,/https?:\/\/gate\.whapi|messages\/document|messages\/text/iu);
 assert.doesNotMatch(sql,/\bUPDATE\b\s+cotironda_piloto_privado\.requests/iu);
});
