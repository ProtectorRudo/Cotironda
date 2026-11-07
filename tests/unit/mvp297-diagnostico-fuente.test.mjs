import test from 'node:test';
import assert from 'node:assert/strict';
import {interpretarPresupuestoConIAMvp225} from
 '../../src/domain/ia-central/lector-presupuesto-proveedor-mvp225.ts';
import {diagnosticoPermitidoMvp297,
 diagnosticarLecturaInvalidaMvp297} from
 '../../src/domain/ia-central/diagnostico-fuente-mvp297.ts';
import {procesarPresupuestoCentralMvp227} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';

const pedido=[{id:'cemento_01',descripcion:'Cemento CPC bolsa 50 kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'}];
const fuente='Hola. 20 bolsas de cem CPC 50kg x $8.900 = $178.000. Pallet sin cargo. Moneda: ARS.';
const quote={
 intencion:'presupuesto',moneda:'ARS',monedaEvidencia:'ARS',
 iva:'no_informado',ivaEvidencia:null,flete:'no_informado',
 fleteEvidencia:null,pago:'no_informado',pagoEvidencia:null,
 lineas:[
  {numero:1,textoOriginal:'20 bolsas de cem CPC 50kg x $8.900 = $178.000',
   descripcion:'Cemento CPC 50 kg',cantidad:'20',unidad:'bag',
   precioUnitarioLiteral:'$8.900',totalLineaLiteral:'$178.000',tipo:'material'},
  {numero:2,textoOriginal:'Pallet sin cargo',
   descripcion:'Pallet',cantidad:null,unidad:null,
   precioUnitarioLiteral:null,totalLineaLiteral:null,tipo:'aclaracion'}
 ],
 vinculos:[{lineaOferta:1,articuloPedido:'cemento_01',
  equivalencia:'misma_presentacion',explicacion:'Misma bolsa 50 kg'}]
};
const args={fuente,pedido,etiquetaAnonima:'Presupuesto privado',
 apiKey:'sk-'+'x'.repeat(32),model:'gpt-6-luna'};
