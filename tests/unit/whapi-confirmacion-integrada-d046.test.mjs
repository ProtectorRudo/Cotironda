import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { procesarWebhookWhapiAislado } from '../../src/server/whapi-inbound-offline.ts';
import { iniciarCotizacionChatD046,prepararBorradorCotizacionD046,
  confirmarBorradorCotizacionD046,ultimaOfertaConfirmadaD046
} from '../../src/domain/confirmacion-cotizacion-offline.mjs';
import { compararCotizacionesOffline } from '../../src/domain/comparacion-ofertas.ts';

// Ninguna dependencia de Whapi real, base, OpenAI, Vault ni números auténticos.
const channel='CHANNEL-FICTICIO',secret='x'.repeat(48);
const supplier='bbbbbbbb-0000-4000-8000-000000000202';
const round='dddddddd-0000-4000-8000-000000000204';
const chat='5492210000000@s.whatsapp.net';
const sender='5492210000000';
const now=1800000000;
const msg=(id,text)=>({id,from_me:false,from:sender,chat_id:chat,
  type:'text',timestamp:now,text:{body:text}});
const request=message=>new Request('https://offline.invalid/whapi',{
  method:'POST',headers:{'content-type':'application/json',
    'x-cotironda-webhook-key':secret},
  body:JSON.stringify({channel_id:channel,
    event:{type:'messages',event:'post'},messages:[message]})
});
const pedido={items:[{id:'cemento_001',cantidad:'20',unidad:'bag'}]};
const proposal={moneda:'ARS',formaPago:'transferencia',plazoEntregaDias:3,
  fleteFinal:'100.00',minimoCompraFinal:'0.00',items:[{
    itemId:'cemento_001',unidad:'bag',cantidadDisponible:'20',
    precioUnitarioNeto:'150.00',ivaPorcentaje:'21'}]};
function setup(){
  const messages=new Map(),stored=[];
  const dep={habilitado:true,canalId:channel,secretoWebhook:secret,ahoraUnix:()=>now,
    resolverProveedor:async()=>({supplierOrgId:supplier,roundId:round,
      consentimientoVigente:true,invitacionVigente:true}),
    persistirEntrada:async entrada=>{
      const prev=messages.get(entrada.claveIdempotencia);
      if(prev){
        if(prev.huellaSha256!==entrada.huellaSha256)throw Error('collision');
        return 'duplicada';
      }
      messages.set(entrada.claveIdempotencia,entrada);
      stored.push(entrada);
      return 'guardada';
    }
  };
  const v={channelId:channel,
    chatHmac:createHmac('sha256','FICTICIA_CLAVE_SOLO_EN_MEMORIA_D046')
      .update(chat).digest('hex'),
    supplierOrgId:supplier,roundId:round,anonId:'anon_corralon_ficticio'};
  const ctx=e=>({channelId:v.channelId,chatHmac:v.chatHmac,
    supplierOrgId:v.supplierOrgId,roundId:v.roundId,
    messageKey:e.claveIdempotencia,persistido:true,vinculoVerificado:true,
    consentimientoVigente:true,invitacionVigente:true,rondaAbierta:true,tipo:e.tipo});
  return {dep,stored,ctx,v};
}
test('D046 integrado: webhook ACK no es oferta; solo Confirmo referido crea versión',async()=>{
  const t=setup();
  const first=await procesarWebhookWhapiAislado(request(
    msg('p.d046-00000001','Cotizo 20 bolsas a $150 + IVA 21, flete $100')),t.dep);
  assert.equal(first.status,200);
  assert.equal((await first.json()).presupuestosConfirmados,0);
  assert.equal(t.stored.length,1);
  const session=iniciarCotizacionChatD046(t.v,pedido,{cemento_001:'Cemento CPC 50 kg'});
  const prepared=prepararBorradorCotizacionD046(session,t.ctx(t.stored[0]),proposal);
  assert.equal(prepared.estado,'pendiente_confirmacion');
  assert.equal(ultimaOfertaConfirmadaD046(prepared),null);
  assert.equal(t.stored[0].estado,'pendiente_interpretacion');
  const second=await procesarWebhookWhapiAislado(request(
    msg('p.d046-00000002','Confirmo')),t.dep);
  assert.equal(second.status,200);
  assert.equal((await second.json()).presupuestosConfirmados,0);
  const approved=confirmarBorradorCotizacionD046(prepared,t.ctx(t.stored[1]),{
    texto:t.stored[1].texto,replyToDraftId:prepared.borrador.draftId
  });
  assert.equal(approved.confirmadas.length,1);
  assert.equal(ultimaOfertaConfirmadaD046(approved).confirmada,true);
  assert.equal(compararCotizacionesOffline(pedido,[ultimaOfertaConfirmadaD046(approved)])
    .opcionesCompletas.length,0); // la equivalencia técnica NO se infiere
  assert.equal(approved.confirmadas[0].oferta.items[0].equivalencia,'sin_verificar');
  assert.equal(t.stored.length,2);
});
test('D046 integrado: reentrega del webhook se deduplica antes de interpretación',async()=>{
 const t=setup(),message=msg('p.d046-00000003','Precio de ensayo');
 assert.equal((await procesarWebhookWhapiAislado(request(message),t.dep)).status,200);
 const replay=await procesarWebhookWhapiAislado(request(message),t.dep);
 assert.equal((await replay.json()).duplicadas,1);
 assert.equal(t.stored.length,1);
});
test('D046 integrado: colisión de ID Whapi con precio cambiado no genera segunda entrada',async()=>{
 const t=setup(),id='p.d046-00000004';
 await procesarWebhookWhapiAislado(request(msg(id,'$150')),t.dep);
 const r=await procesarWebhookWhapiAislado(request(msg(id,'$1')),t.dep);
 assert.equal(r.status,503);
 assert.equal(t.stored.length,1);
});
