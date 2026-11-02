import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseDocumentClarification} from '../../supabase/functions/cotironda-piloto-whapi/document-clarification.ts';

test('MVP100: un único mensaje puede completar unidades, arena y localidad',()=>{
 assert.deepEqual(parseDocumentClarification(
  '1 bolsas; 2 m3 gruesa; 3 unidades; entrega: La Plata'),
  {city:'La Plata',changes:[
   {line_no:1,unit:'bag',family_hint:null},
   {line_no:2,unit:'m3',family_hint:'arena_gruesa'},
   {line_no:3,unit:'unit',family_hint:null}
  ]});
 assert.deepEqual(parseDocumentClarification('2 m³ fina; entrega: Berisso'),
  {city:'Berisso',changes:[{line_no:2,unit:'m3',family_hint:'arena_fina'}]});
 assert.deepEqual(parseDocumentClarification('1: kg\n3. unidades'),
  {city:null,changes:[
   {line_no:1,unit:'kg',family_hint:null},
   {line_no:3,unit:'unit',family_hint:null}
  ]});
});
test('MVP100: no permite ambigüedad, cantidades, precios o líneas duplicadas',()=>{
 for(const str of [
  '1 12 bolsas','1 bolsas; 1 unidades','2 m3 gruesa fina',
  '2 arena; IVA $100','3 300 unidades','9 bolsas',
  'entrega: Cemento','1 2 m3','1 bolsas; hola','1 precio',
  '1 200 bolsas cemento','1 unidades; 2 unidades; 2 kg'
 ])assert.equal(parseDocumentClarification(str),null,str);
});
test('MVP100: input no solicitado no se transforma en pedido',()=>{
 for(const str of ['hola','La Plata','quiero un presupuesto','BAJA'])
  assert.equal(parseDocumentClarification(str),null,str);
});
test('MVP100: diálogo usa el mismo archivo y no edita propuesta original',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp100_contextual_missing_materials.sql',import.meta.url),'utf8');
 const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
 assert.match(sql,/foreign key\(source_hmac,line_no\)/);
 assert.match(sql,/clarified_lines_mvp100 enable row level security/);
 assert.match(sql,/r\.state='api_accepted'/);
 assert.match(sql,/found_n<>1/);
 assert.match(sql,/source_message_hmac/);
 assert.match(sql,/already_clarified/);
 assert.doesNotMatch(sql,/set\s+proposal\s*=/iu);
 assert.match(edge,/parseDocumentClarification\(body\)/);
 assert.match(edge,/cotironda_piloto_apply_clarification_mvp100/);
 assert.match(edge,/cotironda_piloto_prepare_document_mvp099/);
 assert.match(edge,/cotironda_piloto_reserve_clarification_mvp100/);
 assert.match(edge,/mediaClarificationBody\?\?shortBusinessReply/);
});
