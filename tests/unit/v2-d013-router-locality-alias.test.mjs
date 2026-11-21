import test from 'node:test';
import assert from 'node:assert/strict';
import {zonaIgual} from '../../src/domain/ia-central/ruteador-catalogos-v2-d013.ts';

test('D013: ruteador admite las mismas variantes exactas de La Plata que la RPC del catálogo',()=>{
 for(const valid of [
  'La Plata',
  'La Plata, Buenos Aires',
  'La Plata, Buenos Aires, Argentina',
  'La Plata, Provincia de Buenos Aires',
  'La Plata, Provincia de Buenos Aires, Argentina'
 ]){
  assert.equal(zonaIgual('La Plata',valid),true,valid);
  assert.equal(zonaIgual(valid,'La Plata'),true,valid);
 }
});

test('D013: no cruza provincias, localidades o zonas adyacentes',()=>{
 for(const other of [
  'La Plata, Córdoba','La Plata, Santa Fe',
  'Berisso','Ensenada','La Plata Norte',
  'La Plata, Buenos Aires, Brasil'
 ]){
  assert.equal(zonaIgual('La Plata',other),false,other);
  assert.equal(zonaIgual(other,'La Plata'),false,other);
 }
 assert.equal(zonaIgual('Berisso','Berisso'),true);
 assert.equal(zonaIgual('Berisso','Ensenada'),false);
});
