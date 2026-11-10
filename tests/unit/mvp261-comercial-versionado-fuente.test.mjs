import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {procesarPresupuestoCentralMvp227} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';
const msg='b'.repeat(64),chat='a'.repeat(64),hash='c'.repeat(64);
const original='Corrijo mi presupuesto: 20 bolsas de cemento CPC a $8.900 c/u.';
const item={id:'item_1',descripcion:'Cemento CPC bolsa 50kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'};
const sample={
 estado:'interpretada_para_revision',motivo:'origen_cotejado',
 oferta:{etiquetaAnonima:'Presupuesto privado',moneda:'ARS',
  iva:'no_informado',flete:'no_informado',pago:'no_informado',
  fuente:original,lineas:[],vinculos:[]},
 cobertura:{estado:'analisis_por_rubro_sin_adjudicacion',
  ofertas:[{etiquetaAnonima:'Presupuesto privado',
   estado:'verificada_para_comparacion',motivos:[],
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,
    precioComprobado:1,cobertura:'completa',faltantes:[]}],
   extras:[],precios:[{pedidoId:'item_1',numeroOferta:1,
    cantidad:'20',unidad:'bag',centavos:17800000n}]
  }],comparables:[],rankingGlobalPermitido:false,
  adjudicacionAutomatica:false,contactosRevelados:false}
};
const params={
 habilitado:true,webhookAutenticado:true,
 messageHmac:msg,chatHmac:chat,
 apiKey:'sk-'+'x'.repeat(22),model:'gpt-6-luna',
 decrypt:async()=>original,shaText:async()=>hash,
 interpretar:async()=>sample
};
function mock(versionState='version_recorded'){
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
   return {data:{state:'reserved',source_sha256:hash,
    nonce:'nonce',ciphertext:'cipher',items:[item]},error:null};
  if(name==='cotironda_piloto_ia_finish_quote_mvp227')
   return {data:{state:'saved_private'},error:null};
  if(name==='cotironda_piloto_record_source_version_mvp261')
   return versionState==='rpc_error'?
    {data:null,error:'unknown_database_response'}:
    {data:{state:versionState,revision_no:2,
     automatic_merge_allowed:false},error:null};
  throw Error('unexpected '+name);
 };
 return {calls,rpc};
}
test('MVP261: OFF preserva llamadas y precios originales',async()=>{
 const x=mock();
 const a=await procesarPresupuestoCentralMvp227({...params,
  rpc:x.rpc,quoteVersioningEnabled:false});
 assert.equal(a.estado,'verificado_privado');
 assert.deepEqual(x.calls.map(y=>y.name),[
  'cotironda_piloto_ia_reserve_quote_mvp227',
  'cotironda_piloto_ia_finish_quote_mvp227']);
 assert.equal(x.calls[1].p.p_summary.precios[0].centavos,'17800000');
});
test('MVP261: versión va después de guardar revisión económica, sin fuente modificada',async()=>{
 const x=mock();
 const a=await procesarPresupuestoCentralMvp227({...params,
  rpc:x.rpc,quoteVersioningEnabled:true});
 assert.equal(a.estado,'verificado_privado');
 assert.deepEqual(x.calls.map(y=>y.name),[
  'cotironda_piloto_ia_reserve_quote_mvp227',
  'cotironda_piloto_ia_finish_quote_mvp227',
  'cotironda_piloto_record_source_version_mvp261']);
 assert.equal(x.calls[1].p.p_summary.precios[0].centavos,'17800000');
 assert.deepEqual(x.calls[2].p,{
  p_chat_hmac:chat,p_message_hmac:msg,p_source_sha256:hash});
 assert.equal(a.whatsappEnviado,false);
});
test('MVP261: respuesta parcial queda review, no se completa con precio anterior',async()=>{
 const x=mock();
 const incomplete={...sample,cobertura:{...sample.cobertura,
  ofertas:[{...sample.cobertura.ofertas[0],
   estado:'requiere_revision',precios:[]}]
 }};
 const a=await procesarPresupuestoCentralMvp227({...params,
  rpc:x.rpc,quoteVersioningEnabled:true,
  interpretar:async()=>incomplete});
 assert.equal(a.estado,'requiere_revision');
 assert.equal(x.calls[1].p.p_state,'review');
 assert.deepEqual(x.calls[1].p.p_summary.precios,[]);
 assert.equal(x.calls[2].name,'cotironda_piloto_record_source_version_mvp261');
});
test('MVP261: fuente anterior o respuesta DB incierta exige conciliación, sin relectura',async()=>{
 for(const state of ['newer_source_exists','quota_exceeded','rpc_error']){
  const x=mock(state);let reads=0;
  const a=await procesarPresupuestoCentralMvp227({...params,
   rpc:x.rpc,quoteVersioningEnabled:true,
   interpretar:async()=>{reads++;return sample;}});
  assert.equal(a.estado,'conciliacion_requerida');
  assert.equal(a.codigo,'version_sync_unconfirmed');
  assert.equal(reads,1);
  assert.equal(x.calls.filter(y=>y.name==='cotironda_piloto_ia_reserve_quote_mvp227').length,1);
  assert.equal(x.calls.filter(y=>y.name==='cotironda_piloto_ia_finish_quote_mvp227').length,1);
 }
});
test('MVP261: dos rutas conservan bandera OFF por defecto y roles existentes',()=>{
 const edge=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.equal((edge.match(/quoteVersioningEnabled:Deno\.env\.get\('COTIRONDA_PILOT_QUOTE_VERSIONS_ENABLED'\)==='true'/gu)??[]).length,3);
 assert.match(edge,/supplier_text_auto_quote_review_required/u);
 const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp261_source_versions_commercial.sql',import.meta.url),'utf8');
 assert.match(sql,/q\.state IN\('verified','review'\) AND q\.finished_at IS NOT NULL/u);
 assert.match(sql,/ORDER BY m\.received_at DESC,l\.message_hmac DESC LIMIT 1/u);
 assert.match(sql,/automatic_merge_allowed',false/u);
 assert.match(sql,/previous_message_hmac text REFERENCES/u);
 assert.doesNotMatch(sql,/UPDATE cotironda_piloto_privado\.ai_supplier_review_mvp227|net\.http_post|messages\/text/u);
});
