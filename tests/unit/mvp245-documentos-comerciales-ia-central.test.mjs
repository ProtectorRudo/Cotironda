import test from 'node:test';
import assert from 'node:assert/strict';
import {
 fuenteDeDocumentoMvp245,procesarDocumentoCentralMvp245
} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-document-mvp245.ts';
import {compararPorRubroMvp225}
 from '../../src/domain/ia-central/calificador-cotizaciones-mvp225.ts';

const H='9'.repeat(64),C='2'.repeat(64),SHA='b'.repeat(64);
const draft={
 status:'review_required',kind:'supplier_quote',
 delivery_city:null,requested_delivery_note:'Moneda: ARS',
 lines:[{
  original_description:'Cemento CPC 50 kg',quantity:'20',
  unit:'bolsas',unit_price:'AR$ 8.900',
  line_total:'AR$ 178.000',evidence_location:'página 1, fila 3',
  ambiguity:null
 }],
 total_declared:'AR$ 178.000',unanswered:[]
};
const check={
 state:'source_text_covered',reason:'covered',lines:1,
 sourceSha256:SHA,sourceVerified:false,
 publicationAllowed:false,rankingAllowed:false
};
const args={mime:'application/pdf',sha256:SHA,draft,comprobacion:check};
const pedido=[{id:'item_1',descripcion:'Cemento CPC 50 kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'}];
const setup=(extra={})=>{
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_ia_reserve_media_mvp245')
   return {data:{state:'reserved',source_sha256:SHA,items:pedido},error:null};
  if(name==='cotironda_piloto_ia_finish_quote_mvp227')
   return {data:{state:'saved_private'},error:null};
  throw Error('Unexpected RPC '+name);
 };
 const run=async (other={})=>
  procesarDocumentoCentralMvp245({
   ...args,habilitado:true,webhookAutenticado:true,
   messageHmac:H,chatHmac:C,apiKey:'sk-'+'z'.repeat(30),
   model:'gpt-6-luna',rpc,
   interpretar:async ({fuente,pedido})=>{
    const l=fuente.split('\n')[0];
    const oferta={etiquetaAnonima:'Presupuesto privado',fuente,
     moneda:'ARS',iva:'no_informado',flete:'no_informado',pago:'no_informado',
     lineas:[{numero:1,descripcion:'Cemento CPC 50 kg',cantidad:'20',
       unidad:'bag',precioUnitarioLiteral:'AR$ 8.900',
       totalLineaLiteral:'AR$ 178.000',textoOriginal:l,tipo:'material'}],
     vinculos:[{lineaOferta:1,articuloPedido:'item_1',
       equivalencia:'misma_presentacion',explicacion:'mismo CPC y peso'}]
    };
    const cobertura=compararPorRubroMvp225(pedido,[oferta]);
    return {estado:'interpretada_para_revision',motivo:'double_checked',
     oferta,cobertura};
   },...other
  });
 return {calls,run};
};

