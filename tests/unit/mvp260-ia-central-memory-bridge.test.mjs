import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validarMemoriaProveedorMvp260} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-memory-mvp260.ts';
import {procesarPresupuestoCentralMvp227} from '../../supabase/functions/cotironda-piloto-whapi/ai-central-supplier-mvp227.ts';
const msg='b'.repeat(64),chat='a'.repeat(64),hash='c'.repeat(64);
const original='Hola. 20 bolsas de cemento CPC $8.900 c/u. Total $178.000.';
const base={
 habilitado:true,webhookAutenticado:true,messageHmac:msg,chatHmac:chat,
 apiKey:'sk-'+'x'.repeat(22),model:'gpt-6-luna',
 decrypt:async(nonce,ct)=>{
  assert.equal(nonce,'encrypted_nonce');assert.equal(ct,'encrypted_cipher');
  return original;
 },
 shaText:async()=>hash
};
const item={id:'item_1',descripcion:'Cemento CPC bolsa de 50kg',
 cantidad:'20',unidad:'bag',rubro:'obra_gruesa'};
function legacyDb(mode='reserved'){
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
   return {data:{state:mode,source_sha256:hash,
    nonce:'encrypted_nonce',ciphertext:'encrypted_cipher',
    items:[item]},error:null};
  if(name==='cotironda_piloto_ia_finish_quote_mvp227')
   return {data:{state:'saved_private'},error:null};
  throw Error('unexpected SQL');
 };
 return {rpc,calls};
}
const sample={
 estado:'interpretada_para_revision',
 motivo:'doble_lectura_con_evidencia',
 oferta:{etiquetaAnonima:'Presupuesto privado',moneda:'ARS',
  iva:'no_informado',flete:'no_informado',pago:'no_informado',
  fuente:original,lineas:[{numero:1,
   textoOriginal:'20 bolsas de cemento CPC $8.900 c/u. Total $178.000.',
   descripcion:'Cemento CPC',cantidad:'20',unidad:'bag',
   precioUnitarioLiteral:'$8.900',totalLineaLiteral:'$178.000',
   tipo:'material'}],
  vinculos:[{lineaOferta:1,articuloPedido:'item_1',
   equivalencia:'misma_presentacion',explicacion:'CPC exacto'}]
 },
 cobertura:{estado:'analisis_por_rubro_sin_adjudicacion',
  ofertas:[{
   etiquetaAnonima:'Presupuesto privado',
   estado:'verificada_para_comparacion',motivos:[],
   rubros:[{rubro:'obra_gruesa',solicitados:1,respondidos:1,
    precioComprobado:1,cobertura:'completa',faltantes:[]}],
   extras:[],precios:[{pedidoId:'item_1',numeroOferta:1,
    cantidad:'20',unidad:'bag',centavos:17800000n}]
  }],comparables:[],rankingGlobalPermitido:false,
  adjudicacionAutomatica:false,contactosRevelados:false}
};
const scope=()=>({state:'verified_scope',rubros:[{rubro:'obra_gruesa',materiales:1}],
 expires_at:new Date(Date.now()+86400000).toISOString(),
 own_latest_verified_quote_remembered:false,
 contains_prices:false,contains_contacts:false,
 automatic_decisions_allowed:false});
function store(status='remembered_private',memory=scope()){
 const calls=[];
 const rpc=async(name,p)=>{
  calls.push({name,p});
  if(name==='cotironda_piloto_ia_reserve_quote_mvp227')
   return {data:{state:'reserved',source_sha256:hash,
    nonce:'encrypted_nonce',ciphertext:'encrypted_cipher',items:[item]},error:null};
  if(name==='cotironda_piloto_memory_quote_context_mvp260')
   return {data:memory,error:null};
  if(name==='cotironda_piloto_ia_finish_quote_mvp227')
   return {data:{state:'saved_private'},error:null};
  if(name==='cotironda_piloto_memory_sync_quote_mvp260'){
   if(status==='sql_error')return {data:null,error:'unknown_response'};
   return {data:{state:status},error:null};
  }
  throw Error('unexpected_sql:'+name);
 };
 return {calls,rpc};
}

