import test from 'node:test';
import assert from 'node:assert/strict';
import {procesarCompradorCentralMvp226} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-mvp226.ts';

const rid='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const text='Hola, necesito 20 bolsas cemento CPC de 50kg y 3 bolsones de arena. Entrega en La Plata.';
const pedido={intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[
 {descripcion:'Cemento CPC bolsa 50 kg',cantidad:'20',unidad:'bag',
  evidencia:'20 bolsas cemento CPC de 50kg',rubro:'obra_gruesa',
  presentacion:null,aclaracion:null},
 {descripcion:'Arena en bolsón de 1m3',cantidad:'3',unidad:'m3',
  evidencia:'3 bolsones de arena',rubro:'obra_gruesa',
  presentacion:null,aclaracion:null}
]};
// The real AI contract resolves literal offsets before staging; mock this
// verification too, rather than fabricating an unverified item in tests.
for(const item of pedido.articulos){
 item.inicio=text.indexOf(item.evidencia);
 item.fin=item.inicio+item.evidencia.length;
 assert.ok(item.inicio>=0);
}
const route={estado:'ruteo_valido_para_preparacion',motivo:'catalogue',
 propuestas:[{proveedor:'corralon_ailin',correspondencias:[
  {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
   explicacion:'Cemento equivalente'},
  {indicePedido:1,numeroCatalogo:2,tipo:'alternativa_razonable',
   explicacion:'Árido en bolsa'}
 ]}],cobertura:[{indicePedido:0,proveedoresAutorizados:1},
 {indicePedido:1,proveedoresAutorizados:1}],whatsappEnviado:false};