function stub(...reads){
 let called=0;
 return {fetchImpl:async()=>{
  called++;
  const r=reads.shift();
  return new Response(JSON.stringify({status:'completed',
   output:[{type:'message',role:'assistant',
    content:[{type:'output_text',text:JSON.stringify(r)}]}]}),{status:200});
 },calls:()=>called};
}
test('valid commercial source still follows EXACT two-read verifier',async()=>{
 const second=structuredClone(quote);
 second.vinculos[0].explicacion='Equivalencia respaldada por original';
 const f=stub(quote,second);
 const res=await interpretarPresupuestoConIAMvp225({...args,fetchImpl:f.fetchImpl});
 assert.equal(f.calls(),2);
 assert.equal(res.estado,'interpretada_para_revision');
 assert.equal(res.motivo,'doble_lectura_con_evidencia');
 assert.equal(res.diagnostico,undefined);
 assert.ok(res.cobertura?.ofertas?.length);
});
test('first invalid price citation reports line_quote_unproven, only ONE call',async()=>{
 const invalid=structuredClone(quote);
 invalid.lineas[0].precioUnitarioLiteral='$1.000';
 const f=stub(invalid);
 const out=await interpretarPresupuestoConIAMvp225({...args,fetchImpl:f.fetchImpl});
 assert.equal(out.estado,'requiere_revision');
 assert.equal(out.motivo,'primera_lectura_sin_fuente'); // backward-compatible
 assert.equal(out.diagnostico,'first_line_quote_unproven');
 assert.equal(out.oferta,null);assert.equal(f.calls(),1);
});
test('wrong IVA state or unfounded evidence is classified without echoing the source',async()=>{
 const wrong=structuredClone(quote);
 wrong.iva='incluido_explicito';
 const out=diagnosticarLecturaInvalidaMvp297(fuente,wrong,['cemento_01'],'first');
 assert.equal(out,'first_iva_unproven');
 assert.equal(diagnosticoPermitidoMvp297(out),true);
 assert.equal(out.includes('cemento'),false);
});
test('missing currency attribution is distinct from IVA or missing amount lines',()=>{
 const missing=structuredClone(quote);
 missing.moneda='USD';
 assert.equal(diagnosticarLecturaInvalidaMvp297(fuente,missing,
  ['cemento_01'],'first'),'first_currency_unproven');
 const omitted=structuredClone(quote);
 const extra=fuente+'\nCargo por pallet $500.';
 assert.equal(diagnosticarLecturaInvalidaMvp297(extra,omitted,
  ['cemento_01'],'first'),'first_commercial_lines_omitted');
});
test('unknown order mapping is private and cannot validate a quote',()=>{
 const wrong=structuredClone(quote);
 wrong.vinculos[0].articuloPedido='pedido_de_otra_empresa';
 assert.equal(diagnosticarLecturaInvalidaMvp297(fuente,wrong,
  ['cemento_01'],'first'),'first_mapping_invalid');
});
test('second invalid citation differs from two VALID but economically discordant reads',async()=>{
 const second=structuredClone(quote);
 second.lineas[0].precioUnitarioLiteral='$9999';
 const f=stub(quote,second);
 const out=await interpretarPresupuestoConIAMvp225({...args,fetchImpl:f.fetchImpl});
 assert.equal(out.motivo,'lecturas_no_coinciden');
 assert.equal(out.diagnostico,'second_line_quote_unproven');
 assert.equal(f.calls(),2);
 const changed=structuredClone(quote);
 changed.lineas[0].cantidad='200';
 const different=stub(quote,changed);
 const out2=await interpretarPresupuestoConIAMvp225({...args,fetchImpl:different.fetchImpl});
 assert.equal(out2.motivo,'lecturas_no_coinciden');
 assert.equal(out2.diagnostico,'readings_disagree');
 assert.equal(different.calls(),2);
});
test('model error carries no raw HTTP payload or prompt',async()=>{
 const r=await interpretarPresupuestoConIAMvp225({...args,
  fetchImpl:async()=>new Response('SECRET RAW ERROR',{status:429})});
 assert.equal(r.diagnostico,'model_or_response_unavailable');
 assert.equal(r.oferta,null);
 assert.equal(JSON.stringify(r).includes('SECRET RAW ERROR'),false);
});
test('only known reason codes can ever be persisted',()=>{
 for(const v of ['source=secret','$120.000','supplier_phone',
  'first_line_quote_unproven\nINJECT','diagnosis_not_preserved;DROP TABLE'])
  assert.equal(diagnosticoPermitidoMvp297(v),false);
 for(const v of ['first_line_quote_unproven','second_iva_unproven',
  'readings_disagree','model_or_response_unavailable'])
  assert.equal(diagnosticoPermitidoMvp297(v),true);
});
test('supplier persists ONLY private diagnostic, no economic summary, no WhatsApp or extra LLM',async()=>{
 const msg='a'.repeat(64),chat='b'.repeat(64),hash='c'.repeat(64);
 const rpcCalls=[];let modelReads=0;
 const out=await procesarPresupuestoCentralMvp227({
  habilitado:true,webhookAutenticado:true,
  messageHmac:msg,chatHmac:chat,
  apiKey:'sk-'+'x'.repeat(24),model:'gpt-6-luna',
  decrypt:async()=>fuente,shaText:async()=>hash,
  rpc:async(name,params)=>{
   rpcCalls.push({name,params});
   if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
    return {data:{state:'reserved',source_sha256:hash,
     nonce:'nonce',ciphertext:'cipher',items:[{
      id:'item_1',descripcion:'Cemento CPC',cantidad:'20',
      unidad:'bag',rubro:'obra_gruesa'}]},error:null};
   if(name==='cotironda_piloto_ia_finish_quote_mvp227')
    return {data:{state:'saved_private'},error:null};
   throw Error('Unexpected DB access');
  },
  interpretar:async()=>{modelReads++;
   return {estado:'requiere_revision',motivo:'primera_lectura_sin_fuente',
    diagnostico:'first_line_quote_unproven',oferta:null,cobertura:null};
  }
 });
 assert.equal(out.estado,'requiere_revision');
 assert.equal(out.whatsappEnviado,false);
 assert.equal(modelReads,1);
 assert.equal(rpcCalls.length,2);
 assert.deepEqual(rpcCalls[1].params,{
  p_message_hmac:msg,p_chat_hmac:chat,
  p_state:'review',p_reason:'first_line_quote_unproven',p_summary:null
 });
});
test('injected diagnosis is rejected and historic generic fallback preserved',async()=>{
 const msg='a'.repeat(64),chat='b'.repeat(64),hash='c'.repeat(64);
 let reason;
 const r=await procesarPresupuestoCentralMvp227({
  habilitado:true,webhookAutenticado:true,messageHmac:msg,chatHmac:chat,
  apiKey:'sk-'+'x'.repeat(24),model:'gpt-6-luna',
  decrypt:async()=>fuente,shaText:async()=>hash,
  rpc:async(name,params)=>{
   if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
    return {data:{state:'reserved',source_sha256:hash,
     nonce:'n',ciphertext:'c',items:[{
      id:'item_1',descripcion:'Cemento',cantidad:'20',
      unidad:'bag',rubro:'obra_gruesa'}]},error:null};
   reason=params.p_reason;
   return {data:{state:'saved_private'},error:null};
  },
  interpretar:async()=>({estado:'requiere_revision',
   motivo:'lecturas_no_coinciden',diagnostico:'SECRET_PRICE_99999',
   oferta:null,cobertura:null})
 });
 assert.equal(r.estado,'requiere_revision');
 assert.equal(reason,'semantic_review_required');
});


