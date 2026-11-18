import test from 'node:test';
import assert from 'node:assert/strict';
import {elegirRondaUnicaMvp291,correlacionAutomaticaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-contextual-v2.ts';
import {extraerMaterialesTextoMvp292} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-text-materials-contextual-v2.ts';

const a='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const b='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hash='c'.repeat(64),chat='d'.repeat(64);
const line=(line_no,description,quantity=null,unit=null)=>({
 line_no,description,quantity,unit
});
const proposal=(selected_candidate,matches)=>({selected_candidate,matches});
const match=(candidate,source_line,request_line,relation='same')=>({
 candidate,source_line,request_line,relation
});
test('Una sola coincidencia exclusiva permite presupuesto parcial, marcas y presentaciones diferentes',()=>{
 const snap={
  quote:[line(1,'Ceresita hidrófugo en bidones de 5 L','3','bidones')],
  options:[
   {request_id:a,lines:[line(1,'Cemento CPC 50kg','10','bolsas')]},
   {request_id:b,lines:[line(1,'Hidrófugo 20 litros','2','bidones'),
     line(2,'Arena fina','1','bolsón')]}
  ]
 };
 const picked=elegirRondaUnicaMvp291(snap,proposal('r2',[match('r2',1,1,'equivalent')]));
 assert.equal(picked.requestId,b);
 assert.equal(picked.reason,'single_model_distinct_material_v2');
});
test('Una línea común entre dos rondas diferentes JAMÁS asigna por recencia',()=>{
 const snap={
  quote:[line(1,'Cemento','7','bolsas')],
  options:[
   {request_id:a,lines:[line(1,'Cemento CPC 50kg','10','bolsas'),
     line(2,'Membrana 4 mm','2','rollos')]},
   {request_id:b,lines:[line(1,'Cemento CPC 50kg','9','bolsas'),
     line(2,'Arena fina','1','bolsón')]}
  ]
 };
 const picked=elegirRondaUnicaMvp291(snap,proposal('r1',[
  match('r1',1,1),match('r2',1,1)]));
 assert.equal(picked.requestId,null);
 assert.equal(picked.reason,'non_unique_material');
 assert.equal(elegirRondaUnicaMvp291(snap,proposal(null,[
  match('r1',1,1),match('r2',1,1)])).requestId,null);
});
test('Una cotización parcial con producto compartido y otro exclusivo asocia sin puntajes',()=>{
 const snap={
  quote:[line(1,'Cemento','5','bolsas'),line(2,'Membrana aluminizada','4','rollos')],
  options:[
   {request_id:a,lines:[line(1,'Cemento','12','bolsas'),line(2,'Arena','1','m3')]},
   {request_id:b,lines:[line(1,'Cemento','20','bolsas'),
     line(2,'Membrana asfáltica 4mm','2','rollos')]}
  ]
 };
 const p=proposal('r2',[match('r1',1,1),match('r2',1,1),
  match('r2',2,2,'equivalent')]);
 assert.equal(elegirRondaUnicaMvp291(snap,p).requestId,b);
});
test('No admite renglones inventados, candidatos inexistentes ni rondas inhabilitadas',()=>{
 const snap={
  quote:[line(1,'Ceresita')],
  options:[{request_id:a,lines:[line(1,'Ceresita')]},
   {request_id:b,lines:[line(1,'Arena')]}]
 };
 assert.equal(elegirRondaUnicaMvp291(snap,proposal('r1',[
  match('r1',999,1)])).requestId,null);
 assert.equal(elegirRondaUnicaMvp291(snap,proposal('r9',[
  match('r1',1,1)])).requestId,null);
 snap.options[0].bind_allowed=false;
 assert.equal(elegirRondaUnicaMvp291(snap,proposal('r1',[
  match('r1',1,1)])).requestId,null);
});
test('La asociación operativa llama una SOLA vez a IA; SQL debe autorizar el vínculo',async()=>{
 const snap={
  quote:[line(1,'Hidrófugo Ceresita')],
  options:[{request_id:a,lines:[line(1,'Cemento')]},
   {request_id:b,lines:[line(1,'Hidrófugo')]}]
 };
 const events=[];let reads=0;
 const rpc=async(name)=>{
  events.push(name);
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:hash,quote:snap.quote,candidates:snap.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_mvp291')
   return {data:{state:'linked_private'},error:null};
  throw Error('unexpected '+name);
 };
 const r=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:hash,chatHmac:chat,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>{reads++;return proposal('r2',[match('r2',1,1,'equivalent')])}
 });
 assert.equal(reads,1);
 assert.equal(r.state,'linked_private');
 assert.equal(r.reason,'single_model_distinct_material_v2');
 assert.equal(r.outboundMessages,0);
 assert.equal(events.filter(n=>n.includes('_bind_')).length,1);
});
test('Si la base deniega el enlace, el mensaje permanece en revisión privada',async()=>{
 const snap={quote:[line(1,'Arena')],
  options:[{request_id:a,lines:[line(1,'Arena')]},
   {request_id:b,lines:[line(1,'Piedra')]}]};
 const names=[];
 const rpc=async(name)=>{
  names.push(name);
  if(name==='cotironda_piloto_auto_correlation_prepare_mvp291')
   return {data:{state:'reserved',source_sha256:hash,quote:snap.quote,candidates:snap.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_mvp291')
   return {data:{state:'not_eligible'},error:null};
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291')
   return {data:{state:'recorded'},error:null};
  throw Error(name);
 };
 const r=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,sourceHmac:hash,chatHmac:chat,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>proposal('r1',[match('r1',1,1)])
 });
 assert.notEqual(r.state,'linked_private');
 assert.equal(r.outboundMessages,0);
 assert.ok(names.includes('cotironda_piloto_auto_correlation_finish_mvp291'));
});

