import test from 'node:test';
import assert from 'node:assert/strict';
import {ciudadDeRespuestaCentralMvp234,estadoClaimZonaMvp234} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-city-mvp234.ts';

test('MVP234: respuestas cotidianas devuelven solo la localidad',()=>{
 const cases=[
  ['City Bell','City Bell'],
  ['En City Bell','City Bell'],
  ['La entrega es en City Bell','City Bell'],
  ['La entrega sería en City Bell.','City Bell'],
  ['Sería en Ensenada','Ensenada'],
  ['Es en Berisso','Berisso'],
  ['Es para Villa Elisa','Villa Elisa'],
  ['La obra queda en Tolosa','Tolosa'],
  ['localidad: La Plata','La Plata'],
  ['Zona de entrega: La Plata','La Plata'],
  ['Para City Bell','City Bell'],
  ['En San Vicente (Buenos Aires)','San Vicente (Buenos Aires)']
 ];
 for(const [input,expected] of cases){
  assert.equal(ciudadDeRespuestaCentralMvp234(input),expected,input);
 }
});

test('MVP234: mensajes comerciales o ambiguos no se hacen pasar por ciudad',()=>{
 for(const input of [
  'En City Bell necesito 20 bolsas de cemento',
  'La obra queda en City Bell y necesito pintura',
  'Quiero un presupuesto',
  'Te confirmo mañana',
  'Es en la obra pero no sé el lugar',
  'Hola, ¿me podés pasar precios?',
  'La entrega es en City Bell y el pedido es de arena',
  'La entrega sería en',
  'Es para',
  'En 1900',
  'En City Bell\n20 bolsas de cemento',
  'Hola',
  'Hola Buenos Aires',
  'Gracias',
  '',
  null,
  {},
  'x'.repeat(131)
 ])assert.equal(ciudadDeRespuestaCentralMvp234(input),null,String(input));
});

test('MVP234: sin diccionario de localidades inventado, preserva nombres válidos',()=>{
 assert.equal(ciudadDeRespuestaCentralMvp234('Los Hornos'),'Los Hornos');
 assert.equal(ciudadDeRespuestaCentralMvp234('En General Rodríguez'),'General Rodríguez');
 assert.equal(ciudadDeRespuestaCentralMvp234('En Mar del Plata'),'Mar del Plata');
});

test('MVP234: un claim repetido, ambiguo o sin pedido nunca abre nueva ronda',()=>{
 for(const state of ['ambiguous','no_pending','already_consumed']){
  assert.equal(estadoClaimZonaMvp234({state}),'consumed');
 }
 assert.equal(estadoClaimZonaMvp234({state:'resumed'}),'resume');
 for(const bad of [null,undefined,{},[],{state:'disabled'},
   {state:'not_authorized'},{state:'original_unavailable'},
   {state:'unexpected'},'resumed']){
  assert.equal(estadoClaimZonaMvp234(bad),'inconsistent');
 }
});
