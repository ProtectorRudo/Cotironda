-- MVP-016 D065. Ephemeral PostgreSQL17 only. All businesses/contacts fake.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous)
 values('11111111-0016-4016-8016-000000000661',now(),false);
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0016-4016-8016-000000000661','Fake buyer','buyer'),
 ('bbbbbbbb-0016-4016-8016-000000000662','Corralon habilitado','supplier'),
 ('bbbbbbbb-0016-4016-8016-000000000663','Pintureria habilitada','supplier'),
 ('bbbbbbbb-0016-4016-8016-000000000664','Corralon con BAJA','supplier'),
 ('bbbbbbbb-0016-4016-8016-000000000665','Corralon fuera de zona','supplier'),
 ('bbbbbbbb-0016-4016-8016-000000000666','Corralon sin aceptar','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values
 ('bbbbbbbb-0016-4016-8016-000000000662','Corralon A',true),
 ('bbbbbbbb-0016-4016-8016-000000000663','Pintureria B',true),
 ('bbbbbbbb-0016-4016-8016-000000000664','Corralon BAJA',true),
 ('bbbbbbbb-0016-4016-8016-000000000665','Corralon lejano',true),
 ('bbbbbbbb-0016-4016-8016-000000000666','Corralon deshabilitado',false);
insert into public.supplier_categories(organization_id,category_code,is_enabled)
 values
 ('bbbbbbbb-0016-4016-8016-000000000662','corralon',true),
 ('bbbbbbbb-0016-4016-8016-000000000663','pintureria',true),
 ('bbbbbbbb-0016-4016-8016-000000000664','corralon',true),
 ('bbbbbbbb-0016-4016-8016-000000000665','corralon',true),
 ('bbbbbbbb-0016-4016-8016-000000000666','corralon',true);
insert into public.supplier_delivery_areas(organization_id,province,city,is_enabled)
 values
 ('bbbbbbbb-0016-4016-8016-000000000662','Buenos Aires','La Plata',true),
 ('bbbbbbbb-0016-4016-8016-000000000663','Buenos Aires','La Plata',true),
 ('bbbbbbbb-0016-4016-8016-000000000664','Buenos Aires','La Plata',true),
 ('bbbbbbbb-0016-4016-8016-000000000665','Santa Fe','Rosario',true),
 ('bbbbbbbb-0016-4016-8016-000000000666','Buenos Aires','La Plata',true);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at,opted_out_at)
 select 'd065_ci',repeat(c.letter,64),c.org,
  now()-interval '1 day',now()-interval '1 day',
  case when c.letter='c' then now()-interval '5 minutes' else null end
 from (values
  ('a','bbbbbbbb-0016-4016-8016-000000000662'::uuid),
  ('b','bbbbbbbb-0016-4016-8016-000000000663'::uuid),
  ('c','bbbbbbbb-0016-4016-8016-000000000664'::uuid),
  ('d','bbbbbbbb-0016-4016-8016-000000000665'::uuid),
  ('e','bbbbbbbb-0016-4016-8016-000000000666'::uuid)
 ) c(letter,org);
