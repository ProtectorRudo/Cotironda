import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBuyerPilot,canPrepareBuyerPilot} from
 '../../supabase/functions/cotironda-piloto-whapi/core.ts';

const MENSAJE_REAL = [
 'Hola, necesito cotizar estos materiales:',
 '',
 '- 20 bolsas de cemento CPC de 50 kg.',
 '- 3 bolsones de arena.',
 '- 2 bolsones de piedra.',
 '',
 'Entrega en La Plata.',
 '',
 'Gracias.'
].join('\n');

test('MVP215: mensaje real 05/11/2026 queda listo sin IA ni repreguntas',()=>{
 const result=parseBuyerPilot(MENSAJE_REAL);
 assert.equal(result.city,'La Plata');
 assert.deepEqual(result.unresolved,[]);
 assert.equal(canPrepareBuyerPilot(result),true);
 assert.deepEqual(result.items,[
  {description:'cemento CPC de 50 kg',quantity:20,unit:'bag',
   family:'cemento_gris_obra'},
  {description:'arena (en bolsón de 1 m³ nominal)',quantity:3,unit:'m3',
   family:'arena_generica'},
  {description:'piedra (en bolsón de 1 m³ nominal)',quantity:2,unit:'m3',
   family:'piedra_generica'}
 ]);
});

test('MVP215: distingue genérico y específico sin inventar variedad',()=>{
 const text=[
  'Hola, necesito cotizar estos materiales:',
  '- 3 bolsones de arena fina.',
  '- 2 bolsones de piedra partida.',
  'Entrega en La Plata.','Gracias.'
 ].join('\n');
 const parsed=parseBuyerPilot(text);
 assert.equal(canPrepareBuyerPilot(parsed),true);
 assert.deepEqual(parsed.items.map(x=>x.family),['arena_fina','piedra_partida']);
 assert.ok(parsed.items.every(x=>x.unit==='m3' && x.description.includes('bolsón')));
});

test('MVP215: variedad ajena al rubro no se fuerza como arena ni piedra',()=>{
 const text='Necesito cotizar 3 bolsones de arena de vidrio.\nEntrega en La Plata';
 const parsed=parseBuyerPilot(text);
 assert.equal(canPrepareBuyerPilot(parsed),false);
 assert.equal(parsed.items.length,0);
 assert.equal(parsed.unresolved.length,1);
});

test('MVP215: sin localidad real no se prepara ningún pedido',()=>{
 const parsed=parseBuyerPilot('3 bolsones de arena y 2 bolsones de piedra');
 assert.equal(parsed.city,null);
 assert.equal(canPrepareBuyerPilot(parsed),false);
 assert.deepEqual(parsed.items.map(x=>x.family),['arena_generica','piedra_generica']);
});

test('MVP215: no equipara bolsas de cemento con bolsones',()=>{
 const parsed=parseBuyerPilot(
  '20 bolsas de cemento CPC de 50 kg; 2 bolsones de piedra.\nEntrega en La Plata.'
 );
 assert.equal(canPrepareBuyerPilot(parsed),true);
 assert.deepEqual(parsed.items.map(x=>x.unit),['bag','m3']);
});
