import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/mvp257_whapi_uncertain_evidence.sql',import.meta.url),'utf8');
const edge=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/index.ts',import.meta.url),'utf8');
const parser=readFileSync(new URL('../../supabase/functions/cotironda-piloto-whapi/delivery-status.ts',import.meta.url),'utf8');
const prior=readFileSync(new URL('../../supabase/piloto/mvp119_whapi_delivery_receipts.sql',import.meta.url),'utf8');
test('MVP257: registrar evidencia de estado sólo tras autenticación y canal',()=>{
 const auth=edge.indexOf('if(!authenticated){'),channel=edge.indexOf('if(event.channel_id!==sec.channel)');
 const status=edge.indexOf('if(statusAction){');
 const original=edge.indexOf("cotironda_piloto_record_delivery_mvp119");
 const recovery=edge.indexOf("cotironda_piloto_observe_uncertain_whapi_mvp257");
 assert.ok(auth>0&&channel>auth&&status>channel&&original>status&&recovery>original);
 assert.match(edge,/if\(receipt\.data\?\.state==='unmatched'\)/u);
 assert.match(edge,/if\(uncertain\.error\)return json\(503,'status_storage_unavailable'\)/u);
 assert.match(edge,/p_recipient_chat_hmac:recipientHmac/u);
 assert.match(parser,/parseWhapiDirectStatuses/u);
});
test('MVP257: no mutar tablas de envíos, reenviar o revelar PII',()=>{
 assert.match(sql,/uncertain_whapi_receipts_mvp257/u);
 assert.match(sql,/ALTER TABLE .*uncertain_whapi_receipts_mvp257\s+ENABLE ROW LEVEL SECURITY/iu);
 for(const table of ['whapi_outbox','ai_dispatch_jobs_mvp222','buyer_tracking_mvp091',
  'supplier_ack_mvp104','finalist_whapi_outbox_mvp110']){
  assert.ok(sql.includes(table),table);
  assert.doesNotMatch(sql,new RegExp('UPDATE cotironda_piloto_privado\\.'+table+'\\b','iu'));
 }
 assert.doesNotMatch(sql,/messages\/text|messages\/document|net\.http_post|phone_number|message_body|sender_name|original_text/iu);
 assert.match(sql,/'automatic_resend_allowed',false/u);
 assert.match(sql,/WHERE whapi_message_id=p_whapi_message_id/u);
 assert.match(sql,/IF matches_<>1 THEN RETURN jsonb_build_object\('state','unmatched'\)/u);
 assert.match(prior,/p\.chat_hmac=p_recipient_chat_hmac/u);
});
test('MVP257: estado incierto no equivale a entrega; no retrocede de delivered a failed',()=>{
 assert.match(sql,/WHEN 'delivered' THEN 3 WHEN 'read' THEN 4 WHEN 'played' THEN 5/u);
 assert.match(sql,/IF new_rank_<=old_rank_/u);
 assert.match(sql,/p_status_code IS DISTINCT FROM \(CASE p_status/u);
 assert.match(sql,/p_event_unix<extract\(epoch from clock_timestamp\(\)-interval '7 days'\)/u);
 assert.match(sql,/p_event_unix>extract\(epoch from clock_timestamp\(\)\+interval '5 minutes'\)/u);
 assert.match(sql,/JOIN cotironda_piloto_privado.participants p/u);
 assert.match(sql,/p\.chat_hmac=p_recipient_chat_hmac/u);
});
test('MVP257: sólo service_role puede registrar comprobantes y ver agregados',()=>{
 for(const signature of [
 'public.cotironda_piloto_observe_uncertain_whapi_mvp257(',
 'public.cotironda_piloto_uncertain_summary_mvp257()'
 ]){
  const start=sql.indexOf('REVOKE ALL ON FUNCTION '+signature);
  assert.ok(start>0);
  const range=sql.slice(start,start+420);
  assert.match(range,/FROM public,anon,authenticated/u);
  assert.match(range,/TO service_role/u);
 }
 assert.match(sql,/REVOKE ALL ON cotironda_piloto_privado.uncertain_whapi_receipts_mvp257\s+FROM public,anon,authenticated,service_role/u);
});