const plan={
 estado:'plan_validado_sin_envio',motivo:'catalogo',
 pedido,ruteo:route,whatsappEnviado:false,baseModificada:false,
 catalogos:[{clave:'corralon_ailin',consentido:true,activo:true,
  localidades:['La Plata'],articulos:[
   {numero:1,descripcion:'Cemento CPC bolsa 50kg',rubro:'obra_gruesa'},
   {numero:2,descripcion:'Arena embolsada',rubro:'obra_gruesa'}
  ]}]
};
const base={
 habilitado:true,publicar:true,autenticadoPorWebhook:true,
 chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
 sourceSha256:'c'.repeat(64),fuente:text,
 apiKey:'sk-'+'x'.repeat(28),model:'gpt-6-luna'
};
function fakeDb(options={}){
 const calls=[];
 const rpc=async(name,params)=>{
  calls.push({name,params});
  switch(name){
   case 'cotironda_piloto_ia_reserve_buyer_mvp226':
    return {data:{state:options.reservation??'reserved'},error:null};
   case 'cotironda_piloto_ia_shadow_prepare_mvp221':
    return {data:{state:'shadow_staged',
     items_staged:params.p_items.length,
     matches_staged:params.p_destinos.reduce((n,x)=>n+x.correspondencias.length,0),
     invitations_sent:0,outbox_sent:0},error:null};
   case 'cotironda_piloto_ia_lookup_round_mvp226':
    return {data:{state:'linked',request_id:rid},error:null};
   case 'cotironda_piloto_ia_publish_mvp222':
    return {data:{state:options.publish??'ready_for_delivery'},error:null};
   case 'cotironda_piloto_ia_finish_buyer_mvp226':
    return {data:{state:'finished'},error:null};
   default: throw Error('unexpected RPC '+name);
  }
 };
 return {rpc,calls};
}
test('MVP226: bandera OFF nunca consulta SQL, IA ni WhatsApp',async()=>{
 const db=fakeDb();let plans=0;
 const r=await procesarCompradorCentralMvp226({...base,
  habilitado:false,rpc:db.rpc,planificar:async()=>{plans++;return plan}});
 assert.equal(r.estado,'desactivado');
 assert.equal(db.calls.length,0);assert.equal(plans,0);
});
test('MVP226: mensaje duplicado y cuota no vuelven a pagar IA',async()=>{
 for(const [state,expected] of [
  ['already_reserved','repetido'],['quota_exceeded','presupuesto_excedido'],
  ['not_authorized','no_autorizado']
 ]){
  const db=fakeDb({reservation:state});let plans=0;
  const r=await procesarCompradorCentralMvp226({...base,
   rpc:db.rpc,planificar:async()=>{plans++;return plan}});
  assert.equal(r.estado,expected);assert.equal(plans,0);
  assert.equal(db.calls.length,1);
 }
});
test('MVP226: interpreta y enruta rubro, stage, publisher y seguimiento en 1 ejecución',async()=>{
 const db=fakeDb();let plans=0;
 const r=await procesarCompradorCentralMvp226({...base,rpc:db.rpc,
  planificar:async()=>{plans++;return plan}});
 assert.equal(plans,1);
 assert.equal(r.estado,'ronda_publicada');
 assert.equal(r.requestId,rid);
 assert.equal(r.seguimientoHabilitado,true);
 assert.equal(r.whatsappEnviado,false);
 assert.deepEqual(db.calls.map(c=>c.name),[
  'cotironda_piloto_ia_reserve_buyer_mvp226',
  'cotironda_piloto_ia_shadow_prepare_mvp221',
  'cotironda_piloto_ia_lookup_round_mvp226',
  'cotironda_piloto_ia_publish_mvp222',
  'cotironda_piloto_ia_finish_buyer_mvp226'
 ]);
 const params=db.calls[1].params;
 assert.equal(params.p_destinos.length,1);
 assert.equal(params.p_destinos[0].correspondencias[1].descripcionCatalogo,
  'Arena embolsada');
 assert.equal(params.p_items[1].rubro,'obra_gruesa');
});
test('MVP226: sombra segura sin inventar envíos ni seguimiento',async()=>{
 const db=fakeDb();
 const r=await procesarCompradorCentralMvp226({...base,publicar:false,
  rpc:db.rpc,planificar:async()=>plan});
 assert.equal(r.estado,'ronda_en_sombra');
 assert.equal(r.seguimientoHabilitado,false);
 assert.ok(!db.calls.some(c=>c.name==='cotironda_piloto_ia_publish_mvp222'));
 assert.equal(db.calls.at(-1).params.p_state,'staged');
});
test('MVP226: gate SQL OFF no publica ni realiza envío',async()=>{
 const db=fakeDb({publish:'dispatch_disabled'});
 const r=await procesarCompradorCentralMvp226({...base,
  rpc:db.rpc,planificar:async()=>plan});
 assert.equal(r.estado,'ronda_en_sombra');
 assert.equal(r.codigo,'sql_dispatch_disabled');
 assert.equal(db.calls.at(-1).params.p_state,'staged');
});
test('MVP226: si falta zona NO fabrica una localidad',async()=>{
 const db=fakeDb();
 const r=await procesarCompradorCentralMvp226({...base,
  rpc:db.rpc,planificar:async()=>({
   estado:'requiere_aclaracion',motivo:'falta_localidad',
   pedido:null,ruteo:null,catalogos:null,whatsappEnviado:false,
   baseModificada:false
  })});
 assert.equal(r.estado,'requiere_zona');
 assert.equal(db.calls.at(-1).params.p_state,'needs_zone');
 assert.ok(!db.calls.some(c=>c.name.includes('shadow_prepare')));
});
test('MVP226: discrepancia IA se revisa, jamás se crea ronda',async()=>{
 const db=fakeDb();
 const r=await procesarCompradorCentralMvp226({...base,rpc:db.rpc,
  planificar:async()=>({
   estado:'rechazado',motivo:'lecturas_divergentes',pedido:null,
   ruteo:null,catalogos:null,whatsappEnviado:false,baseModificada:false
  })});
 assert.equal(r.estado,'requiere_revision');
 assert.equal(db.calls.at(-1).params.p_state,'review');
 assert.ok(!db.calls.some(c=>c.name.includes('shadow_prepare')));
});
test('MVP226: SQL incierto devuelve reconciliación sin reintentar',async()=>{
 const db=fakeDb();let count=0;
 const r=await procesarCompradorCentralMvp226({...base,
  rpc:async(name,params)=>{
   if(name==='cotironda_piloto_ia_shadow_prepare_mvp221'){
    count++;throw Error('response lost');
   }
   return db.rpc(name,params);
  },planificar:async()=>plan
 });
 assert.equal(r.estado,'conciliacion_requerida');
 assert.equal(count,1);
});
