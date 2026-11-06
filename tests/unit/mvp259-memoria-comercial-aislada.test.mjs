import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL(
 '../../supabase/piloto/mvp259_commercial_memory_scoped.sql',import.meta.url),'utf8');
const pg=readFileSync(new URL(
 '../../supabase/tests/ci/mvp259-commercial-memory-pg17.sql',import.meta.url),'utf8');

test('MVP259: no es memoria global de chat; scope ronda+persona+HMAC verificado',()=>{
 for(const token of [
  'request_id uuid NOT NULL','participant_key text NOT NULL',
  'source_message_hmac text NOT NULL','source_sha256 text NOT NULL',
  "e.request_id=p_request AND e.participant_key=participant_",
  'p.chat_hmac=p_chat_hmac','p.consent_at IS NOT NULL',
  'p.opted_out_at IS NULL','m.plaintext_sha256=p_source_sha256',
  'm.participant_key=participant_',
  "i.state='prepared'",'d.supplier_key=i.supplier_key'
 ])assert.ok(sql.includes(token),token);
 assert.match(sql,/UNIQUE\(request_id,participant_key,source_message_hmac,fact_kind\)/u);
 assert.match(sql,/p\.consent_at IS NOT NULL AND p\.opted_out_at IS NULL\s+FOR UPDATE/u);
});

test('MVP259: sólo hechos de fuentes acreditadas; no inventar precios ni datos personales',()=>{
 for(const term of [
  "fact_kind IN(","'buyer_delivery_city_verified'","'supplier_quote_verified'",
  "m.message_hmac=r.source_hmac","q.state='verified'",
  'q.source_sha256=p_source_sha256',
  'q.message_hmac=(', "ORDER BY last_.reserved_at DESC",
  "'contains_prices',false","'contains_contacts',false",
  "'automatic_decisions_allowed',false"
 ])assert.ok(sql.includes(term),term);
 assert.doesNotMatch(sql,/message_body|ciphertext_b64|nonce_b64|recipient_phone|contact_reveal|net\.http_post/u);
});

test('MVP259: nunca filtrar memoria de otro rubro o proveedor ni fuente antigua',()=>{
 assert.match(sql,/dest\.request_id=rub\.request_id AND dest\.line_no=rub\.line_no/u);
 assert.match(sql,/dest\.supplier_key=participant_/u);
 assert.match(sql,/r\.closes_at\+interval '14 days'>clock_timestamp\(\)/u);
 assert.match(sql,/e\.expires_at>clock_timestamp\(\)/u);
 assert.match(sql,/latest_verified_quote_remembered|own_latest_verified_quote_remembered/u);
 assert.match(sql,/previous_count_>=40/u);
 assert.match(pg,/mvp259_cross_supplier_scope/u);
 assert.match(pg,/mvp259_old_quote_wrongly_current/u);
 assert.match(pg,/mvp259_expiry_not_honored/u);
 assert.match(pg,/mvp259_revoked_supplier_visible/u);
});

test('MVP259: ACL de ambas funciones y RLS privado',()=>{
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/u);
 assert.match(sql,/REVOKE ALL ON cotironda_piloto_privado\.commercial_context_events_mvp259\s+FROM public,anon,authenticated,service_role/u);
 for(const fn of [
  'cotironda_piloto_remember_commercial_mvp259',
  'cotironda_piloto_commercial_context_mvp259'
 ]) {
  assert.ok(sql.includes('CREATE FUNCTION public.'+fn));
  assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+fn));
  assert.ok(sql.includes('GRANT EXECUTE ON FUNCTION public.'+fn));
 }
 assert.match(pg,/ROLLBACK;/u);
});
