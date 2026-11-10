import test from 'node:test';
import assert from 'node:assert/strict';
import {prepararPlanesPrivadosMvp197 as plan} from
 '../../supabase/functions/cotironda-piloto-finalistas/plan-only-mvp197.ts';

const RID='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const source=()=>({
 state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
 requestItems:[{
  id:'item_001',descripcionLiteral:'cemento CPC 50 kg',
  cantidad:'20.000',unidad:'bag',familia:'cemento_gris_obra'
 }],
 quotations:[{
  doc:{
   requestId:RID,anonId:'anon_private',
   messageHmac:'b'.repeat(64),sourceSha256:'a'.repeat(64),
   declaredTotalLiteral:'$ 200,00',
   lineas:[{lineNo:1,descriptionLiteral:'CEMENTO CPC 50 KG',
    quantityLiteral:'20',unitLiteral:null,
    unitPriceLiteral:'$ 10,00',lineTotalLiteral:'$ 200,00'}],
   prueba:{requestId:RID,messageHmac:'b'.repeat(64),
    sourceSha256:'a'.repeat(64),version:9,state:'verified',
    reason:'covered',lineCount:1,sumLineCents:'20000',
    declaredTotalCents:'20000',rankingAllowed:false,
    revisionVigente:true,cotizacionVigente:true}
  },
  fuente:{requestId:RID,messageHmac:'b'.repeat(64),
   sourceSha256:'a'.repeat(64),state:'source_checked',rankingAllowed:false,
   sourceImmutabilityPreserved:true,lines:[{
    lineNo:1,unitStatus:'not_explicit',unit:null,presentation:'none',
    page:1,row:1
   }]
  },
  economia:{state:'source_checked',sourceSha256:'a'.repeat(64),
   rankingAllowed:false,
   descuentos:{estado:'descuentos_conciliados_sin_iva',precios:[{
    linea:1,pagina:1,fila:1,
    estado:'importe_sin_ajuste_conciliado',
    unitarioComercialTrasDescuento:'10.00'
   }]},
   condiciones:{iva:{estado:'no_informado'},flete:{estado:'a_convenir'},
    pago:{estado:'no_informado'},rankingHabilitado:false,
    stockCorroborado:false}
  }
 }]
});
const due=(rounds)=>({data:{state:'candidate_due',rounds},error:null});
const round=(input=source())=>({closureChecked:true,requestId:RID,privateInputs:input});