test('MVP245: puente documental conserva monto, cantidad y nota sin recalcular',()=>{
 const text=fuenteDeDocumentoMvp245(args);
 assert.equal(typeof text,'string');
 assert.ok(text.includes('20 bolsas Cemento CPC 50 kg unitario: AR$ 8.900'));
 assert.ok(text.includes('total: AR$ 178.000'));
 assert.ok(text.includes('Moneda: ARS'));
 assert.ok(text.includes('TOTAL GENERAL AR$ 178.000'));
 assert.ok(!text.includes('página 1, fila'));
});
test('MVP245: únicamente archivo con fuente, líneas y hash corroborados',()=>{
 for(const changes of [
  {sha256:'a'.repeat(64)},
  {comprobacion:{...check,state:'needs_source_review'}},
  {comprobacion:{...check,sourceSha256:'a'.repeat(64)}},
  {comprobacion:{...check,lines:2}},
  {mime:'image/jpeg'},
  {mime:'application/msword'},
  {mime:'application/vnd.ms-excel'},
  {draft:{...draft,unanswered:['cell blurry']}},
  {draft:{...draft,lines:[{...draft.lines[0],ambiguity:'blurred'}]}},
  {draft:{...draft,lines:[{...draft.lines[0],quantity:null}]}},
  {draft:{...draft,lines:[{...draft.lines[0],original_description:'Cemento AR$ 8.900'}]}}
 ]){
  assert.equal(fuenteDeDocumentoMvp245({...args,...changes}),null,
   JSON.stringify(changes).slice(0,140));
 }
});
test('MVP246: notas comerciales multilínea se conservan sin cortes',()=>{
 const extra={...draft,requested_delivery_note:
  'IVA no incluido\\nFlete a convenir\\nPago por transferencia'.replaceAll('\\n','\n')};
 const source=fuenteDeDocumentoMvp245({...args,draft:extra});
 assert.equal(typeof source,'string');
 assert.ok(source.includes('IVA no incluido\nFlete a convenir'));
 assert.ok(source.includes('Pago por transferencia'));
 const invalid={...draft,requested_delivery_note:'IVA incluido\u0000Flete gratis'};
 assert.equal(fuenteDeDocumentoMvp245({...args,draft:invalid}),null);
});
test('MVP247: flete con precio total sin unitario, descuento y pallet sin cargo',()=>{
 const cargo={
  ...draft,
  lines:[...draft.lines,
   {original_description:'Flete hasta la obra',
    quantity:null,unit:null,unit_price:null,line_total:'AR$ 15.000',
    evidence_location:'página 1, fila 4',ambiguity:null},
   {original_description:'Descuento especial',
    quantity:null,unit:null,unit_price:null,line_total:'-AR$ 3.000',
    evidence_location:'página 1, fila 5',ambiguity:null},
   {original_description:'Pallet retornable sin cargo',
    quantity:null,unit:null,unit_price:null,line_total:null,
    evidence_location:'página 1, fila 6',ambiguity:null}
  ],total_declared:'AR$ 190.000'
 };
 const text=fuenteDeDocumentoMvp245({...args,draft:cargo,
   comprobacion:{...check,lines:4}});
 assert.equal(typeof text,'string');
 assert.ok(text.includes('Flete hasta la obra total: AR$ 15.000'));
 assert.ok(text.includes('Descuento especial total: -AR$ 3.000'));
 assert.ok(text.includes('Pallet retornable sin cargo'));
 assert.equal(text.includes('Flete hasta la obra unitario:'),false);
 assert.equal(text.includes('Pallet retornable sin cargo total:'),false);
 assert.ok(text.includes('TOTAL GENERAL AR$ 190.000'));
});
test('MVP247: material con solo total se conserva sin crear precio unitario',()=>{
 const pricedOnlyTotal={...draft,
  lines:[{...draft.lines[0],unit_price:null}]};
 const text=fuenteDeDocumentoMvp245({...args,draft:pricedOnlyTotal});
 assert.equal(typeof text,'string');
 assert.ok(text.includes('total: AR$ 178.000'));
 assert.equal(text.includes('unitario:'),false);
});
test('MVP249: cantidad 40,00 con precio explícito y unidad omitida es válida',()=>{
 const quantityWithoutUnit={...draft,lines:[{
  ...draft.lines[0],quantity:'40,00',unit:null,
  original_description:'Cemento CPC 25 kg'
 }]};
 const text=fuenteDeDocumentoMvp245({...args,draft:quantityWithoutUnit});
 assert.equal(typeof text,'string');
 assert.ok(text.includes('40,00 Cemento CPC 25 kg unitario: AR$ 8.900'));
});
test('MVP247: no inventar precio unitario si falta unidad o cantidad',()=>{
 for(const changes of [
  {quantity:null,unit:'bolsa',unit_price:'AR$ 100'},
  {quantity:null,unit:null,unit_price:'AR$ 100'}
 ]){
  const malformed={...draft,lines:[
   {...draft.lines[0],...changes}]};
  assert.equal(fuenteDeDocumentoMvp245({...args,draft:malformed}),null);
 }
});
test('MVP245: soporta PDF, XLSX, DOCX, CSV y TXT corroborados',()=>{
 for(const mime of [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','text/csv'
 ]){
  assert.ok(fuenteDeDocumentoMvp245({...args,mime}),mime);
 }
});
test('MVP245: análisis PDF en ronda exacta y proyección privada anónima',async()=>{
 const {run,calls}=setup();
 const r=await run();
 assert.equal(r.estado,'verificado_privado');
 assert.equal(r.whatsappEnviado,false);
 assert.deepEqual(calls.map(x=>x.name),[
  'cotironda_piloto_ia_reserve_media_mvp245',
  'cotironda_piloto_ia_finish_quote_mvp227'
 ]);
 assert.equal(calls[0].p.p_source_sha256,SHA);
 assert.equal(calls[0].p.p_line_count,1);
 assert.equal(calls[1].p.p_state,'verified');
 const summary=calls[1].p.p_summary;
 assert.equal(summary.rubros[0].rubro,'obra_gruesa');
 assert.equal(summary.precios[0].centavos,'17800000');
 assert.equal(summary.rubros[0].respondidos,1);
 assert.equal(JSON.stringify(summary).includes('Cemento CPC'),false);
 assert.equal(JSON.stringify(summary).includes(SHA),false);
 assert.equal(JSON.stringify(summary).includes(H),false);
});
test('MVP245: flag OFF / hash inválido evita SQL e IA',async()=>{
 const {run,calls}=setup();
 for(const changes of [
  {habilitado:false},{webhookAutenticado:false},{messageHmac:'bad'},
  {comprobacion:{...check,sourceSha256:'a'.repeat(64)}},
  {mime:'image/png'}
 ]){
  const r=await run(changes);
  assert.ok(['apagado','no_aplica','requiere_revision'].includes(r.estado));
 }
 assert.equal(calls.length,0);
});
test('MVP245: reserva duplicada nunca vuelve a consumir tokens',async()=>{
 let analyzed=0;
 const r=await procesarDocumentoCentralMvp245({
  ...args,habilitado:true,webhookAutenticado:true,
  messageHmac:H,chatHmac:C,
  apiKey:'sk-'+'x'.repeat(30),model:'gpt-6-luna',
  rpc:async()=>({data:{state:'already_reserved'},error:null}),
  interpretar:async()=>{analyzed++;throw Error('should not run')}
 });
 assert.equal(r.estado,'ya_procesado');
 assert.equal(analyzed,0);
});
test('MVP245: SQL fuente/identidad distinta no usa el resultado del modelo',async()=>{
 const {run,calls}=setup();
 const r=await run({rpc:async(name,p)=>{
  calls.push({name,p});
  return {data:{state:'reserved',source_sha256:'a'.repeat(64),items:pedido},error:null};
 }});
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(calls.length,2);
 assert.equal(calls[1].p.p_state,'review');
 assert.equal(calls[1].p.p_summary,null);
});
test('MVP245: cálculo inconciliable conserva fuente en revisión',async()=>{
 const {run,calls}=setup();
 const result=await run({interpretar:async()=>({
  estado:'requiere_revision',motivo:'primera_lectura_sin_fuente',
  oferta:null,cobertura:null
 })});
 assert.equal(result.estado,'requiere_revision');
 assert.equal(calls[1].p.p_state,'review');
 assert.equal(calls[1].p.p_summary,null);
});
test('MVP245: no se mezcla pedido del proveedor ni existe salida WhatsApp',async()=>{
 const {run,calls}=setup();
 const result=await run({rpc:async(name,p)=>{
  calls.push({name,p});
  return {data:{state:'not_eligible'},error:null};
 }});
 assert.equal(result.estado,'no_aplica');
 assert.equal(calls.length,1);
 assert.equal(result.whatsappEnviado,false);
});
