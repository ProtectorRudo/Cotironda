import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuyerPilot,canPrepareBuyerPilot}
 from '../../supabase/functions/cotironda-piloto-whapi/core.ts';

const realPilotMessage=[
 'Hola, necesito cotizar los siguientes materiales:',
 '- 1 m³ de arena fina',
 '- 2 m³ de piedra partida',
 '- 25 bolsas de cemento gris de 25 kg',
 'Zona de entrega: La Plata.',
 'Muchas gracias.'
].join('\n');

test('MVP147: pedido real de segunda ronda interpreta 3 materiales sin inventar ni pedir más',()=>{
 const p=parseBuyerPilot(realPilotMessage);
 assert.equal(p.city,'La Plata');
 assert.deepEqual(p.items.map(x=>[x.description,x.quantity,x.unit,x.family]),[
  ['arena fina',1,'m3','arena_fina'],
  ['piedra partida',2,'m3','piedra_partida'],
  ['cemento gris de 25 kg',25,'bag','cemento_gris_obra']
 ]);
 assert.deepEqual(p.unresolved,[]);
 assert.equal(canPrepareBuyerPilot(p),true);
});
test('MVP147: variantes naturales del encabezado sin perder materiales',()=>{
 for(const opener of [
  'Hola, necesito cotizar los siguientes materiales:',
  'Necesito cotizar los siguientes materiales:',
  'Buenas tardes, les paso los siguientes materiales:',
  'Los siguientes materiales:',
  'Materiales a cotizar:',
 ]){
  const text=opener+'\n- 1 m³ de arena fina\n- 2 m³ de piedra partida\n- 25 bolsas de cemento gris de 25 kg\nEntrega: La Plata';
  const p=parseBuyerPilot(text);
  assert.equal(p.items.length,3,opener);
  assert.deepEqual(p.unresolved,[],opener);
  assert.equal(canPrepareBuyerPilot(p),true,opener);
 }
});
test('MVP147: no ocultar material sin identificar ni confundir saludo por un pedido',()=>{
 const unknown=realPilotMessage.replace('Muchas gracias.','- 2 bolsas de producto desconocido');
 const p=parseBuyerPilot(unknown);
 assert.equal(p.items.length,3);
 assert.equal(p.unresolved.length,1);
 assert.equal(canPrepareBuyerPilot(p),false);
 const missingZone=realPilotMessage.replace('Zona de entrega: La Plata.','');
 assert.equal(canPrepareBuyerPilot(parseBuyerPilot(missingZone)),false);
 const greeting=parseBuyerPilot('Hola, necesito cotizar los siguientes materiales:\nMuchas gracias.');
 assert.equal(greeting.items.length,0);
 assert.equal(canPrepareBuyerPilot(greeting),false);
});
test('MVP147: solo pedidos completamente comprobados omiten gasto/decisión de IA',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/if\(row\.type==='text'&&!webLinkCode&&!centralBuyerText&&\s*!buyerReviewCommand&&!buyerLinkCommand&&!canPrepareBuyerPilot\(local\)&&\s*Deno\.env\.get\('COTIRONDA_PILOT_AI_ENABLED'\)==='true'\)/u);
 // La confirmación nunca se envía a IA ni se acepta como un material nuevo.
 assert.match(edge,/const buyerReviewCommand=row\.type==='text'&&esRespuestaConfirmacionMvp279\(body\)/u);
 assert.match(edge,/p_items:!centralBuyerText&&canPrepareBuyerPilot\(parsed\)\?parsed\.items:null/u);
 assert.match(edge,/const centralBuyerText=centralConfigured/u);
 assert.match(edge,/cotironda_piloto_receive_whapi_v1/u);
});
