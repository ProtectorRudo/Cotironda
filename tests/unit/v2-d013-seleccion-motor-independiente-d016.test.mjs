import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generarWebhookD016,desacoplarMotorV2D013DePublicacion}
 from '../../scripts/piloto/v2-d016-whapi-overlay.mjs';
import {habilitarPublicacionD013ConAccesoD016}
 from '../../supabase/functions/cotironda-piloto-whapi/buyer-whatsapp-entry-d016.ts';
import {procesarCompradorCentralMvp226 as procesarV2}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-buyer-v2-d013.ts';
import {continuarZonaCentralMvp233 as continuarV2}
 from '../../supabase/functions/cotironda-piloto-whapi/ai-central-zone-v2-d013.ts';

const legacy=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const buyerOld=['    const buyerWorker=d013Enabled?',
 '      procesarCompradorCentralV2D013:procesarCompradorCentralMvp226;'].join('\n');
const buyerNew=['    // Piloto: el intérprete V2 nunca depende del permiso de publicar.',
 '    const buyerWorker=procesarCompradorCentralV2D013;'].join('\n');
const zoneOld=['        const zoneWorker=d013ZoneEnabled?',
 '          continuarZonaCentralV2D013:continuarZonaCentralMvp233;'].join('\n');
const zoneNew=['        // La localidad continúa siempre por V2. Sólo publicar usa D016.',
 '        const zoneWorker=continuarZonaCentralV2D013;'].join('\n');
test('D013: generador offline siempre usa V2 para comprador autenticado',()=>{
 const c=generarWebhookD016(legacy);
 assert.equal(c.includes(buyerOld),false);
 assert.equal(c.includes(zoneOld),false);
 assert.equal(c.includes(buyerNew),true);
 assert.equal(c.includes(zoneNew),true);
 assert.match(c,/habilitado:true,publicar:d013Enabled/u);
 assert.match(c,/model,publicar:d013ZoneEnabled/u);
 assert.match(c,/const d013Enabled=habilitarPublicacionD013ConAccesoD016/u);
 assert.match(c,/const d013ZoneEnabled=habilitarPublicacionD013ConAccesoD016/u);
});
test('D013: overlay runtime exacto cambia sólo selectores, conserva gating',()=>{
 const next=generarWebhookD016(legacy);
 const live=next.replace(buyerNew,buyerOld).replace(zoneNew,zoneOld);
 assert.ok(live.length>100000,'no aceptar un index antiguo');
 assert.equal(desacoplarMotorV2D013DePublicacion(live),next);
 assert.throws(()=>desacoplarMotorV2D013DePublicacion(legacy),
  /d013_live_selector_preflight_failed/u);
 assert.throws(()=>desacoplarMotorV2D013DePublicacion(next),
  /d016_overlay_anchor_invalid/u);
 assert.throws(()=>desacoplarMotorV2D013DePublicacion(
  live.replace('habilitado:true,publicar:d013Enabled',
   'habilitado:true,publicar:true')),
  /d013_live_selector_preflight_failed/u);
 assert.throws(()=>desacoplarMotorV2D013DePublicacion(
  live.replace(buyerOld,buyerOld+buyerOld)),
  /d016_overlay_anchor_invalid/u);
});
const gates={outbound:true,matchingEnabled:true,linkSendEnabled:true,
 portalOrigin:'https://cotironda-portal-123-protector-rudo-s-projects.vercel.app',
 portalSha:'a'.repeat(40),approvedSha:'a'.repeat(40),
 hmacKeyHex:'b'.repeat(64)};
