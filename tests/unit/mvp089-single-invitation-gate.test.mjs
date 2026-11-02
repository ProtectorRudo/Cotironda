import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(name)=>readFileSync(new URL('../../supabase/piloto/'+name,import.meta.url),'utf8');
const mig=read('mvp089_one_invitation_send_gate.sql');
const op=read('mvp089_one_invitation_operator.sql');
const smoke=read('mvp089_smoke_rollback.sql');

test('MVP089: una sola autorización de envío al proveedor de ensayo, nunca masiva',()=>{
 assert.match(mig,/only_row boolean primary key default true check\(only_row=true\)/);
 assert.match(mig,/scope\.supplier_key='corralon_nahuel'/);
 assert.match(mig,/scope\.expires_at>clock_timestamp\(\)/);
 assert.match(mig,/scope\.expires_at<=r\.closes_at/);
 assert.match(mig,/r\.delivery_city='La Plata'/);
 assert.match(mig,/r\.state='prepared'/);
 assert.match(mig,/p\.opted_out_at is null/);
 assert.match(mig,/buyer\.opted_out_at is null/);
 assert.match(mig,/i\.state='prepared'/);
 assert.match(mig,/allow_single_test_send_mvp089\(o\.request_id,o\.supplier_key\)/);
 assert.match(mig,/for update of o skip locked limit 1/);
 assert.match(mig,/lease_token=p_lease/);
 assert.match(mig,/not exists\(select 1 from cotironda_piloto_privado\.offer_versions/);
 assert.doesNotMatch(mig,/whatsapp_outbound_enabled\s*=\s*true/);
});

test('MVP089: no confirma ciegamente los 51 artículos ni invita por zona genérica',()=>{
 assert.match(mig,/c\.family_code=l\.family_code/);
 assert.match(mig,/c\.recognition_state='curated_family'/);
 assert.match(mig,/l\.family_code='cemento_gris_obra'/);
 assert.match(mig,/l\.family_code='hidrofugo'/);
 assert.match(mig,/p\.delivery_city=r\.delivery_city/);
 assert.doesNotMatch(mig,/set catalogue_confirmed_at|update cotironda_piloto_privado\.catalogue_lines/i);
 assert.match(op,/supplier_key='corralon_nahuel'/);
 assert.doesNotMatch(op,/whatsapp_outbound_enabled\s*=\s*true/);
});

test('MVP089: mensaje comercial usa unidades legibles y agrega entrega sin inventar precios',()=>{
 assert.match(mig,/l\.quantity=trunc\(l\.quantity\)/);
 assert.match(mig,/when 'bag' then 'bolsas'/);
 assert.match(mig,/when 'l' then 'litros'/);
 assert.match(mig,/Respondé este WhatsApp/);
 assert.match(op,/invitation_body_mvp089\(rid\)/);
 assert.doesNotMatch(mig,/messages\/text|gate\.whapi|http_post|pg_net/);
});

test('MVP089: smoke simula activación dentro de transacción reversible',()=>{
 assert.match(smoke,/^begin;/m);
 assert.match(smoke,/^rollback;/m);
 assert.match(smoke,/mvp089_unscoped_must_not_send/);
 assert.match(smoke,/mvp089_not_one_nahuel_claim/);
 assert.match(smoke,/mvp089_duplicate_claim/);
 assert.match(smoke,/mvp089_optout_not_respected/);
 assert.match(smoke,/mvp089_expired_scope_not_respected/);
 assert.match(smoke,/mvp089_bad_whatsapp_quantities/);
 assert.match(smoke,/mvp089_wrong_lease_accepted/);
 assert.doesNotMatch(smoke,/whapi\.cloud|fetch\(|https?:\/\//);
});
