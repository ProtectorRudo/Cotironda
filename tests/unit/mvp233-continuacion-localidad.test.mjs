import test from 'node:test';
import assert from 'node:assert/strict';
import {continuarZonaCentralMvp233} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-zone-mvp233.ts';

const original='Hola necesito 20 bolsas de cemento CPC de 50kg.';
const chat='a'.repeat(64),source='b'.repeat(64),sha='c'.repeat(64);
const request='469cb459-5f00-49c2-b0b9-bc8b11e5c900';
const plan={estado:'plan_validado_sin_envio',motivo:'catalogo',
 pedido:{intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[
  {descripcion:'Cemento CPC 50kg',cantidad:'20',unidad:'bag',
   evidencia:'20 bolsas de cemento CPC de 50kg',rubro:'obra_gruesa',
   presentacion:null,aclaracion:null}]},
 ruteo:{estado:'ruteo_valido_para_preparacion',motivo:'catalogo',
  propuestas:[{proveedor:'corralon_ailin',correspondencias:[
   {indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
    explicacion:'Cemento declarado'}]}],cobertura:[],whatsappEnviado:false},
 catalogos:[{clave:'corralon_ailin',consentido:true,activo:true,
  localidades:['La Plata'],articulos:[
   {numero:1,descripcion:'Cemento CPC bolsa de 50 kilos',rubro:'obra_gruesa'}]}],
 whatsappEnviado:false,baseModificada:false};

// MVP288: source-linked offsets are mandatory in any plan test double.
for(const item of plan.pedido.articulos){
 item.inicio=original.indexOf(item.evidencia);
 item.fin=item.inicio+item.evidencia.length;
 assert.ok(item.inicio>=0);
}
const base={autenticadoPorWebhook:true,chatHmac:chat,sourceHmac:source,
 originalSha256:sha,ciudadConfirmada:'La Plata',nonce:'test',ciphertext:'test',
 apiKey:'test-key',model:'gpt-6-luna',publicar:true,
 decrypt:async()=>original,shaText:async()=>sha};
function mockDb(publish='ready_for_delivery'){
 const calls=[];
 const rpc=async(name,params)=>{
  calls.push({name,params});
  const state=name.includes('shadow_prepare')?'shadow_staged':
   name.includes('lookup_round')?'linked':
   name.includes('publish')?publish:'finished';
  return {error:null,data:{state,
   ...(state==='shadow_staged'?{
    items_staged:1,matches_staged:1,invitations_sent:0,outbox_sent:0}:{}),
   ...(state==='linked'?{request_id:request}:{})}};
 };
 return {rpc,calls};
}
test('MVP233: continúa sobre HMAC y fuente originales; ciudad sólo en contexto',async()=>{
 const {rpc,calls}=mockDb();let interpreted;
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  planificar:async p=>{interpreted=p;return plan}});
 assert.equal(actual.estado,'ronda_publicada');
 assert.equal(actual.sourceHmac,source);
 assert.equal(actual.requestId,request);
 assert.equal(interpreted.messageHmac,source);
 assert.equal(interpreted.textoOriginal,original+'\nLocalidad de entrega: La Plata');
 const prepared=calls.find(c=>c.name.includes('shadow_prepare'));
 assert.ok(prepared);
 assert.equal(prepared.params.p_original_text,original);
 assert.equal(prepared.params.p_message_hmac,source);
 assert.equal(prepared.params.p_city,'La Plata');
 assert.equal(calls.at(-1).params.p_state,'prepared');
});
test('MVP233: ciudad IA distinta se bloquea; ningún staging',async()=>{
 const {rpc,calls}=mockDb();
 const incorrect={...plan,pedido:{...plan.pedido,zona_entrega:'Rosario'}};
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  planificar:async()=>incorrect});
 assert.equal(actual.estado,'requiere_revision');
 assert.equal(calls.some(c=>c.name.includes('shadow_prepare')),false);
 assert.equal(calls.at(-1).params.p_state,'review');
});
test('MVP233: huella SHA incorrecta rechaza sin modelo ni SQL de preparación',async()=>{
 const {rpc,calls}=mockDb();let invoked=0;
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  shaText:async()=> 'd'.repeat(64),
  planificar:async()=>{invoked++;return plan}});
 assert.equal(actual.estado,'conciliacion_requerida');
 assert.equal(invoked,0);
 assert.equal(calls.some(c=>c.name.includes('shadow_prepare')),false);
});
test('MVP233: ausencia de remitente autenticado no hace lecturas ni SQL',async()=>{
 const {rpc,calls}=mockDb();
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  autenticadoPorWebhook:false});
 assert.equal(actual.estado,'origen_invalido');
 assert.equal(calls.length,0);
});
test('MVP233: citación inventada del modelo no se persiste',async()=>{
 const {rpc,calls}=mockDb();
 const forged={...plan,pedido:{...plan.pedido,articulos:[{
  ...plan.pedido.articulos[0],evidencia:'1000 tornillos inexistentes'}]}};
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  planificar:async()=>forged});
 assert.equal(actual.estado,'requiere_revision');
 assert.equal(calls.some(c=>c.name.includes('shadow_prepare')),false);
});
test('MVP233: publicación SQL deshabilitada conserva shadow sin envío',async()=>{
 const {rpc,calls}=mockDb('dispatch_disabled');
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  planificar:async()=>plan});
 assert.equal(actual.estado,'ronda_en_sombra');
 assert.equal(calls.at(-1).params.p_state,'staged');
});
test('MVP233: bandera de publicación OFF no llama publish',async()=>{
 const {rpc,calls}=mockDb();
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  publicar:false,planificar:async()=>plan});
 assert.equal(actual.estado,'ronda_en_sombra');
 assert.equal(calls.some(c=>c.name.includes('ia_publish')),false);
});
test('MVP233: fuente cifrada ilegible requiere conciliación sin reinterpretar otra',async()=>{
 const {rpc,calls}=mockDb();
 const actual=await continuarZonaCentralMvp233({...base,rpc,
  decrypt:async()=>{throw Error('invalid auth tag')}});
 assert.equal(actual.estado,'conciliacion_requerida');
 assert.equal(calls.some(c=>c.name.includes('shadow_prepare')),false);
});
