import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resumirCoberturaCompradorMvp175 as summarize} from
 '../../src/domain/resumen-cobertura-comprador-mvp175.ts';

const STATUS={state:'waiting',can_open:true};
const make=(kind='aridos')=>{
 const requestId='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
 const requested=kind==='aridos'
 ?[
  {id:'item_001',descripcionLiteral:'arena fina',cantidad:'1.000',unidad:'m3',familia:'arena_fina'},
  {id:'item_002',descripcionLiteral:'piedra partida',cantidad:'2.000',unidad:'m3',familia:'piedra_partida'},
  {id:'item_003',descripcionLiteral:'cemento CPC 50 kg',cantidad:'20.000',unidad:'bag',familia:'cemento_gris_obra'}
 ]:[
  {id:'item_001',descripcionLiteral:'cemento gris 25 kg',cantidad:'25.000',unidad:'bag',familia:'cemento_gris_obra'},
  {id:'item_002',descripcionLiteral:'hidrófugo',cantidad:'5.000',unidad:'l',familia:'hidrofugo'}
 ];
 const variants=kind==='aridos'
 ?[
   [['BIG BAG de arena','1'],['BIG BAG de piedra','2'],['cemento CPC 50 kg','20']],
   [['BIG BAG de arena','1'],['BIG BAG de piedra','2'],['cemento Avellaneda 25 kg','40']]
  ]:[
   [['cemento Avellaneda 25 kg','25'],['Sinteplast Hidrofugo 5lts','1']],
   [['cemento Avellaneda 25 kg','25'],['HIDROFUGO EN PASTA','5']]
  ];
 const quotes=variants.map((group,index)=>{
  const hmac=String(index?'b':'a').repeat(64);
  const sha=String(index?'d':'c').repeat(64);
  const lineas=group.map(([descriptionLiteral,quantityLiteral],i)=>({
   lineNo:i+1,descriptionLiteral,quantityLiteral,
   unitLiteral:null,unitPriceLiteral:'$10,00',
   lineTotalLiteral:'$'+String(Number(quantityLiteral)*10)+',00'
  }));
  const total=group.reduce((a,[_d,n])=>a+Number(n)*10,0);
  const cents=String(total*100);
  return {
   doc:{
    requestId,anonId:'anon_private',messageHmac:hmac,sourceSha256:sha,
    declaredTotalLiteral:'$'+String(total)+',00',lineas,
    prueba:{requestId,messageHmac:hmac,sourceSha256:sha,
     version:9,state:'verified',reason:'covered',
     lineCount:lineas.length,sumLineCents:cents,declaredTotalCents:cents,
     rankingAllowed:false,revisionVigente:true,cotizacionVigente:true}
   },
   fuente:{
    requestId,messageHmac:hmac,sourceSha256:sha,state:'source_checked',
    rankingAllowed:false,sourceImmutabilityPreserved:true,
    lines:lineas.map(x=>({
     lineNo:x.lineNo,unitStatus:'not_explicit',unit:null,page:1,row:x.lineNo+3,
     presentation:x.descriptionLiteral.startsWith('BIG BAG')?'big_bag':'none'
    }))
   },
   economia:{
    state:'source_checked',sourceSha256:sha,rankingAllowed:false,
    descuentos:{estado:'source_checked',precios:lineas.map(()=>({}))},
    condiciones:{iva:{estado:'no_informado'},flete:{estado:'a_convenir'},
     pago:{estado:'no_informado'},rankingHabilitado:false,stockCorroborado:false}
   }
  };
 });
 return {state:'private_inputs',rankingAllowed:false,contactsRevealed:false,
  requestItems:requested,quotations:quotes};
};

