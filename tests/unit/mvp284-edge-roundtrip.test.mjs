// MVP284: mismo flujo TypeScript de Edge, con RPC y Whapi simulados.
import test from 'node:test';
import assert from 'node:assert/strict';
import {emitirRevisionCompradorMvp279,confirmarPedidoCompradorMvp279}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-review-mvp279.ts';
import {despacharSolicitudCentralMvp223}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-dispatch-mvp223.ts';
import {procesarPresupuestoCentralMvp227}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';

const rid='e2222222-2222-4222-8222-222222222222';
const lease='a2222222-2222-4222-8222-222222222222';
const h='a'.repeat(64),source='b'.repeat(64),reply='e'.repeat(64);
const authCode='AB12CD34EF56AB78';
const order=[
 {lineNo:1,description:'Cemento CPC 50 kg',quantity:'20',unit:'bag',rubro:'obra_gruesa'},
 {lineNo:2,description:'Látex interior 5 litros',quantity:'5',unit:'l',rubro:'pintura'}
];
const suppliers=['corralon_ailin','corralon_nahuel'];
const clients=['5492215000001','5492215000002'];
const hashes=['1'.repeat(64),'2'.repeat(64)];
test('Edge TypeScript: pedir, confirmar, dos PDFs, dos cotizaciones; replay y privacidad',async()=>{
 const st={reviewIssued:false,reviewSent:false,confirmed:false,published:false,
  sends:[],claims:0,finished:[],quotes:[],aiCalls:0,unexpected:[],calls:[]};
 const encrypted='encrypted_cipher',nonce='encrypted_nonce',quoteHash='c'.repeat(64);
 const sourceQuotes=[
  '20 bolsas de Cemento CPC AR$ 9.000 por unidad total AR$ 180.000',
  '5 litros pintura látex interior AR$ 15.000 en total'
 ];
 const rpc=async(name,p)=>{
  st.calls.push(name);
  switch(name){
   case 'cotironda_piloto_ia_review_issue_mvp279':
    if(st.reviewIssued)return {data:{state:'already_issued'},error:null};
    st.reviewIssued=true;return {data:{state:'issued',request_id:rid,code:authCode,
     city:'La Plata',note:null,items_count:2,items:order},error:null};
   case 'cotironda_piloto_ia_review_delivery_mvp279':
    assert.equal(p.p_status,'api_accepted');
    assert.equal(p.p_whapi_message_id,'review-whapi-001');
    st.reviewSent=true;return {data:{state:'recorded'},error:null};
   case 'cotironda_piloto_ia_review_confirm_mvp279':
    if(!st.reviewSent||st.confirmed||p.p_exact_text!=='CONFIRMAR COTI '+authCode)
     return {data:{state:'not_authorized_or_expired'},error:null};
    st.confirmed=true;return {data:{state:'confirmed',request_id:rid},error:null};
   case 'cotironda_piloto_ia_publish_mvp222':
    if(!st.confirmed) return {data:{state:'buyer_review_required'},error:null};
    st.published=true;return {data:{state:'ready_for_delivery'},error:null};
   case 'cotironda_piloto_ia_claim_mvp222':{
    if(!st.published||st.claims>=2)return {data:{state:'empty'},error:null};
    const index=st.claims++;
    return {data:{state:'leased',request_id:rid,lease_token:lease,
     supplier_key:suppliers[index],chat_hmac:hashes[index]},error:null};
   }
   case 'cotironda_piloto_ia_pdf_snapshot_mvp222':{
    const i=suppliers.indexOf(p.p_supplier);
    if(i<0)throw Error('other supplier');
    return {data:{requestId:rid,city:'La Plata',deadlineIso:'2026-11-13T12:00:00Z',
     deliveryNote:null,items:[{description:order[i].description,
      quantity:order[i].quantity,unit:order[i].unit}]},error:null};
   }
   case 'cotironda_piloto_ia_finish_mvp222':
    assert.ok(p.p_message_id);assert.equal(p.p_state,'api_accepted');
    st.finished.push({supplier:p.p_supplier,id:p.p_message_id});
    return {data:true,error:null};
   case 'cotironda_piloto_ia_reserve_quote_mvp227':{
    const i=st.finished.findIndex(x=>x.supplier===p.p_supplier_key);
    // The mock routes by chat; SQL real association and IDs are
    // independently covered by the PG17 roundtrip.
    const index=hashes.indexOf(p.p_chat_hmac);
    if(index<0||!st.finished.some(x=>x.supplier===suppliers[index]))
     return {data:{state:'not_eligible'},error:null};
    return {data:{state:'reserved',source_sha256:quoteHash,
     nonce,ciphertext:encrypted,items:[{
      id:'item_'+(index+1),descripcion:order[index].description,
      cantidad:order[index].quantity,unidad:order[index].unit,
      rubro:order[index].rubro
     }]},error:null};
   }
   case 'cotironda_piloto_ia_finish_quote_mvp227':
    st.quotes.push(p);return {data:{state:'saved_private'},error:null};
   default:
    st.unexpected.push(name);throw Error('unexpected_rpc:'+name);
  }
 };
 let sentReview='';
 const issue=await emitirRevisionCompradorMvp279({
  habilitado:true,compradorAutenticado:true,chatHmac:h,sourceHmac:source,
  destinatario:'5492215000000@s.whatsapp.net',rpc,
  send:async(to,body)=>{
   assert.equal(to,'5492215000000@s.whatsapp.net');
   sentReview=body;st.sends.push({to,kind:'review'});
   return {accepted:true,messageId:'review-whapi-001'};
  }
 });
 assert.equal(issue.estado,'api_aceptada');
 assert.match(sentReview,/obra gruesa/);assert.match(sentReview,/pintura/);
 assert.equal(st.finished.length,0);
 const decision=await confirmarPedidoCompradorMvp279({
  habilitado:true,liberar:true,compradorAutenticado:true,chatHmac:h,
  replyHmac:reply,textoOriginal:'CONFIRMAR COTI '+authCode,rpc
 });
 assert.equal(decision.estado,'publicado');
 const deliveries=await despacharSolicitudCentralMvp223({
  enabled:true,requestId:rid,rpc,
  recipients:Object.fromEntries(suppliers.map((s,i)=>[s,clients[i]])),
  authorizeChatHmac:async(to,hash)=>{
   const i=hashes.indexOf(hash);return i>=0&&clients[i]===to;},
  createPdf:snapshot=>{
   assert.equal(snapshot.items.length,1);
   return new Uint8Array(200);},
  sendWhapi:async(to,pdf)=>{
   assert.equal(pdf.length,200);st.sends.push({to,kind:'pdf'});
   return {accepted:true,messageId:'whapi-supplier-'+to};}
 });
 assert.equal(deliveries.estado,'terminado');
 assert.equal(deliveries.apiAceptados,2);
 for(const [i,key] of suppliers.entries()){
  const original=sourceQuotes[i];
  const coverage={
   estado:'analisis_por_rubro_sin_adjudicacion',
   ofertas:[{etiquetaAnonima:'Presupuesto privado',
    estado:'verificada_para_comparacion',motivos:[],
    rubros:[{rubro:order[i].rubro,solicitados:1,respondidos:1,
     precioComprobado:1,cobertura:'completa',faltantes:[]}],
    extras:[],precios:[{pedidoId:'item_'+(i+1),numeroOferta:1,
     cantidad:order[i].quantity,unidad:order[i].unit,centavos:BigInt((i+1)*900000)}]
   }],comparables:[],rankingGlobalPermitido:false,
   adjudicacionAutomatica:false,contactosRevelados:false};
  const offer={etiquetaAnonima:'Presupuesto privado',moneda:'ARS',
   iva:'no_informado',flete:'no_informado',pago:'no_informado',
   fuente:original,lineas:[],vinculos:[]};
  const result=await procesarPresupuestoCentralMvp227({
   habilitado:true,webhookAutenticado:true,messageHmac:(i+3).toString(16).repeat(64),
   chatHmac:hashes[i],apiKey:'sk-'+'x'.repeat(22),model:'gpt-6-luna',
   rpc,decrypt:async()=>original,shaText:async()=>quoteHash,
   interpretar:async()=>{st.aiCalls++;return{
    estado:'interpretada_para_revision',motivo:'lectura_test',
    oferta:offer,cobertura:coverage};
   }
  });
  assert.equal(result.estado,'verificado_privado',key+':'+result.codigo+':'+JSON.stringify({unexpected:st.unexpected,calls:st.calls.slice(-5),quotes:st.quotes.map(q=>({state:q.p_state,reason:q.p_reason,summary:q.p_summary===null?'null':'present'})),aiCalls:st.aiCalls}));
 }
 assert.equal(st.aiCalls,2);
 assert.equal(st.quotes.length,2);
 assert.deepEqual(st.quotes.map(x=>x.p_summary.rubros[0].rubro),
  ['obra_gruesa','pintura']);
 assert.ok(st.quotes.every(q=>q.p_summary.iva==='no_informado'));
 assert.ok(st.quotes.every(q=>!JSON.stringify(q.p_summary).includes('549221')));
 assert.deepEqual(st.sends.map(x=>x.kind),['review','pdf','pdf']);
 const replay=await confirmarPedidoCompradorMvp279({
  habilitado:true,liberar:true,compradorAutenticado:true,
  chatHmac:h,replyHmac:reply,textoOriginal:'CONFIRMAR COTI '+authCode,rpc
 });
 assert.equal(replay.estado,'no_autorizado');
 const duplicate=await emitirRevisionCompradorMvp279({
  habilitado:true,compradorAutenticado:true,chatHmac:h,sourceHmac:source,
  destinatario:'5492215000000@s.whatsapp.net',rpc,
  send:async()=>{throw Error('repeated_review_send');}
 });
 assert.equal(duplicate.estado,'sin_revision');
 assert.equal(st.sends.length,3);
 assert.deepEqual(st.unexpected,[]);
});
