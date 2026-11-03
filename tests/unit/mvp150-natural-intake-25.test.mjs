import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseBuyerPilot,canPrepareBuyerPilot} from '../../supabase/functions/cotironda-piloto-whapi/core.ts';
import {PILOT_AI_SCHEMA} from '../../supabase/functions/cotironda-piloto-whapi/ai-contract.ts';

test('MVP150: saludos, listas y cierre cortés no generan falsa duda',()=>{
 const p=parseBuyerPilot([
  '¡Hola, buenas tardes!', 'Me pasan precios de:',
  '- 1 m³ de arena zarandeada',
  '- 2 m³ de piedra partida',
  '- 25 bolsas de cemento gris x 25 kg',
  'Envío a: La Plata.', '¡Muchísimas gracias!'
 ].join('\n'));
 assert.equal(p.city,'La Plata');
 assert.deepEqual(p.items.map(x=>[x.quantity,x.unit,x.family]),[
  [1,'m3','arena_fina'],[2,'m3','piedra_partida'],
  [25,'bag','cemento_gris_obra']
 ]);
 assert.deepEqual(p.unresolved,[]);
 assert.equal(canPrepareBuyerPilot(p),true);
});
test('MVP150: presentaciones habituales se normalizan con unidad explícita',()=>{
 const p=parseBuyerPilot([
  'Entrega: La Plata',
  '10 barras de hierro ADN 420 8 mm',
  '4 rollos de membrana asfáltica 4 mm',
  '3 cajas de clavos punta París',
  '5 placas de malla electrosoldada'
 ].join('\n'));
 assert.deepEqual(p.items.map(x=>[x.quantity,x.unit,x.family]),[
  [10,'unit','hierro_adn'],[4,'roll','membrana_asfaltica'],
  [3,'box','clavos_punta_paris'],[5,'unit','malla_electrosoldada']
 ]);
 assert.deepEqual(p.unresolved,[]);
});
test('MVP150: 9 y 25 artículos completos admitidos sin descartar ninguno',()=>{
 for(const count of [9,25]){
  const p=parseBuyerPilot('Entrega: La Plata\n'+
   Array.from({length:count},(_,i)=>`- ${i+1} bolsas cemento CPC 50 kg`).join('\n'));
  assert.equal(p.items.length,count);
  assert.equal(p.unresolved.length,0);
  assert.equal(canPrepareBuyerPilot(p),true);
 }
 assert.equal(PILOT_AI_SCHEMA.properties.items.maxItems,25);
 const sql=readFileSync(new URL('../../supabase/piloto/mvp150_text_request_capacity_25.sql',import.meta.url),'utf8');
 assert.match(sql,/jsonb_array_length\(p_items\)>25/u);
 assert.doesNotMatch(sql,/jsonb_array_length\(p_items\)>8/u);
});
test('MVP150: 26 líneas requieren procesar sin pérdida, no iniciar ronda parcial',()=>{
 const p=parseBuyerPilot('Entrega: La Plata\n'+
   Array.from({length:26},()=>'- 1 bolsa cemento CPC 50 kg').join('\n'));
 assert.equal(p.items.length,26);
 assert.equal(canPrepareBuyerPilot(p),false);
});
test('MVP150: nunca inventar unidades ni interpretar miles ambiguos como decimales',()=>{
 for(const input of [
   '2 de piedra partida',
   '1.000 bolsas de cemento CPC 50 kg',
   '1 m3 de arena (sin tipo)',
   '10 bolsas cemento de contacto',
   '6 bolsas pegamento desconocido'
 ]){
  const p=parseBuyerPilot(input+'\nEntrega: La Plata');
  assert.equal(canPrepareBuyerPilot(p),false,input);
 }
});
test('MVP150: no borrar materiales desconocidos al interpretar lista mixta',()=>{
 const p=parseBuyerPilot('Entrega: La Plata\n1 m3 arena fina\n2 bolsas de algo experimental');
 assert.equal(p.items.length,1);
 assert.equal(p.unresolved.length,1);
 assert.equal(canPrepareBuyerPilot(p),false);
});
test('MVP150: mantener Webhook, rol, IA solo fallback y PDFs fuente',()=>{
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(edge,/!canPrepareBuyerPilot\(local\)/u);
 assert.match(edge,/cotironda_piloto_receive_whapi_v1/u);
 assert.match(edge,/dispatchTwo\(sec,db\)/u);
});