test('Nahuel: 10 cemento, 2 arena, 1 piedra distinguen ronda 18/11 frente a 10/1/1',()=>{
 const snap={
  quote:[
   line(1,'Cemento 50 kg Loma Negra','10','bolsas'),
   line(2,'bolsón de arena','2','bolsón'),
   line(3,'bolsón de piedra','1','bolsón')],
  options:[
   {request_id:a,lines:[
    line(1,'Cemento CPC 50kg','10','bag'),
    line(2,'Arena fina 1 m3','2','bag'),
    line(3,'Piedra partida 1 m3','1','bag'),
    line(4,'Montante 70 mm','15','unit'),
    line(5,'Placa yeso 12,5 mm','8','unit')]},
   {request_id:b,lines:[
    line(1,'Cemento CPC 50kg','10','bag'),
    line(2,'Arena fina 1 m3','1','bag'),
    line(3,'Piedra partida 1 m3','1','bag')]}
  ]
 };
 const matches=[1,2,3].flatMap(i=>[
  match('r1',i,i,'equivalent'),match('r2',i,i,'equivalent')]);
 const picked=elegirRondaUnicaMvp291(snap,proposal('r1',matches));
 assert.equal(picked.requestId,a);
 assert.equal(picked.reason,'single_model_distinct_material_v2');
 // If the AI favors the older request, the numeric evidence denies that
 // preference instead of assigning somebody else's commercial original.
 const wrong=elegirRondaUnicaMvp291(snap,proposal('r2',matches));
 assert.equal(wrong.requestId,null);
});
test('Cantidad compartida de un solo material no decide ronda ni inventa equivalencias',()=>{
 const snapshot={quote:[line(1,'Arena','2','bolsones')],
 options:[
  {request_id:a,lines:[line(1,'Arena','2','bag')]},
  {request_id:b,lines:[line(1,'Arena','1','bag')]}]};
 const p=proposal('r1',[match('r1',1,1),match('r2',1,1)]);
 assert.equal(elegirRondaUnicaMvp291(snapshot,p).requestId,null);
});
test('La extracción contextual hace una sola llamada y verifica el texto original',async()=>{
 let reads=0;
 const source='Cotizo 10 bolsas de cemento CPC 50 kg.';
 const data=await extraerMaterialesTextoMvp292({
  source,apiKey:'k'.repeat(24),model:'gpt-6-luna',
  read:async()=>{reads++;return {items:[{
   original:'10 bolsas de cemento CPC 50 kg',
   description:'cemento CPC 50 kg',quantity:'10',unit:'bolsas'}]}}
 });
 assert.equal(reads,1);
 assert.equal(data?.length,1);
 assert.equal(data[0].quantity,'10');
 const fabricated=await extraerMaterialesTextoMvp292({
  source,apiKey:'k'.repeat(24),model:'gpt-6-luna',
  read:async()=>({items:[{original:'20 bolsas de pintura',
   description:'pintura',quantity:'20',unit:'bolsas'}]})
 });
 assert.equal(fabricated,null,'no se aceptan artículos inventados');
});