insert into cotironda_private.rounds_v1
 (id,buyer_org_id,begins_at,ends_at) values
 ('dddddddd-0016-4016-8016-000000000661',
  'aaaaaaaa-0016-4016-8016-000000000661',
  now()-interval '1 minute',now()+interval '1 hour'),
 ('dddddddd-0016-4016-8016-000000000662',
  'aaaaaaaa-0016-4016-8016-000000000661',
  now()-interval '1 minute',now()+interval '1 hour'),
 ('dddddddd-0016-4016-8016-000000000663',
  'aaaaaaaa-0016-4016-8016-000000000661',
  now()-interval '1 minute',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values
 ('dddddddd-0016-4016-8016-000000000661',1,'cemento_001',10,'bag'),
 ('dddddddd-0016-4016-8016-000000000661',2,'pintura_002',5,'l'),
 ('dddddddd-0016-4016-8016-000000000662',1,'cemento_001',10,'bag'),
 ('dddddddd-0016-4016-8016-000000000663',1,'cemento_001',10,'bag');
insert into cotironda_private.round_requests_d064
 (round_id,buyer_org_id,created_by,request_key,content_sha256,
 delivery_zone,buyer_iva_request)
 values
 ('dddddddd-0016-4016-8016-000000000661',
  'aaaaaaaa-0016-4016-8016-000000000661',
  '11111111-0016-4016-8016-000000000661',
  'cccccccc-0016-4016-8016-000000000661',repeat('a',64),
  'La Plata','no_especificado'),
 ('dddddddd-0016-4016-8016-000000000662',
  'aaaaaaaa-0016-4016-8016-000000000661',
  '11111111-0016-4016-8016-000000000661',
  'cccccccc-0016-4016-8016-000000000662',repeat('b',64),
  'Zona inexistente','no_especificado'),
 ('dddddddd-0016-4016-8016-000000000663',
  'aaaaaaaa-0016-4016-8016-000000000661',
  '11111111-0016-4016-8016-000000000661',
  'cccccccc-0016-4016-8016-000000000663',repeat('c',64),
  'La Plata','no_especificado');

do $security$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_matcher_d065'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_match_gateway_d065'
  and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('authenticated',
  'cotironda_private.prepare_supplier_invites_d065(uuid,text)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.prepare_supplier_invites_d065(uuid,text)','EXECUTE')
 or has_function_privilege('anon',
  'cotironda_private.prepare_supplier_invites_d065(uuid,text)','EXECUTE')
 or not has_function_privilege('cotironda_match_gateway_d065',
  'cotironda_private.prepare_supplier_invites_d065(uuid,text)','EXECUTE')
 or has_table_privilege('cotironda_match_gateway_d065',
  'cotironda_private.round_invites_v1','SELECT')
 or has_table_privilege('cotironda_matcher_d065',
  'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_matcher_d065',
  'cotironda_private.whapi_reply_jobs_d047','INSERT')
 or not (select relrowsecurity from pg_class
  where oid='cotironda_private.round_supplier_lines_d065'::regclass)
 then raise exception 'd065_security_invariant_failed';end if;
end;$security$;
-- Gateway can only execute; not directly read contacts or other buyers.
set local role cotironda_match_gateway_d065;
do $pre$
declare r jsonb;
begin
 r:=cotironda_private.prepare_supplier_invites_d065(
 'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'state'<>'needs_verified_location' and r->>'state'<>'needs_catalog_mapping'
 then raise exception 'd065_should_not_match_unmapped_request: %',r;end if;
end;$pre$;
reset role;
-- A known location alone does not make unknown materials safe to route.
insert into cotironda_private.delivery_localities_d065(alias_key,province,city)
 values('la plata','Buenos Aires','La Plata');
set local role cotironda_match_gateway_d065;
do $unmapped$
declare r jsonb;
begin
 r:=cotironda_private.prepare_supplier_invites_d065(
 'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'state'<>'needs_catalog_mapping' or r->>'invited'<>'0'
 then raise exception 'd065_unmapped_material_was_sent: %',r;end if;
end;$unmapped$;
reset role;
insert into cotironda_private.item_rubros_d065(product_code,category_code) values
 ('cemento_001','corralon'),('pintura_002','pintureria');

set local role cotironda_match_gateway_d065;
do $match$
declare r jsonb;
begin
 r:=cotironda_private.prepare_supplier_invites_d065(
 'dddddddd-0016-4016-8016-000000000662','d065_ci');
 if r->>'state'<>'needs_verified_location' then
  raise exception 'd065_unverified_locality_assumed_province: %',r;end if;
 r:=cotironda_private.prepare_supplier_invites_d065(
 'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'state'<>'prepared' or r->>'invited'<>'2' or r->>'messagesSent'<>'0'
 then raise exception 'd065_prepared_wrong: %',r;end if;
 r:=cotironda_private.prepare_supplier_invites_d065(
 'dddddddd-0016-4016-8016-000000000661','d065_ci');
 if r->>'state'<>'already_prepared' or r->>'invited'<>'2'
 then raise exception 'd065_replay_duplicate: %',r;end if;
end;$match$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.round_invites_v1
 where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd065_only_two_eligible_suppliers');
select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.round_supplier_lines_d065
 where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd065_exactly_one_line_each_supplier');
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.round_supplier_lines_d065
 where round_id='dddddddd-0016-4016-8016-000000000661'
 and supplier_org_id='bbbbbbbb-0016-4016-8016-000000000662'
 and line_no=1 and category_code='corralon'),
 'd065_corralon_receives_only_cement');
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.round_supplier_lines_d065
 where round_id='dddddddd-0016-4016-8016-000000000661'
 and supplier_org_id='bbbbbbbb-0016-4016-8016-000000000663'
 and line_no=2 and category_code='pintureria'),
 'd065_paintshop_receives_only_paint');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047
 where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd065_no_whatsapp_outbox');
select ci_helpers.assert_true(
 (select status='programada' from cotironda_private.rounds_v1
 where id='dddddddd-0016-4016-8016-000000000661'),
 'd065_not_opened_before_real_sender');

set local role cotironda_match_gateway_d065;
do $wrong_channel$
declare failed boolean:=false;state text;
begin
 begin
  perform cotironda_private.prepare_supplier_invites_d065(
   'dddddddd-0016-4016-8016-000000000661','other_channel');
 exception when insufficient_privilege then failed:=true;end;
 if not failed then raise exception 'd065_cross_channel_replay_accepted';end if;
end;$wrong_channel$;
reset role;
-- D066 tests reuse this synthetic transaction (no DEV).
\ir 123_whapi_encrypted_recipient_d068.sql
\ir 121_supplier_packet_d066.sql
rollback;
