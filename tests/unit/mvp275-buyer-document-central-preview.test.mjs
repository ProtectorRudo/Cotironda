import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {previsualizarDocumentoCompradorMvp275}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-document-mvp275.ts';

const H='a'.repeat(64),C='b'.repeat(64);
const ORIGINAL=[
 'PEDIDO DE MATERIALES',
 '20 bolsas Cemento CPC 50 kg',
 '15 m Cable unipolar 2,5 mm2',
 'Entrega: La Plata'
].join('\n');
const SHA=x=>createHash('sha256').update(x).digest('hex');
function file(text=ORIGINAL,mime='text/plain'){
 const bytes=new TextEncoder().encode(text);
 return {mime,bytes,sha256:SHA(bytes)};
}
function reading(changes={}){
 return {
  status:'review_required',kind:'buyer_request',
  delivery_city:'La Plata',requested_delivery_note:null,
  total_declared:null,unanswered:[],lines:[
   {original_description:'Cemento CPC 50 kg',
    quantity:'20',unit:'bolsas',
    unit_price:null,line_total:null,evidence_location:'línea 2',
    ambiguity:null},
   {original_description:'Cable unipolar 2,5 mm2',
    quantity:'15',unit:'m',
    unit_price:null,line_total:null,evidence_location:'línea 3',
    ambiguity:null}
  ],...changes
 };
}
function run(overrides={}){
 const calls=[];
 const planned={estado:'plan_validado_sin_envio',
  motivo:'readonly',pedido:{zona_entrega:'La Plata',articulos:[{id:'x'}]},
  ruteo:{estado:'ruteo_valido_para_preparacion',propuestas:[{proveedor:'x'}]},
  catalogos:[],whatsappEnviado:false,baseModificada:false};
 const options={
  habilitado:true,webhookAutenticado:true,participanteComprador:true,
  messageHmac:H,chatHmac:C,original:file(),
  primera:reading(),segunda:reading(),apiKey:'TEST_NO_CREDENTIALS',
  model:'gpt-6-luna',
  rpc:async(name,params)=>{
   calls.push({name,params});
   if(name!=='cotironda_piloto_ia_catalogo_mvp220')
    throw Error('write RPC should never be called');
   return {data:{},error:null};
  },
  planificar:async params=>{
   calls.push({name:'planner',params});
   return planned;
  },...overrides
 };
 return {calls,execute:()=>previsualizarDocumentoCompradorMvp275(options)};
}
const assertNoSideEffects=(result)=>{
 assert.equal(result.rondaCreada,false);
 assert.equal(result.whatsappEnviado,false);
 assert.equal(result.autorizacionPublicacion,false);
 assert.equal(result.datosComercialesExpuestos,false);
};
test('MVP275: literal TXT original, two readings, readonly plan, never dispatch',async()=>{
 const {execute,calls}=run();
 const r=await execute();
 assert.equal(r.estado,'plan_privado_validado');
 assert.equal(r.fuenteOriginalVerificada,true);
 assert.equal(r.lecturasConcordantes,true);
 assertNoSideEffects(r);
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'planner');
 assert.equal(calls[0].params.textoOriginal,ORIGINAL);
 assert.equal(calls[0].params.autenticadoPorWebhook,true);
 assert.equal(calls[0].params.messageHmac,H);
});
test('MVP275: CSV preserves exactly same source bytes for planner',async()=>{
 const csv='Descripción,Cantidad,Unidad\n'+
  'Cemento CPC 50 kg,20,bolsas\n"Cable unipolar 2,5 mm2",15,m\n'+
  'Entrega: La Plata';
 const {execute,calls}=run({
  original:file(csv,'text/csv')
 });
 const r=await execute();
 assert.equal(r.estado,'plan_privado_validado');
 assert.equal(calls[0].params.textoOriginal,csv);
});
test('MVP275: CSV unquoted comma in technical dimension cannot fabricate cells',async()=>{
 const invalid='Descripción,Cantidad,Unidad\n'+
  'Cemento CPC 50 kg,20,bolsas\nCable unipolar 2,5 mm2,15,m\n'+
  'Entrega: La Plata';
 const {execute,calls}=run({original:file(invalid,'text/csv')});
 const r=await execute();
 assert.equal(r.estado,'requiere_revision');
 assert.equal(calls.length,0);
});
test('MVP275: disabled or unconsented cannot contact AI or query catalogue',async()=>{
 for(const delta of [
  {habilitado:false},{webhookAutenticado:false},
  {participanteComprador:false},{messageHmac:'no'},
  {chatHmac:'bad'},{model:'unauthorized'}
 ]){
  const {execute,calls}=run(delta);
  const r=await execute();
  assert.ok(['apagado','no_aplica'].includes(r.estado));
  assertNoSideEffects(r);
  assert.equal(calls.length,0);
 }
});
test('MVP275: PDF/Excel/Word/image cannot inherit TXT source verification',async()=>{
 const examples=[
  'application/pdf','image/jpeg','image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
 ];
 for(const mime of examples){
  const {execute,calls}=run({original:file(ORIGINAL,mime)});
  const r=await execute();
  assert.equal(r.estado,'requiere_revision',mime);
  assert.equal(r.codigo,'independent_binary_reader_missing');
  assertNoSideEffects(r);
  assert.equal(calls.length,0);
 }
});
test('MVP275: incorrect binary digest, invalid UTF8 and control chars',async()=>{
 for(const original of [
  {...file(),sha256:'f'.repeat(64)},
  {...file(),bytes:new Uint8Array([0xc3,0x28,0xff,0x00,
   ...new TextEncoder().encode(ORIGINAL)])},
  file(ORIGINAL+'\u0000'),
  file('A'.repeat(5000)),
  file('tiny')
 ]){
  const {execute,calls}=run({original});
  const r=await execute();
  assert.equal(r.estado,'requiere_revision');
  assertNoSideEffects(r);
  assert.equal(calls.length,0);
 }
});
test('MVP275: conflicting independent readings deny any AI planning',async()=>{
 for(const second of [
  null,reading({kind:'supplier_quote'}),reading({unanswered:['duda']}),
  reading({lines:reading().lines.slice(0,1)}),
  reading({lines:reading().lines.map((row,i)=>
   i===0?{...row,quantity:'200'}:row)}),
  reading({requested_delivery_note:'hay descuento'}),
  reading({delivery_city:'Berisso'})
 ]){
  const {execute,calls}=run({segunda:second});
  const r=await execute();
  assert.equal(r.estado,'requiere_revision');
  assertNoSideEffects(r);
  assert.equal(calls.length,0);
 }
});
test('MVP275: prevent quantity ambiguity, missing units and phantom materials',async()=>{
 for(const first of [
  reading({lines:[{...reading().lines[0],quantity:'2'},reading().lines[1]]}),
  reading({lines:[{...reading().lines[0],unit:'cajas'},reading().lines[1]]}),
  reading({lines:[{...reading().lines[0],original_description:'Arena fina'},reading().lines[1]]}),
  reading({lines:[{...reading().lines[0],ambiguity:'blurred'},reading().lines[1]]}),
  reading({lines:[{...reading().lines[0],quantity:null},reading().lines[1]]})
 ]){
  const {execute,calls}=run({primera:first,segunda:first});
  const r=await execute();
  assert.equal(r.estado,'requiere_revision');
  assert.equal(calls.length,0);
 }
});
test('MVP275: no locality in original means no inferred delivery city',async()=>{
 const noCity='20 bolsas Cemento CPC 50 kg\n15 m Cable unipolar 2,5 mm2';
 const {execute,calls}=run({original:file(noCity)});
 const r=await execute();
 assert.equal(r.estado,'requiere_zona');
 assert.equal(r.codigo,'delivery_city_missing_from_original');
 assert.equal(calls.length,0);
});
test('MVP275: readonly RPC wrapper rejects writes even if planner tries',async()=>{
 const {execute,calls}=run({planificar:async args=>{
  await args.rpc('cotironda_piloto_ia_shadow_prepare_mvp221',{
   p_buyer_chat_hmac:H
  });
  return {estado:'plan_validado_sin_envio',
   whatsappEnviado:false,baseModificada:false};
 }});
 const r=await execute();
 assert.equal(r.estado,'plan_privado_rechazado');
 assert.equal(r.codigo,'readonly_planner_unavailable');
 assertNoSideEffects(r);
 assert.equal(calls.length,0);
});
test('MVP275: planner cannot claim sent messages or modified database',async()=>{
 for(const claimed of [{whatsappEnviado:true},{baseModificada:true}]){
  const {execute}=run({planificar:async()=>({
   estado:'plan_validado_sin_envio',
   pedido:{zona_entrega:'La Plata',articulos:[{}]},
   ruteo:{estado:'ruteo_valido_para_preparacion',propuestas:[]},
   whatsappEnviado:false,baseModificada:false,...claimed
  })});
  const r=await execute();
  assert.equal(r.estado,'plan_privado_rechazado');
  assertNoSideEffects(r);
 }
});
test('MVP275: webhook preview is opt-in, mutually exclusive from old document preparation',()=>{
 const code=readFileSync(new URL(
  '../../supabase/functions/cotironda-piloto-whapi/index.ts',
  import.meta.url),'utf8');
 const a=code.indexOf("if(proposal.kind==='buyer_request'&&!verifiedSupplier){");
 const b=code.indexOf("}else if(proposal.kind==='supplier_quote'){",a);
 assert.ok(a>0&&b>a);
 const branch=code.slice(a,b);
 assert.match(branch,/COTIRONDA_PILOT_BUYER_DOCUMENT_CENTRAL_PREVIEW_ENABLED/u);
 assert.match(branch,/if\(centralConfigured&&/u);
 assert.match(branch,/previsualizarDocumentoCompradorMvp275\(/u);
 // Legacy publisher must remain in ELSE branch only.
 assert.match(branch,/\}else\{\s*const plan=await db\.rpc\('cotironda_piloto_plan_document_mvp098'/u);
 assert.match(branch,/preparedDocumentSourceHmac=messageHash/u);
 assert.doesNotMatch(branch,/despacharSolicitudCentralMvp223\(/u);
});
