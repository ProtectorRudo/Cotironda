import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aceptarRespuestaWhapiMvp287} from
 '../../supabase/functions/cotironda-piloto-whapi/ai-central-review-notice-mvp286.ts';
import {buildReaderDeliverySql} from '../../scripts/piloto/mvp287-reader-delivery-builder.mjs';
test('MVP287 nunca confunde 200 sin ID, sent:false o failed con entrega',()=>{
 const m='Whapi_Message_123456789';
 assert.deepEqual(aceptarRespuestaWhapiMvp287(true,{sent:false,message:{id:m}}),
  {accepted:false,messageId:m});
 assert.deepEqual(aceptarRespuestaWhapiMvp287(true,{status:'failed',message:{id:m}}),
  {accepted:false,messageId:m});
 assert.deepEqual(aceptarRespuestaWhapiMvp287(true,{sent:true,message:{id:m}}),
  {accepted:true,messageId:m});
 assert.deepEqual(aceptarRespuestaWhapiMvp287(false,{sent:true,message:{id:m}}),
  {accepted:false,messageId:m});
 assert.deepEqual(aceptarRespuestaWhapiMvp287(true,{sent:true,message:{id:'bad'}}),
  {accepted:false,messageId:null});
 assert.deepEqual(aceptarRespuestaWhapiMvp287(true,{id:m,status:'pending'}),
  {accepted:true,messageId:m});
 assert.deepEqual(aceptarRespuestaWhapiMvp287(true,null),
  {accepted:false,messageId:null});
});
test('MVP287 conserva parser original de status y agrega fuente única aviso comprador',()=>{
 const sql=readFileSync(new URL('../../supabase/piloto/mvp287_receipt_avisos_whapi.sql',import.meta.url),'utf8');
 assert.match(sql,/buyer_review_notice/u);
 assert.match(sql,/m\.participant_key='arquitecto'/u);
 assert.match(sql,/existing\.source_kind is distinct from matched_source_kind/u);
 assert.match(sql,/count_<>1/u);
 assert.match(sql,/TO service_role/u);
 assert.doesNotMatch(sql,/^\s*COMMIT\s*;/mu);
 const whole=buildReaderDeliverySql();
 const at=whole.indexOf('\\ir ../../piloto/mvp287_receipt_avisos_whapi.sql');
 const testAt=whole.indexOf('\\ir ./mvp287-notice-delivery-pg17.sql');
 const end=whole.indexOf('\nROLLBACK;\nSELECT');
 assert.ok(at>0&&testAt>at&&end>testAt);
 assert.equal(whole.split(/^ROLLBACK;\s*$/gm).length,2);
});