test('MVP260: guardia OFF conserva flujo anterior sin memoria',async()=>{
 const x=store();let modelCalls=0;
 const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
  commercialMemoryEnabled:false,interpretar:async()=>{modelCalls++;return sample}});
 assert.equal(r.estado,'verificado_privado');assert.equal(modelCalls,1);
 assert.deepEqual(x.calls.map(x=>x.name),[
  'cotironda_piloto_ia_reserve_quote_mvp227',
  'cotironda_piloto_ia_finish_quote_mvp227']);
});
test('MVP260: memoria verificada habilita lectura solo del original, después persiste',async()=>{
 const x=store();let modelCalls=0,checked=null;
 const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
  commercialMemoryEnabled:true,interpretar:async args=>{modelCalls++;checked=args;return sample}});
 assert.equal(r.estado,'verificado_privado');assert.equal(modelCalls,1);
 assert.equal(checked.fuente,original);
 assert.deepEqual(checked.pedido,[item]);
 assert.equal('memoria' in checked,false);
 assert.deepEqual(x.calls.map(x=>x.name),[
  'cotironda_piloto_ia_reserve_quote_mvp227',
  'cotironda_piloto_memory_quote_context_mvp260',
  'cotironda_piloto_ia_finish_quote_mvp227',
  'cotironda_piloto_memory_sync_quote_mvp260']);
 for(const step of [x.calls[1],x.calls[3]]){
  assert.deepEqual(step.p,{p_chat_hmac:chat,p_message_hmac:msg,p_source_sha256:hash});
 }
 assert.equal(x.calls[2].p.p_state,'verified');
 assert.equal(r.whatsappEnviado,false);
});
test('MVP260: no mezclar fuente, rubro o rol; bloquear ANTES de llamar modelo',async()=>{
 const bad=[
  {...scope(),rubros:[{rubro:'pintura',materiales:1}]},
  {...scope(),rubros:[{rubro:'obra_gruesa',materiales:2}]},
  {...scope(),contains_prices:true},
  {...scope(),automatic_decisions_allowed:true},
  {...scope(),expires_at:new Date(Date.now()-1000).toISOString()},
  {...scope(),rubros:[{rubro:'obra_gruesa',materiales:1},{rubro:'pintura',materiales:1}]},
  {...scope(),state:'not_authorized'},
  {...scope(),rubros:[]}
 ];
 for(const memory of bad){
  const x=store('remembered_private',memory);let calls=0;
  const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
   commercialMemoryEnabled:true,interpretar:async()=>{calls++;return sample}});
  assert.equal(r.estado,'requiere_revision');assert.equal(r.codigo,'memory_scope_conflict');
  assert.equal(calls,0);
  assert.deepEqual(x.calls.map(c=>c.name),[
   'cotironda_piloto_ia_reserve_quote_mvp227',
   'cotironda_piloto_memory_quote_context_mvp260',
   'cotironda_piloto_ia_finish_quote_mvp227']);
  assert.equal(x.calls[2].p.p_state,'review');
 }
});
test('MVP260: no publicar precio ni reanalizar ante memoria no confirmada',async()=>{
 for(const status of ['memory_not_saved','sql_error']){
  const x=store(status);let interpreted=0;
  const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
   commercialMemoryEnabled:true,interpretar:async()=>{interpreted++;return sample}});
  assert.equal(r.estado,'conciliacion_requerida');
  assert.equal(r.codigo,'memory_sync_unconfirmed');
  assert.equal(interpreted,1);
  assert.equal(x.calls.filter(c=>c.name==='cotironda_piloto_ia_finish_quote_mvp227').length,1);
  assert.equal(x.calls.filter(c=>c.name==='cotironda_piloto_ia_reserve_quote_mvp227').length,1);
 }
});
test('MVP260: no guardar recuerdo para presupuesto que quedó en revisión',async()=>{
 const x=store();
 const notVerified={...sample,cobertura:{...sample.cobertura,
  ofertas:[{...sample.cobertura.ofertas[0],estado:'requiere_revision',precios:[]}]}};
 const r=await procesarPresupuestoCentralMvp227({...base,rpc:x.rpc,
  commercialMemoryEnabled:true,interpretar:async()=>notVerified});
 assert.equal(r.estado,'requiere_revision');
 assert.ok(!x.calls.some(c=>c.name==='cotironda_piloto_memory_sync_quote_mvp260'));
});
test('MVP260: middleware webhook aplica flag OFF por defecto en dos rutas',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 const matches=edge.match(/commercialMemoryEnabled:Deno.env.get\('COTIRONDA_PILOT_COMMERCIAL_MEMORY_ENABLED'\)==='true'/gu)??[];
 assert.equal(matches.length,3);
 assert.match(edge,/COTIRONDA_PILOT_AUTO_TEXT_MVP292_ENABLED/u);
 const sql=readFileSync(new URL('../../supabase/piloto/mvp260_memory_broker_bridge.sql',import.meta.url),'utf8');
 assert.match(sql,/q\.state='reserved'/u);assert.match(sql,/q\.state='verified'/u);
 assert.match(sql,/p\.opted_out_at IS NULL/u);
 assert.doesNotMatch(sql,/UPDATE cotironda_piloto_privado\.ai_supplier_review_mvp227|net\.http_post|contact_reveal/u);
});