test('D013: publicación D016 sigue bloqueada sin autorizaciones completas',()=>{
 assert.equal(habilitarPublicacionD013ConAccesoD016(gates),true);
 for(const patch of [
  {outbound:false},{matchingEnabled:false},{linkSendEnabled:false},
  {portalOrigin:'https://evil.example.com'},{portalSha:'c'.repeat(40)},
  {hmacKeyHex:''}
 ])assert.equal(habilitarPublicacionD013ConAccesoD016({...gates,...patch}),
  false,JSON.stringify(patch));
});
const source='10 bolsas cemento 25 kg. Entrega en La Plata.';
const evidence='10 bolsas cemento 25 kg';
const round='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const plan={estado:'plan_validado_sin_envio',motivo:'ruteo_semantico_valido',
 whatsappEnviado:false,baseModificada:false,
 pedido:{intencion:'cotizar',zona_entrega:'La Plata',dudas:[],articulos:[{
  evidencia,inicio:0,fin:evidence.length,
  descripcion:'Cemento de obra 25 kg',cantidad:'10',unidad:'bag',
  rubro:'obra_gruesa',presentacion:'25 kg',aclaracion:null
 }]},
 ruteo:{estado:'ruteo_valido_para_preparacion',
  motivo:'ruteo_semantico_valido',whatsappEnviado:false,
  propuestas:[{proveedor:'corralon_ailin',correspondencias:[{
   indicePedido:0,numeroCatalogo:1,tipo:'producto_declarado',
   explicacion:'SKU registrado del proveedor'
  }]}],cobertura:[{indicePedido:0,proveedoresAutorizados:1}],
  revisionTecnica:[]},
 catalogos:[{clave:'corralon_ailin',consentido:true,activo:true,
  localidades:['La Plata'],articulos:[{
   numero:1,descripcion:'Cemento de obra 25 kg',rubro:'obra_gruesa'
  }]}]};
function recorder(){
 const calls=[];
 return {calls,rpc:async(name,params)=>{
  calls.push({name,params});
  assert.notEqual(name,'cotironda_piloto_v2_auto_release_d013');
  assert.notEqual(name,'cotironda_piloto_ia_publish_mvp222');
  const data=name==='cotironda_piloto_ia_reserve_buyer_mvp226'?
   {state:'reserved'}:
   name==='cotironda_piloto_v2_shadow_prepare_d013'?
    {state:'shadow_staged',items_staged:1,matches_staged:1,
     invitations_sent:0,outbox_sent:0}:
   name==='cotironda_piloto_ia_lookup_round_mvp226'?
    {state:'linked',request_id:round}:
   name==='cotironda_piloto_ia_finish_buyer_mvp226'?
    {state:'finished'}:null;
  assert.ok(data,name+' no esperado');
  return {data,error:null};
 }};
}
test('D013: WhatsApp comprador V2 prepara sombra sin auto-release',async()=>{
 const {calls,rpc}=recorder();
 const r=await procesarV2({
  habilitado:true,publicar:false,autenticadoPorWebhook:true,
  chatHmac:'a'.repeat(64),messageHmac:'b'.repeat(64),
  sourceSha256:'c'.repeat(64),fuente:source,
  apiKey:'sk-test-local',model:'gpt-6-luna',rpc,
  planificar:async()=>plan
 });
 assert.equal(r.estado,'ronda_en_sombra',r.codigo);
 assert.equal(r.seguimientoHabilitado,false);
 assert.equal(r.whatsappEnviado,false);
 assert.ok(calls.some(x=>x.name==='cotironda_piloto_v2_shadow_prepare_d013'));
 assert.ok(calls.some(x=>x.name==='cotironda_piloto_ia_finish_buyer_mvp226'&&
  x.params.p_state==='staged'));
});
test('D013: localidad V2 reanuda en sombra sin liberar',async()=>{
 const {calls,rpc}=recorder();
 const r=await continuarV2({
  autenticadoPorWebhook:true,chatHmac:'a'.repeat(64),
  sourceHmac:'b'.repeat(64),originalSha256:'c'.repeat(64),
  ciudadConfirmada:'La Plata',nonce:'nonce',ciphertext:'ciphertext',
  apiKey:'sk-test-local',model:'gpt-6-luna',
  publicar:false,decrypt:async()=>source,shaText:async()=> 'c'.repeat(64),
  rpc,planificar:async()=>plan
 });
 assert.equal(r.estado,'ronda_en_sombra');
 assert.equal(r.requestId,round);
 assert.ok(calls.some(x=>x.name==='cotironda_piloto_v2_shadow_prepare_d013'));
 assert.ok(calls.some(x=>x.name==='cotironda_piloto_ia_finish_buyer_mvp226'&&
  x.params.p_state==='staged'));
});
