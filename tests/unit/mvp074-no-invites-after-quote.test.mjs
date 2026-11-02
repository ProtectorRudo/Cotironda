import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync(new URL('../../supabase/piloto/mvp074_no_invites_after_quote.sql',import.meta.url),'utf8');

test('MVP074: la oferta recibida cancela solo outbox pendiente de mismo pedido y proveedor',()=>{
 assert.match(sql,/after insert on cotironda_piloto_privado\.offer_versions/);
 assert.match(sql,/o\.request_id=new\.request_id/);
 assert.match(sql,/o\.supplier_key=new\.supplier_key/);
 assert.match(sql,/o\.state='pending'/);
 assert.match(sql,/set state='cancelled'/);
 assert.match(sql,/return new;/i);
});
test('MVP074: reparar backlog solo si la oferta corresponde al mismo pedido y proveedor',()=>{
 assert.match(sql,/update cotironda_piloto_privado\.whapi_outbox o[\s\S]*?where o\.state='pending'[\s\S]*?exists\(/);
 assert.match(sql,/v\.request_id=o\.request_id and v\.supplier_key=o\.supplier_key/);
 assert.doesNotMatch(sql,/set state='api_accepted'/);
 assert.doesNotMatch(sql,/delete from/);
});
test('MVP074: claim revalida oferta existente; no afecta guard de comprador ni skip locked',()=>{
 const claim=sql.slice(sql.indexOf('create or replace function public.cotironda_piloto_claim_whapi_v1()'),
  sql.indexOf('create or replace function public.cotironda_piloto_authorize_whapi_v1('));
 assert.match(claim,/not exists\([\s\S]*?cotironda_piloto_privado\.offer_versions v/);
 assert.match(claim,/v\.request_id=o\.request_id and v\.supplier_key=o\.supplier_key/);
 assert.match(claim,/buyer\.consent_at is not null/);
 assert.match(claim,/r\.created_at>clock_timestamp\(\)-interval '7 days'/);
 assert.match(claim,/for update of o skip locked limit 1/);
 assert.match(claim,/whatsapp_outbound_enabled=true/);
});
test('MVP074: autorización antes de HTTP bloquea si la cotización llegó luego del lease',()=>{
 const auth=sql.slice(sql.indexOf('create or replace function public.cotironda_piloto_authorize_whapi_v1('));
 assert.match(auth,/o\.state='leased' and o\.lease_token=p_lease/);
 assert.match(auth,/not exists\([\s\S]*?cotironda_piloto_privado\.offer_versions v/);
 assert.match(auth,/v\.request_id=o\.request_id and v\.supplier_key=o\.supplier_key/);
 assert.match(auth,/buyer\.consent_at is not null/);
 assert.match(auth,/f\.whatsapp_outbound_enabled=true/);
 assert.match(auth,/revoke all.*?public,anon,authenticated/s);
 assert.match(auth,/grant execute.*?to service_role/s);
});
test('MVP074: no modifica fuentes de oferta, no envía WhatsApp y no expone secreto',()=>{
 assert.doesNotMatch(sql,/update\s+cotironda_piloto_privado\.offer_versions/i);
 assert.doesNotMatch(sql,/delete\s+from\s+cotironda_piloto_privado\.offer_versions/i);
 assert.doesNotMatch(sql,/https:\/\//i);
 assert.doesNotMatch(sql,/COTIRONDA_PILOT_WHAPI_TOKEN/);
 assert.doesNotMatch(sql,/\b221\d{7}\b/);
});