test('Un texto ya archivado en review utiliza un único lease SQL para reintentar',async()=>{
 const snap={quote:[line(1,'Arena','2','bolsón')],
  options:[{request_id:a,lines:[line(1,'Arena','2','bag'),
    line(2,'Cemento','10','bag')]},
   {request_id:b,lines:[line(1,'Arena','1','bag'),
    line(2,'Cemento','10','bag')]}]};
 const events=[],rpc=async(name)=>{
  events.push(name);
  if(name==='cotironda_piloto_stage_supplier_text_mvp292')
   return {data:{state:'already_staged'},error:null};
  if(name==='cotironda_piloto_auto_correlation_retry_text_prepare_v2')
   return {data:{state:'reserved',source_sha256:hash,quote:snap.quote,candidates:snap.options},error:null};
  if(name==='cotironda_piloto_auto_correlation_finish_mvp291')
   return {data:{state:'recorded'},error:null};
  throw Error(name);
 };
 const r=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,retryReviewedOnce:true,
  sourceHmac:hash,chatHmac:chat,textSha256:hash,textQuote:snap.quote,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>proposal(null,[match('r1',1,1),match('r2',1,1)])
 });
 assert.equal(r.state,'unresolved_private','una sola línea compartida jamás debe adivinar ronda');
 assert.equal(r.outboundMessages,0);
 assert.equal(events.filter(n=>n==='cotironda_piloto_auto_correlation_retry_text_prepare_v2').length,1);
});
test('Un texto de tres renglones recuperado se asocia con SQL a su ronda única',async()=>{
 const quote=[line(1,'cemento 50 kg','10','bolsas'),
  line(2,'bolsón de arena','2','bolsones'),
  line(3,'bolsón de piedra','1','bolsón')];
 const opts=[
  {request_id:a,bind_allowed:true,lines:[
   line(1,'cemento CPC 50 kg','10','bag'),
   line(2,'arena fina','2','bag'),
   line(3,'piedra partida','1','bag'),
   line(4,'placa de yeso','8','unit')]},
  {request_id:b,bind_allowed:false,lines:[
   line(1,'cemento CPC 50 kg','10','bag'),
   line(2,'arena fina','1','bag'),
   line(3,'piedra partida','1','bag')]}];
 const changes=[];let reads=0;
 const rpc=async(name,args)=>{
  changes.push(name);
  if(name==='cotironda_piloto_stage_supplier_text_mvp292')
   return {data:{state:'already_staged'},error:null};
  if(name==='cotironda_piloto_auto_correlation_retry_text_prepare_v2')
   return {data:{state:'reserved',source_sha256:hash,quote,candidates:opts},error:null};
  if(name==='cotironda_piloto_auto_correlation_bind_mvp291'){
   assert.equal(args.p_request,a);
   assert.equal(args.p_source_sha256,hash);
   return {data:{state:'linked_private'},error:null};
  }
  throw Error('unrecognized SQL '+name);
 };
 const verdict=await correlacionAutomaticaMvp291({
  enabled:true,webhookAuthenticated:true,retryReviewedOnce:true,
  sourceHmac:hash,chatHmac:chat,textSha256:hash,textQuote:quote,
  apiKey:'k'.repeat(24),model:'gpt-6-luna',rpc,
  compare:async()=>{reads++;return proposal('r1',quote.flatMap((_,i)=>[
   match('r1',i+1,i+1,'equivalent'),match('r2',i+1,i+1,'equivalent')
  ]))}
 });
 assert.equal(verdict.state,'linked_private');
 assert.equal(reads,1);
 assert.equal(changes.filter(x=>x.includes('_bind_')).length,1);
 assert.equal(verdict.outboundMessages,0);
});


// Real pilot structure, anonymized: 10 cement / 2 sand / 1 stone versus
// an older 10 / 1 / 1 request. Tests never use stored private source text.
const pairwiseOffer=()=>[
 line(1,'Cemento CPC 50 kg marca libre','10','bolsas'),
 line(2,'bolsón de arena fina','2','bolsones'),
 line(3,'bolsón de piedra partida','1','bolsón')
];
const pairwiseRequests=()=>[
 {request_id:a,bind_allowed:true,lines:[
  line(1,'bolsas de cemento CPC 50 kg','10','bag'),
  line(2,'bolsones arena fina 1 m³','2','bag'),
  line(3,'bolsón piedra partida 1 m³','1','bag'),
  line(4,'perfiles montantes 70 mm','15','unit'),
  line(5,'placas yeso 12,5 mm','8','unit')
 ]},
 {request_id:b,bind_allowed:false,lines:[
  line(1,'bolsas de cemento CPC 50 kg','10','bag'),
  line(2,'bolsón arena fina 1 m³','1','bag'),
  line(3,'bolsón piedra partida 1 m³','1','bag')
 ]}
];
const completePairs=()=>[1,2,3].flatMap(i=>[
 match('r1',i,i,'equivalent'),match('r2',i,i,'equivalent')]);
