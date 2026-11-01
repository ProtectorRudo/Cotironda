-- MVP-056: rehearsal of buyer WhatsApp -> 5-day round -> 3 shops, ONE channel.
-- PostgreSQL17 disposable CI ONLY. No phone numbers, keys, sends or DEV writes.
begin;
\ir ../../sql/pilot_curated_dictionary_d079.sql

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0056-4056-8056-000000000561','Arquitecto CI','buyer'),
 ('bbbbbbbb-0056-4056-8056-000000000561','Corralon A CI','supplier'),
 ('bbbbbbbb-0056-4056-8056-000000000562','Corralon B CI','supplier'),
 ('bbbbbbbb-0056-4056-8056-000000000563','Pintureria C CI','supplier'),
 ('bbbbbbbb-0056-4056-8056-000000000564','Sin productos CI','supplier'),
 ('bbbbbbbb-0056-4056-8056-000000000565','Fuera de zona CI','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
select id,display_name,true from public.organizations
where id in ('bbbbbbbb-0056-4056-8056-000000000561'::uuid,
'bbbbbbbb-0056-4056-8056-000000000562'::uuid,
'bbbbbbbb-0056-4056-8056-000000000563'::uuid,
'bbbbbbbb-0056-4056-8056-000000000564'::uuid,
'bbbbbbbb-0056-4056-8056-000000000565'::uuid);
insert into public.supplier_categories(organization_id,category_code,is_enabled)
values
 ('bbbbbbbb-0056-4056-8056-000000000561','corralon',true),
 ('bbbbbbbb-0056-4056-8056-000000000562','corralon',true),
 ('bbbbbbbb-0056-4056-8056-000000000563','pintureria',true),
 ('bbbbbbbb-0056-4056-8056-000000000564','corralon',true),
 ('bbbbbbbb-0056-4056-8056-000000000565','pintureria',true);
insert into public.supplier_delivery_areas(organization_id,province,city,is_enabled)
select organization_id,
 case when organization_id='bbbbbbbb-0056-4056-8056-000000000565'::uuid then 'Santa Fe' else 'Buenos Aires' end,
 case when organization_id='bbbbbbbb-0056-4056-8056-000000000565'::uuid then 'Rosario' else 'La Plata' end,true
from public.supplier_profiles
where organization_id in (
 'bbbbbbbb-0056-4056-8056-000000000561'::uuid,
 'bbbbbbbb-0056-4056-8056-000000000562'::uuid,
 'bbbbbbbb-0056-4056-8056-000000000563'::uuid,
 'bbbbbbbb-0056-4056-8056-000000000564'::uuid,
 'bbbbbbbb-0056-4056-8056-000000000565'::uuid);
-- Same channel for ALL participants. Cryptographic chat keys are mock SHA
-- fingerprints, not plaintext numbers or production contact identities.
insert into cotironda_private.whapi_buyer_contacts_d074
 (channel_id,chat_key,buyer_org_id,verified_at,consented_at) values
 ('pilot56_channel',repeat('a',64),
  'aaaaaaaa-0056-4056-8056-000000000561',
  now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_buyer_inbox_d074
 (channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
  crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
values ('pilot56_channel',repeat('1',64),repeat('a',64),
 'aaaaaaaa-0056-4056-8056-000000000561',repeat('7',64),'text','aes_2026_a',
 decode(repeat('44',45),'hex'),decode(repeat('55',12),'hex'),
 decode(repeat('66',16),'hex'),1800000000,'pendiente_interpretacion');
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
select 'pilot56_channel',repeat(z.k,64),z.s,now()-interval '1 day',
 now()-interval '1 day' from (values
 ('b','bbbbbbbb-0056-4056-8056-000000000561'::uuid),
 ('c','bbbbbbbb-0056-4056-8056-000000000562'::uuid),
 ('d','bbbbbbbb-0056-4056-8056-000000000563'::uuid),
 ('e','bbbbbbbb-0056-4056-8056-000000000564'::uuid),
 ('f','bbbbbbbb-0056-4056-8056-000000000565'::uuid)) z(k,s);

-- Two corralones stock cement, only A stock hydrophobe; C paints.
-- D080 private matching requires concrete current products, not a bare category.
insert into public.supplier_products
 (id,organization_id,category_code,product_name,unit_code) values
 ('eeeeeeee-0056-4056-8056-000000000561',
  'bbbbbbbb-0056-4056-8056-000000000561','corralon',
  'Cemento CPC 50 kg','bag'),
 ('eeeeeeee-0056-4056-8056-000000000562',
  'bbbbbbbb-0056-4056-8056-000000000561','corralon',
  'Hidrofugo para mezcla','l'),
 ('eeeeeeee-0056-4056-8056-000000000563',
  'bbbbbbbb-0056-4056-8056-000000000562','corralon',
  'Cemento CPC 50 kg','bag'),
 ('eeeeeeee-0056-4056-8056-000000000564',
  'bbbbbbbb-0056-4056-8056-000000000563','pintureria',
  'Pintura latex blanca','l'),
 ('eeeeeeee-0056-4056-8056-000000000565',
  'bbbbbbbb-0056-4056-8056-000000000565','pintureria',
  'Pintura latex blanca','l');
insert into cotironda_private.supplier_catalog_capabilities_d080
 (catalog_product_id,product_code,fingerprint_sha256)
select id,
 case when id='eeeeeeee-0056-4056-8056-000000000562'::uuid then 'hidrofugo'
      when category_code='pintureria' then 'pintura_latex'
      else 'cemento_gris_obra' end,
 cotironda_private.catalog_fingerprint_d080(id)
from public.supplier_products
where id in('eeeeeeee-0056-4056-8056-000000000561'::uuid,
'eeeeeeee-0056-4056-8056-000000000562'::uuid,
'eeeeeeee-0056-4056-8056-000000000563'::uuid,
'eeeeeeee-0056-4056-8056-000000000564'::uuid,
'eeeeeeee-0056-4056-8056-000000000565'::uuid);

-- An authenticated HMAC-bound original WhatsApp message, not a forged JWT.
-- IA extraction is out of scope; here items are already curated by D078.
create temp table pilot56_created(round_id uuid);
grant insert on pg_temp.pilot56_created to cotironda_whapi_round_gateway_d081;
grant select on pg_temp.pilot56_created to cotironda_match_gateway_d065;
set local role cotironda_whapi_round_gateway_d081;
do $create$declare v jsonb;v_replay jsonb;v_items jsonb:= '[
 {"line_no":1,"product_code":"cemento_gris_obra",
 "source_description":"Cemento CPC 50 kg","quantity":"20","unit":"bag"},
 {"line_no":2,"product_code":"hidrofugo",
 "source_description":"Hidrofugo para mezclas","quantity":"10","unit":"l"},
 {"line_no":3,"product_code":"pintura_latex",
 "source_description":"Pintura latex blanca","quantity":"5","unit":"l"}
]'::jsonb;
begin
 v:=cotironda_private.whapi_create_buyer_round_d081(
 'pilot56_channel',repeat('a',64),repeat('1',64),repeat('1',64),
 'aaaaaaaa-0056-4056-8056-000000000561',
 'La Plata','no_especificado',v_items,5);
 if v->>'repetida'<>'false' then raise exception 'mvp056_create_failed: %',v;end if;
 insert into pg_temp.pilot56_created values((v->>'roundId')::uuid);
 v_replay:=cotironda_private.whapi_create_buyer_round_d081(
 'pilot56_channel',repeat('a',64),repeat('1',64),repeat('1',64),
 'aaaaaaaa-0056-4056-8056-000000000561',
 'La Plata','no_especificado',v_items,5);
 if v_replay->>'repetida'<>'true' or v_replay->>'roundId'<>v->>'roundId'
  then raise exception 'mvp056_message_replay_duplicate_round';end if;
end;$create$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.rounds_v1 r
  join pg_temp.pilot56_created s on s.round_id=r.id
  where r.status='programada'
   and r.ends_at-r.begins_at=interval '5 days'-interval '30 seconds')
 and (select count(*)=3 from cotironda_private.round_items_v1 i
      join pg_temp.pilot56_created s on s.round_id=i.round_id)
 and (select count(*)=1 from cotironda_private.buyer_whapi_round_sources_d081
      where channel_id='pilot56_channel'),
 'mvp056_valid_whapi_round_five_days_three_materials');