test('MVP298: two verified reads may use different descriptions and valid currency citation spans',async()=>{
 const first=structuredClone(quote),second=structuredClone(quote);
 second.lineas[0].descripcion='Cemento Portland Compuesto en bolsas de 50 kg';
 second.monedaEvidencia='Moneda: ARS';
 const f=stub(first,second);
 const out=await interpretarPresupuestoConIAMvp225({...args,fetchImpl:f.fetchImpl});
 assert.equal(f.calls(),2);
 assert.equal(out.estado,'interpretada_para_revision');
 assert.equal(out.motivo,'doble_lectura_con_evidencia');
 assert.equal(out.diagnostico,undefined);
 assert.equal(out.cobertura.ofertas[0].estado,'verificada_para_comparacion');
 assert.equal(out.cobertura.ofertas[0].precios.length,1);
});
test('MVP298: two independent valid quotes can cite different spans proving the same IVA state',async()=>{
 const withIva=fuente+' Precio con IVA, IVA incluido.';
 const first=structuredClone(quote),second=structuredClone(quote);
 first.iva=second.iva='incluido_explicito';
 first.ivaEvidencia='con IVA';
 second.ivaEvidencia='IVA incluido';
 const f=stub(first,second);
 const out=await interpretarPresupuestoConIAMvp225({
  ...args,fuente:withIva,fetchImpl:f.fetchImpl
 });
 assert.equal(f.calls(),2);
 assert.equal(out.estado,'interpretada_para_revision');
 assert.equal(out.cobertura.ofertas[0].estado,'verificada_para_comparacion');
});
test('MVP298: changing the literal unit price still blocks verification even if both amounts exist in the source',async()=>{
 const second=structuredClone(quote);
 second.lineas[0].precioUnitarioLiteral='$178.000';
 // This literal exists in the original, so independent source gates pass.
 // The economic signatures MUST still disagree: never accept ambiguous price.
 const f=stub(quote,second);
 const out=await interpretarPresupuestoConIAMvp225({...args,fetchImpl:f.fetchImpl});
 assert.equal(f.calls(),2);
 assert.equal(out.estado,'requiere_revision');
 assert.equal(out.motivo,'lecturas_no_coinciden');
 assert.equal(out.diagnostico,'readings_disagree');
 assert.equal(out.oferta,null);
});
