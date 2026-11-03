import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {standaloneDeliveryCity} from '../../supabase/functions/cotironda-piloto-whapi/core.ts';

test('MVP097: respuesta corta de localidad se une a documento sin inventar unidades',()=>{
 for(const [input,expected] of [
  ['La Plata','La Plata'],['En Berisso','Berisso'],
  ['Entrega: City Bell','City Bell'],['Localidad: Los Hornos','Los Hornos'],
  ['Villa Elisa','Villa Elisa'],['Ensenada','Ensenada']
 ])assert.equal(standaloneDeliveryCity(input),expected);
});
test('MVP097: no interpretar saludos, precios ni mensajes ajenos como localidad',()=>{
 for(const input of ['hola','Gracias','Necesito un presupuesto',
 '10 bolsas cemento','2 Arena','¿Cuánto cuesta?','precio de cemento',
 'si','ok','listo','Buenos días', ''])assert.equal(
  standaloneDeliveryCity(input),null,input);
});
test('MVP097: imagen y texto con permisos y ledgers distintos, ambos sin reintento',()=>{
 const source=readFileSync(new URL(
 '../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(source,/cotironda_piloto_reserve_document_zone_reply_mvp097/);
 assert.match(source,/cotironda_piloto_attach_zone_to_document_mvp097/);
 assert.match(source,/proposal\.kind==='buyer_request'/);
 assert.match(source,/proposal\.delivery_city===null/);
 assert.match(source,/saved\.data===true/);
 assert.match(source,/aiReply=null/);
 assert.match(source,/standaloneDeliveryCity\(body\)/);
});
test('MVP097: topes operativos no son topes comerciales fijos en funciones',()=>{
 const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp097_operational_caps_without_artificial_friction.sql',import.meta.url),'utf8');
 for(const cap of ['max_media_per_24h','max_document_ai_per_24h',
   'max_text_ai_per_24h','max_replies_per_24h'])
  assert.match(sql,new RegExp(cap));
 assert.match(sql,/default 500/);
 assert.match(sql,/default 100/);
 assert.match(sql,/from public,anon,authenticated,service_role/);
 assert.match(sql,/operational_caps_mvp097 enable row level security/);
});