set local role cotironda_match_gateway_d065;
do $prepare$declare v jsonb;v_again jsonb;
begin
 select cotironda_private.prepare_supplier_invites_d065(s.round_id,
  'pilot56_channel') into v from pg_temp.pilot56_created s;
 if v->>'state'<>'prepared' or v->>'invited'<>'3'
    or v->>'messagesSent'<>'0' then
  raise exception 'mvp056_wrong_suppliers: %',v;end if;
 select cotironda_private.prepare_supplier_invites_d065(s.round_id,
  'pilot56_channel') into v_again from pg_temp.pilot56_created s;
 if v_again->>'state'<>'already_prepared' or v_again->>'invited'<>'3'
  then raise exception 'mvp056_duplicate_invites: %',v_again;end if;
end;$prepare$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=3 from cotironda_private.round_invites_v1 i
   join pg_temp.pilot56_created s on s.round_id=i.round_id)
 and (select count(*)=4 from cotironda_private.round_supplier_lines_d065 l
   join pg_temp.pilot56_created s on s.round_id=l.round_id)
 and (select count(*)=2 from cotironda_private.round_supplier_lines_d065 l
   join pg_temp.pilot56_created s on s.round_id=l.round_id
   where l.supplier_org_id='bbbbbbbb-0056-4056-8056-000000000561'
     and l.category_code='corralon' and l.line_no in(1,2))
 and (select count(*)=1 from cotironda_private.round_supplier_lines_d065 l
   join pg_temp.pilot56_created s on s.round_id=l.round_id
   where l.supplier_org_id='bbbbbbbb-0056-4056-8056-000000000562'
     and l.category_code='corralon' and l.line_no=1)
 and (select count(*)=1 from cotironda_private.round_supplier_lines_d065 l
   join pg_temp.pilot56_created s on s.round_id=l.round_id
   where l.supplier_org_id='bbbbbbbb-0056-4056-8056-000000000563'
     and l.category_code='pintureria' and l.line_no=3)
 and (select count(*)=0 from cotironda_private.round_invites_v1 i
   join pg_temp.pilot56_created s on s.round_id=i.round_id
   where i.supplier_org_id in (
    'bbbbbbbb-0056-4056-8056-000000000564'::uuid,
    'bbbbbbbb-0056-4056-8056-000000000565'::uuid)),
 'mvp056_exact_catalog_area_distribution_three_shops');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047 j
   join pg_temp.pilot56_created s on s.round_id=j.round_id),
 'mvp056_zero_whatsapp_sends');
rollback;
