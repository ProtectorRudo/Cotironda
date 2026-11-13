import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {AVISO_ORIGINALES_D016,AVISO_ORIGINALES_D016_VERSION,
 adjuntarAvisoOriginalesD016,validarRespuestaComoConsentimientoD016}
 from '../../src/server/v2-d016-aviso-original-proveedor.ts';

const now=Date.parse('2026-11-13T18:00:00Z');
const requestId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const supplierKey='supplier_a';
const chatHmac='1'.repeat(64);
const body=adjuntarAvisoOriginalesD016('Cotizá 20 bolsas de cemento',1024);
const sha=x=>createHash('sha256').update(x).digest('hex');
const c=()=>({requestId,supplierKey,chatHmac,
 proveedorActivo:true,proveedorConsentimientoGeneral:true,revokedAtMs:null,
 requestCreatedAtMs:now-3600000,policyActivatedAtMs:now-7200000,
 closesAtMs:now+7200000,nowMs:now});
const d=()=>({requestId,supplierKey,chatHmac,
 whapiMessageId:'wamid.OUTGOING01',apiState:'api_accepted',
 apiAcceptedAtMs:now-600000,body,bodySha256:sha(body),
 version:AVISO_ORIGINALES_D016_VERSION,
 invitationCreatedAtMs:now-900000});
const r=()=>({requestId,supplierKey,chatHmac,
 messageHmac:'2'.repeat(64),sourceSha256:'3'.repeat(64),
 receivedAtMs:now-300000,whapiAuthenticada:true,
 vinculoRondaVerificado:true,hayCotizacion:true,
 reenviado:false,solicitaNoCompartir:false,
 association:'quoted_whapi_id',quotedWhapiMessageId:'wamid.OUTGOING01',
 rondaUnicaVerificada:false});
const proof=(cc=c(),dd=d(),rr=r())=>validarRespuestaComoConsentimientoD016(cc,dd,rr);
test('El aviso se agrega UNA SOLA vez dentro del mismo mensaje',()=>{
 assert.ok(body.includes('presupuesto original'));
 assert.ok(body.endsWith(AVISO_ORIGINALES_D016));
 assert.equal(adjuntarAvisoOriginalesD016(body,4096),null);
 assert.equal(adjuntarAvisoOriginalesD016('  pedido ',4096),null);
 assert.equal(adjuntarAvisoOriginalesD016('Pedido',AVISO_ORIGINALES_D016.length+7),null);
 assert.equal(adjuntarAvisoOriginalesD016('',4096),null);
});
test('Respuesta auténtica posterior al aviso y del mismo pedido genera prueba acotada',async()=>{
 const x=await proof();
 assert.equal(x.requestId,requestId);
 assert.equal(x.messageHmac,'2'.repeat(64));
 assert.equal(x.avisoBodySha256,sha(body));
 assert.equal(x.avisoVersion,AVISO_ORIGINALES_D016_VERSION);
 assert.equal(x.respuestaAutenticadaMs,now-300000);
 assert.ok(!JSON.stringify(x).includes('cemento'));
});
test('API incierta/fallida, aviso alterado, mensaje anterior, otro envío: denegar',async()=>{
 const bad=[
  [c(),{...d(),apiState:'uncertain'},r()],
  [c(),{...d(),apiState:'failed'},r()],
  [c(),{...d(),body:'Pedido sin aviso',bodySha256:sha('Pedido sin aviso')},r()],
  [c(),{...d(),bodySha256:'0'.repeat(64)},r()],
  [c(),{...d(),version:'cotironda-originales-v2'},r()],
  [c(),{...d(),requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},r()],
  [c(),d(),{...r(),receivedAtMs:now-700000}],
  [c(),d(),{...r(),quotedWhapiMessageId:'wamid.OTRO0001'}],
  [{...c(),policyActivatedAtMs:now-3000000,requestCreatedAtMs:now-3600000},d(),r()],
  [{...c(),requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'},d(),r()],
 ];
 for(let i=0;i<bad.length;i++)assert.equal(await proof(...bad[i]),null,String(i));
});
test('Canal/empresa/rol/revocación/NO COMPARTIR bloquean',async()=>{
 const cases=[
  [c(),d(),{...r(),chatHmac:'a'.repeat(64)}],
  [{...c(),chatHmac:'b'.repeat(64)},d(),r()],
  [{...c(),proveedorActivo:false},d(),r()],
  [{...c(),proveedorConsentimientoGeneral:false},d(),r()],
  [{...c(),revokedAtMs:now-1000},d(),r()],
  [c(),d(),{...r(),reenviado:true}],
  [c(),d(),{...r(),solicitaNoCompartir:true}],
  [c(),d(),{...r(),whapiAuthenticada:false}],
  [c(),d(),{...r(),vinculoRondaVerificado:false}],
  [c(),d(),{...r(),hayCotizacion:false}],
  [c(),d(),{...r(),supplierKey:'supplier_b'}],
  [c(),d(),{...r(),requestId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}],
 ];
 for(let i=0;i<cases.length;i++)assert.equal(await proof(...cases[i]),null,String(i));
});
test('Solo reply exacto o una ronda única vinculada',async()=>{
 assert.ok(await proof(c(),d(),{...r(),association:'single_active_round',
  quotedWhapiMessageId:null,rondaUnicaVerificada:true}));
 assert.equal(await proof(c(),d(),{...r(),association:'single_active_round',
  quotedWhapiMessageId:null,rondaUnicaVerificada:false}),null);
 assert.equal(await proof(c(),d(),{...r(),association:'unresolved',
  quotedWhapiMessageId:null,rondaUnicaVerificada:true}),null);
 assert.equal(await proof(c(),d(),{...r(),association:'prior_supplier_preamble',
  quotedWhapiMessageId:null,rondaUnicaVerificada:true}),null);
});
test('Fuera de plazo, respuesta futura o prueba sin SHA falla cerrado',async()=>{
 for(const x of [
  [c(),d(),{...r(),receivedAtMs:now+8000000}],
  [c(),d(),{...r(),receivedAtMs:now+1}],
  [{...c(),closesAtMs:now-4000000},d(),r()],
  [c(),{...d(),apiAcceptedAtMs:now+1},r()],
  [c(),d(),{...r(),messageHmac:'unhash'}],
  [c(),d(),{...r(),sourceSha256:'0'}],
  [c(),d(),{...r(),association:'quoted_whapi_id',quotedWhapiMessageId:null}],
 ])assert.equal(await proof(...x),null);
});