test('El modelo puede abstenerse; Cotironda resuelve 10/2/1 vs 10/1/1 por prueba física comparativa',()=>{
 const snapshot={quote:pairwiseOffer(),options:pairwiseRequests()};
 const resolved=elegirRondaUnicaMvp291(snapshot,proposal(null,completePairs()));
 assert.equal(resolved.requestId,a);
 assert.equal(resolved.reason,'single_model_distinct_material_v2');
});
test('Una selección expresa CONTRARIA a la cantidad queda en privado',()=>{
 const snapshot={quote:pairwiseOffer(),options:pairwiseRequests()};
 const rejected=elegirRondaUnicaMvp291(snapshot,proposal('r2',completePairs()));
 assert.equal(rejected.requestId,null);
 assert.equal(rejected.reason,'model_quantity_conflict');
});
test('Sin vínculos del rival para arena no se inventa una comparación cuantitativa',()=>{
 const snapshot={quote:pairwiseOffer(),options:pairwiseRequests()};
 const missing=completePairs().filter(x=>!(
  x.candidate==='r2'&&x.source_line===2));
 assert.equal(elegirRondaUnicaMvp291(snapshot,proposal(null,missing)).requestId,null);
});
test('Si dos rondas tienen mismas cantidades, la abstención de IA se respeta',()=>{
 const options=pairwiseRequests();
 options[1].bind_allowed=true;
 options[1].lines[1].quantity='2';
 const snapshot={quote:pairwiseOffer(),options};
 assert.equal(elegirRondaUnicaMvp291(snapshot,proposal(null,completePairs())).requestId,null);
});
test('Dos coincidencias fuertes con conflictos cruzados deben abstenerse',()=>{
 const quote=[line(1,'Cemento 50 kg','10','bolsas'),
  line(2,'Arena fina','2','bolsones'),
  line(3,'Piedra partida','1','bolsón')];
 const opts=[
  {request_id:a,lines:[line(1,'Cemento 50 kg','10','bag'),
   line(2,'Arena fina','2','bag'),line(3,'Piedra','2','bag')]},
  {request_id:b,lines:[line(1,'Cemento 50 kg','10','bag'),
   line(2,'Arena fina','1','bag'),line(3,'Piedra','1','bag')]}
 ];
 assert.equal(elegirRondaUnicaMvp291({quote,options:opts},
  proposal(null,completePairs())).requestId,null);
});
test('Una cotización de un solo material nunca se asocia usando sólo diferencias de cantidad',()=>{
 const snapshot={quote:[line(1,'Arena fina','2','bolsón')],options:[
  {request_id:a,lines:[line(1,'Arena fina','2','bag')]},
  {request_id:b,lines:[line(1,'Arena fina','1','bag')]}
 ]};
 assert.equal(elegirRondaUnicaMvp291(snapshot,proposal(null,[
  match('r1',1,1),match('r2',1,1)])).requestId,null);
});
test('Una ronda histórica bloqueada nunca es elegida por fuerza numérica',()=>{
 const snapshot={quote:pairwiseOffer(),options:pairwiseRequests()};
 snapshot.options[0].bind_allowed=false;
 assert.equal(elegirRondaUnicaMvp291(snapshot,proposal(null,completePairs())).requestId,null);
});
test('No confundir bolsa pequeña con bolsón sólo porque el número coincide',async()=>{
 const {corroborarCantidadMvp291}=await import(
  '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-contextual-v2.ts');
 const sack=line(1,'bolsas de arena','2','bag');
 const bigbag=line(1,'bolsones de arena','2','bag');
 assert.equal(corroborarCantidadMvp291(sack,bigbag),'unknown');
 assert.equal(corroborarCantidadMvp291(line(1,'arena','2','bolsones'),
   line(1,'bolsones de arena','2','bag')),'strong');
});
