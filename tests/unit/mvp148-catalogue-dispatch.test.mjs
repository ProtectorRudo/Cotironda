import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../../supabase/piloto/mvp148_per_request_catalogue_dispatch.sql',import.meta.url),'utf8');
test('MVP148: permiso de envío acotado a WhatsApp auténtico y compradores/proveedores existentes',()=>{
 assert.match(sql,/create or replace function cotironda_piloto_privado\.allow_next_pilot_send_mvp091/u);
 assert.match(sql,/source\.request_id=r\.id and source\.message_hmac=r\.source_hmac/u);
 assert.match(sql,/source\.participant_key=b\.key and source\.chat_hmac=b\.chat_hmac/u);
 assert.match(sql,/source\.kind='text' and source\.processing_state='recorded'/u);
 assert.match(sql,/r\.buyer_key='arquitecto'/u);
 assert.match(sql,/s\.key in \('corralon_ailin','corralon_nahuel'\)/u);
 assert.match(sql,/flags\.whatsapp_outbound_enabled=true/u);
 assert.match(sql,/r\.state='prepared' and r\.closes_at>clock_timestamp\(\)/u);
 assert.match(sql,/s\.delivery_city=r\.delivery_city/u);
 assert.match(sql,/b\.consent_at is not null and b\.opted_out_at is null/u);
 assert.match(sql,/s\.consent_at is not null and s\.opted_out_at is null/u);
 assert.match(sql,/i\.state='prepared'/u);
 assert.match(sql,/between 1 and 8/u);
 assert.match(sql,/c\.recognition_state='curated_family'/u);
 assert.match(sql,/not exists\(\s*select 1 from cotironda_piloto_privado\.offer_versions/u);
});
test('MVP148: elimina ventana única y lista arbitraria de dos rubros sin abrir ACL públicas',()=>{
 assert.doesNotMatch(sql,/next_round_window_mvp091/u);
 assert.doesNotMatch(sql,/l\.family_code not in/u);
 assert.match(sql,/revoke all on function/u);
 assert.match(sql,/from public,anon,authenticated,service_role/u);
 assert.doesNotMatch(sql,/cotironda_piloto_claim_whapi_v1|cotironda_piloto_authorize_whapi_v1|whapi_outbox\s+set/u);
});
