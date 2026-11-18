import test from 'node:test';
import assert from 'node:assert/strict';
import {elegirRondaUnicaMvp291,correlacionAutomaticaMvp291} from
 '../../supabase/functions/cotironda-piloto-whapi/supplier-auto-correlation-contextual-v2.ts';

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