test('MVP175: primera ronda 3 artículos x 2 ofertas, 6 alternativas comerciales',()=>{
 const result=summarize(STATUS,make('aridos'));
 assert.deepEqual(result,{
  state:'cobertura_revisada',quotations:2,requested_items:3,comparisons:6,
  commercial_alternatives:6,packaging_unproven:0,not_evaluated:0,
  explicit_differences:0,technical_uncertainty:0,
  ranking_allowed:false,price_comparable:false,contacts_revealed:false
 });
});
test('MVP175: segunda ronda 2 artículos x 2 ofertas, 3 alternativas y 1 envase sin litros',()=>{
 const result=summarize({state:'closed',can_open:true},make('hidrofugo'));
 assert.equal(result?.quotations,2);
 assert.equal(result?.comparisons,4);
 assert.equal(result?.commercial_alternatives,3);
 assert.equal(result?.packaging_unproven,1);
 assert.equal(result?.price_comparable,false);
});
test('MVP175: nunca revela HMAC, documento, monto, teléfono ni identidad del negocio',()=>{
 const x=make('hidrofugo'),s=JSON.stringify(summarize(STATUS,x));
 assert.ok(s.length<600);
 for(const word of [
  x.quotations[0].doc.messageHmac,
  x.quotations[1].doc.sourceSha256,
  'Sinteplast','Avellaneda','BIG BAG','100,00','requestId',
  'fuente','original','whatsapp','contactos','telefono'
 ]) assert.ok(!s.includes(word),word);
});
test('MVP175: enlace no autorizado, vencido, cancelado o sin ofertas aprobadas no muestra cobertura',()=>{
 const payload=make();
 for(const status of [
  null,{state:'not_found',can_open:false},{state:'cancelled',can_open:true},
  {state:'waiting',can_open:false},{state:'closed',can_open:false},
  {state:'unknown',can_open:true}
 ])assert.equal(summarize(status,payload),null);
});
test('MVP175: ninguna cotización se muestra si cambia su SHA o pierde prueba vigente',()=>{
 for(const mutant of [
  x=>x.quotations[0].economia.sourceSha256='e'.repeat(64),
  x=>x.quotations[0].doc.prueba.revisionVigente=false,
  x=>x.quotations[0].fuente.sourceImmutabilityPreserved=false,
  x=>x.quotations[0].doc.prueba.rankingAllowed=true,
  x=>x.quotations.pop()
 ]){
  const x=make();
  mutant(x);
  if(x.quotations.length===1){
   const r=summarize(STATUS,x);
   assert.equal(r?.quotations,1);
   continue;
  }
  assert.equal(summarize(STATUS,x),null);
 }
});
test('MVP175: error o estado de selector SQL incompleto se omite (sin falsos totales)',()=>{
 for(const state of ['not_found','incomplete_evidence','capacity_or_empty','not_permitted']){
  assert.equal(summarize(STATUS,{state}),null);
 }
 assert.equal(summarize(STATUS,null),null);
});
test('MVP175: status autorizado no es permiso para mostrar una ronda cruzada mal formada',()=>{
 const p=make();p.quotations[1].doc.requestId='another';
 assert.equal(summarize(STATUS,p),null);
});
test('MVP175: sin ranking, sin recomendación, sin originales descargables por simple cotejo',()=>{
 const r=summarize(STATUS,make());
 assert.equal(r?.ranking_allowed,false);
 assert.equal(r?.price_comparable,false);
 assert.equal(r?.contacts_revealed,false);
 assert.equal(Object.hasOwn(r,'supplier'),false);
 assert.equal(Object.hasOwn(r,'finalists'),false);
 assert.equal(Object.hasOwn(r,'originals'),false);
});
test('MVP175: SQL de la RPC usa token hash y ACL service_role, no abre consulta anónima',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp175_buyer_coverage_token_gated.sql',import.meta.url),'utf8');
 assert.match(sql,/security definer/u);
 assert.match(sql,/set search_path=''/u);
 assert.match(sql,/buyer_tracking_mvp091/u);
 assert.match(sql,/t\.token_hash=p_token_hash/u);
 assert.match(sql,/t\.revoked_at is null/u);
 assert.match(sql,/t\.expires_at>v_now/u);
 assert.match(sql,/buyer\.consent_at is not null/u);
 assert.match(sql,/buyer\.opted_out_at is null/u);
 assert.match(sql,/from public,anon,authenticated/u);
 assert.match(sql,/to service_role/u);
 assert.doesNotMatch(sql,/insert into|update\s+cotironda_piloto_privado|delete from|whapi_outbox/iu);
});
test('MVP175: el Edge NO reenvía el documento privado en su respuesta',()=>{
 const code=readFileSync(new URL('../../supabase/functions/cotironda-piloto-seguimiento/index.ts',import.meta.url),'utf8');
 assert.match(code,/cotironda_piloto_buyer_coverage_inputs_mvp175/u);
 assert.match(code,/resumirCoberturaCompradorMvp175\(publicResult,source\.data\)/u);
 assert.match(code,/if\(safe\)publicResult=\{\.\.\.publicResult,coverage:safe\}/u);
 assert.doesNotMatch(code,/publicResult=\{\.\.\.publicResult,coverage:source\.data\}/u);
});
test('MVP175: UI protege la presentación si falta permiso, muestra salvedad y no calcula posiciones',()=>{
 const html=readFileSync(new URL('../../site/seguimiento/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../../site/seguimiento/app.js',import.meta.url),'utf8');
 assert.match(html,/id="coverageSection"/u);
 assert.match(html,/IVA, flete y condiciones/u);
 assert.match(app,/data\?\.can_open !== true/u);
 assert.match(app,/c\.ranking_allowed !== false/u);
 assert.match(app,/c\.comparisons !== c\.quotations \* c\.requested_items/u);
 assert.match(app,/section\.hidden = false/u);
 assert.match(app,/\.textContent\s*=/u);
 assert.doesNotMatch(app,/innerHTML|localStorage|sessionStorage|document\.cookie/u);
});