test('MVP197: sin rondas: 0 planes, 0 WhatsApps, sin llamar RPC de aviso',async()=>{
 const invoked=[];
 const result=await plan(async (n,args)=>{
  invoked.push([n,args]);
  return due([]);
 });
 assert.deepEqual(invoked,[['cotironda_piloto_commercial_due_mvp196',{p_limit:10}]]);
 assert.deepEqual(result,{
  state:'planned_no_whatsapp',plans_created:0,
  without_unique_commercial_plan:0,api_accepted:0,uncertain:0,
  details_exposed:false
 });
});
test('MVP197: una ronda v9 completa genera un plan privado vinculado y NUNCA WhatsApp',async()=>{
 const seen=[];
 const result=await plan(async (name,args)=>{
  seen.push(name);
  if(name==='cotironda_piloto_commercial_due_mvp196')return due([round()]);
  if(name==='cotironda_piloto_commit_commercial_plan_mvp196'){
   assert.equal(args.p_request,RID);
   assert.equal(args.p_mode,'one_complete_alternative');
   assert.deepEqual(args.p_sources.map(x=>x.oferta),['oferta_001']);
   assert.deepEqual(args.p_sources.map(x=>x.matches),
    [[{itemId:'item_001',lineNo:1}]]);
   assert.equal(args.p_sources[0].messageHmac,'b'.repeat(64));
   return {data:{state:'planned'},error:null};
  }
  throw Error('unexpected_rpc_'+name);
 });
 assert.deepEqual(seen,['cotironda_piloto_commercial_due_mvp196',
  'cotironda_piloto_commit_commercial_plan_mvp196']);
 assert.equal(result.state,'planned_no_whatsapp');
 assert.equal(result.plans_created,1);
 assert.equal(result.api_accepted,0);
 assert.equal(result.uncertain,0);
 const output=JSON.stringify(result);
 for(const privateValue of [RID,'b'.repeat(64),'a'.repeat(64),'CEMENTO','200.00',
  'supplier_key','messageHmac','sourceSha256'])
  assert.equal(output.includes(privateValue),false,privateValue);
});
test('MVP197: plan ya escrito no genera doble aviso ni segundo plan',async()=>{
 const result=await plan(async n=>n==='cotironda_piloto_commercial_due_mvp196'?
  due([round()]):{data:{state:'already_planned'},error:null});
 assert.equal(result.state,'planned_no_whatsapp');
 assert.equal(result.plans_created,0);
});
test('MVP197: fuente incompleta o inexacta bloquea sin seleccionar a nadie',async()=>{
 for(const modify of [
  x=>{x.quotations[0].doc.prueba.version=8},
  x=>{x.quotations[0].economia.descuentos.precios[0]
   .unitarioComercialTrasDescuento='999.00'},
  x=>{x.quotations[0].fuente.lines[0].page=null},
  x=>{x.quotations[0].doc.prueba.revisionVigente=false}
 ]){
  const s=source();modify(s);
  const names=[];
  const result=await plan(async n=>{
   names.push(n);
   return due([round(s)]);
  });
  assert.equal(result.state,'verified_source_invalid');
  assert.deepEqual(names,['cotironda_piloto_commercial_due_mvp196']);
  assert.equal(result.plans_created,0);
 }
});
test('MVP197: una oferta de otra familia no se elige pero conserva la ronda',async()=>{
 const x=source();x.quotations[0].doc.lineas[0].descriptionLiteral='piedra';
 const names=[];
 const result=await plan(async n=>{names.push(n);return due([round(x)])});
 assert.equal(result.state,'planned_no_whatsapp');
 assert.equal(result.plans_created,0);
 assert.equal(result.without_unique_commercial_plan,1);
 assert.deepEqual(names,['cotironda_piloto_commercial_due_mvp196']);
});
test('MVP197: proveedor parcial no fabrica cobertura total ni segundo destinatario',async()=>{
 const s=source();
 s.requestItems.push({id:'item_002',descripcionLiteral:'hidrófugo',
  cantidad:'5.000',unidad:'l',familia:'hidrofugo'});
 const names=[];
 const result=await plan(async n=>{names.push(n);return due([round(s)])});
 assert.equal(result.state,'planned_no_whatsapp');
 assert.equal(result.without_unique_commercial_plan,1);
 assert.deepEqual(names,['cotironda_piloto_commercial_due_mvp196']);
});
test('MVP197: fecha, request, duplicado o shape falsos nunca quedan planificados',async()=>{
 for(const rounds of [
  [{...round(),closureChecked:false}],
  [{...round(),requestId:'otra-ronda'}],
  [round(),round()],
  [{...round(),privateInputs:null}],
  [{...round(),requestId:'../../pilot'}],
  Array.from({length:11},()=>round()),
  null
 ]){
  const name=[];
  const result=await plan(async n=>{
   name.push(n);
   return n==='cotironda_piloto_commercial_due_mvp196'?
    due(rounds):{data:{state:'planned'},error:null};
  });
  assert.ok(result.state==='verified_round_invalid'||
   result.state==='verified_planner_unavailable',result.state);
  assert.deepEqual(name,['cotironda_piloto_commercial_due_mvp196']);
 }
});
test('MVP197: si SQL falla o rechaza commit, no hay éxito ficticio',async()=>{
 for(const reply of [
  {data:null,error:{code:'SQL_FAIL'}},
  {data:{state:'source_revision_changed'},error:null},
  {data:{state:'not_eligible'},error:null}
 ]){
  const result=await plan(async name=>
   name==='cotironda_piloto_commercial_due_mvp196'?due([round()]):reply);
  assert.equal(result.state,'verified_plan_rejected');
 }
});
test('MVP197: fallo de red o función ausente falla cerrado sin datos de proveedor',async()=>{
 const result=await plan(async ()=>{throw Error('source token private error')});
 assert.equal(result.state,'verified_planner_unavailable');
 assert.equal(JSON.stringify(result).includes('private error'),false);
});
