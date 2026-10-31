-- MVP-030 / D079. Only synthetic data. Real PostgreSQL 17 CI.
-- D024 D064 D065 D066 D070 D071 installed earlier in disposable DB.
-- One buyer via real Auth-bound D064 RPC, 2 corralones in La Plata,
-- other shops wrong locality or opted out. All rolled back.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('11111111-0030-4030-8030-000000000701',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('33333333-0030-4030-8030-000000000701',
  '11111111-0030-4030-8030-000000000701',now()+interval '1 day');
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0030-4030-8030-000000000701','Buyer pilot CI','buyer'),
 ('bbbbbbbb-0030-4030-8030-000000000702','Corralon A CI','supplier'),
 ('bbbbbbbb-0030-4030-8030-000000000703','Corralon B CI','supplier'),
 ('bbbbbbbb-0030-4030-8030-000000000704','Corralon Rosario CI','supplier'),
 ('bbbbbbbb-0030-4030-8030-000000000705','Corralon BAJA CI','supplier');
insert into public.organization_members
 (organization_id,user_id,membership_role,status) values
 ('aaaaaaaa-0030-4030-8030-000000000701',
  '11111111-0030-4030-8030-000000000701','owner','active');
insert into public.supplier_profiles
 (organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0030-4030-8030-000000000702','Proveedor A ficticio',true),
 ('bbbbbbbb-0030-4030-8030-000000000703','Proveedor B ficticio',true),
 ('bbbbbbbb-0030-4030-8030-000000000704','Fuera de localidad',true),
 ('bbbbbbbb-0030-4030-8030-000000000705','Consentimiento revocado',true);
insert into public.supplier_categories(organization_id,category_code,is_enabled)
 values
 ('bbbbbbbb-0030-4030-8030-000000000702','corralon',true),
 ('bbbbbbbb-0030-4030-8030-000000000703','corralon',true),
 ('bbbbbbbb-0030-4030-8030-000000000704','corralon',true),
 ('bbbbbbbb-0030-4030-8030-000000000705','corralon',true);
insert into public.supplier_delivery_areas
 (organization_id,province,city,is_enabled) values
 ('bbbbbbbb-0030-4030-8030-000000000702','Buenos Aires','La Plata',true),
 ('bbbbbbbb-0030-4030-8030-000000000703','Buenos Aires','La Plata',true),
 ('bbbbbbbb-0030-4030-8030-000000000704','Santa Fe','Rosario',true),
 ('bbbbbbbb-0030-4030-8030-000000000705','Buenos Aires','La Plata',true);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at,opted_out_at)
 select 'd079_ci',repeat(x.letter,64),x.org,
  now()-interval '1 day',now()-interval '1 day',
  case when x.letter='d' then now()-interval '1 minute' else null end
 from (values
  ('a','bbbbbbbb-0030-4030-8030-000000000702'::uuid),
  ('b','bbbbbbbb-0030-4030-8030-000000000703'::uuid),
  ('c','bbbbbbbb-0030-4030-8030-000000000704'::uuid),
  ('d','bbbbbbbb-0030-4030-8030-000000000705'::uuid)
 ) x(letter,org);

-- Real Auth caller, NOT direct INSERT: buyer session, private D064 checks.
set local role authenticated;
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-0030-4030-8030-000000000701",
 "session_id":"33333333-0030-4030-8030-000000000701",
 "is_anonymous":false,"cotironda_email_verified":true}';
do $buyer$
declare r jsonb;
begin
 r:=public.create_buyer_round_d064(
 'aaaaaaaa-0030-4030-8030-000000000701'::uuid,
 'cccccccc-0030-4030-8030-000000000701'::uuid,
 'La Plata','no_especificado',
 '[{"line_no":1,"product_code":"cemento_gris_obra",
   "source_description":"Cemento CPC Loma Negra 50 kg",
   "quantity":"20","unit":"bag"}]'::jsonb);
 if r->>'status'<>'programada' or r->>'repeated'<>'false' or
    r->>'roundId' is null
 then raise exception 'd079_buyer_round_not_created: %',r;end if;
 -- Preserve the result as a transaction-local CI-only setting. The private
 -- matcher gateway receives the round ID; it must never SELECT buyer ledger.
 perform pg_catalog.set_config('cotironda.ci_round_id',r->>'roundId',true);
end;$buyer$;
reset role;

-- Without curated mapping the matcher MUST NOT choose anyone.
set local role cotironda_match_gateway_d065;
do $before_dictionary$
declare r jsonb;v_round uuid;
begin
 v_round:=pg_catalog.current_setting('cotironda.ci_round_id')::uuid;
 r:=cotironda_private.prepare_supplier_invites_d065(v_round,'d079_ci');
 if r->>'state'<>'needs_verified_location' or r->>'invited'<>'0'
 then raise exception 'd079_routed_without_trusted_dictionary: %',r;end if;
end;$before_dictionary$;
reset role;

-- The ONLY records installed here are explicit 6 families and 1 locality.
-- Repeat for idempotency: no extra label/location or update of existing rows.
\ir ../../sql/pilot_curated_dictionary_d079.sql
\ir ../../sql/pilot_curated_dictionary_d079.sql
select ci_helpers.assert_true(
 (select count(*)=6 from cotironda_private.item_rubros_d065
  where product_code in ('cemento_gris_obra','hidrofugo','pintura_latex',
   'placa_yeso','cable_unipolar','cano_pvc'))
 and
 (select count(*)=6 from cotironda_private.item_display_d066
  where product_code in ('cemento_gris_obra','hidrofugo','pintura_latex',
   'placa_yeso','cable_unipolar','cano_pvc'))
 and
 (select count(*)=1 from cotironda_private.delivery_localities_d065
  where alias_key='la plata' and province='Buenos Aires' and city='La Plata'),
 'd079_seed_six_families_and_one_locality_idempotent');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.delivery_localities_d065
  where alias_key in ('zona inexistente','rosario','buenos aires')),
 'd079_no_implicit_delivery_localities');
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.round_invites_v1 i
  join cotironda_private.round_requests_d064 r on r.round_id=i.round_id
  where r.request_key='cccccccc-0030-4030-8030-000000000701'),
 'd079_no_suppliers_before_private_matching');

-- Only a server-owned private gateway can prepare scope; no network calls.
set local role cotironda_match_gateway_d065;
do $two_corralones$
declare r jsonb;v_round uuid;
begin
 v_round:=pg_catalog.current_setting('cotironda.ci_round_id')::uuid;
 r:=cotironda_private.prepare_supplier_invites_d065(v_round,'d079_ci');
 if r->>'state'<>'prepared' or r->>'invited'<>'2' or r->>'messagesSent'<>'0'
 then raise exception 'd079_two_corralones_failed: %',r;end if;
 r:=cotironda_private.prepare_supplier_invites_d065(v_round,'d079_ci');
 if r->>'state'<>'already_prepared' or r->>'invited'<>'2'
 then raise exception 'd079_duplicate_invites: %',r;end if;
end;$two_corralones$;
reset role;

select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.round_invites_v1 i
  join cotironda_private.round_requests_d064 r on r.round_id=i.round_id
  where r.request_key='cccccccc-0030-4030-8030-000000000701')
 and
 (select count(*)=2 from cotironda_private.round_supplier_lines_d065 l
  join cotironda_private.round_requests_d064 r on r.round_id=l.round_id
  where r.request_key='cccccccc-0030-4030-8030-000000000701'
   and l.line_no=1 and l.category_code='corralon')
 and
 not exists(select 1 from cotironda_private.round_invites_v1 i
  where i.supplier_org_id in(
  'bbbbbbbb-0030-4030-8030-000000000704'::uuid,
  'bbbbbbbb-0030-4030-8030-000000000705'::uuid)),
 'd079_exactly_two_corralones_no_rossario_and_no_baja');

set local role cotironda_match_gateway_d065;
do $packet_exact_buyer_text$
declare v_round uuid;v_packet jsonb;v_supplier uuid;
begin
 v_round:=pg_catalog.current_setting('cotironda.ci_round_id')::uuid;
 foreach v_supplier in array array[
  'bbbbbbbb-0030-4030-8030-000000000702'::uuid,
  'bbbbbbbb-0030-4030-8030-000000000703'::uuid] loop
  v_packet:=cotironda_private.preview_invitation_packet_d066(
    v_round,v_supplier,'d079_ci');
  if v_packet is null or v_packet->>'deliveryZone'<>'La Plata'
   or v_packet->>'vatRequest'<>'no_especificado'
   or pg_catalog.jsonb_array_length(v_packet->'items')<>1
   or v_packet->'items'->0->>'productCode'<>'cemento_gris_obra'
   or v_packet->'items'->0->>'label'<>'Cemento CPC Loma Negra 50 kg'
   or v_packet->'items'->0->>'quantity'<>'20.000'
   or v_packet ? 'phone' or v_packet ? 'chatKey'
  then raise exception 'd079_supplier_packet_wrong: %',v_packet;end if;
 end loop;
end;$packet_exact_buyer_text$;
reset role;

-- No encrypted recipient has been enrolled in this synthetic experiment.
-- D071 must report pending contacts and NEVER queue or send WhatsApp.
set local role cotironda_invite_gateway_d070;
do $dry_queue$
declare r jsonb;v_round uuid;
begin
 v_round:=pg_catalog.current_setting('cotironda.ci_round_id')::uuid;
 r:=cotironda_private.whapi_prepare_commercial_round_d071(v_round,'d079_ci');
 if r->>'state'<>'queued_without_sending'
  or r->>'matchedSuppliers'<>'2'
  or r->>'pendingContact'<>'2'
  or r->>'prepared'<>'0'
  or r->>'messagesSent'<>'0'
 then raise exception 'd079_no_phone_outbox_block_failed: %',r;end if;
end;$dry_queue$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_invite_jobs_d070
  where channel_id='d079_ci')
 and (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047
  where round_id=(select round_id from cotironda_private.round_requests_d064
   where request_key='cccccccc-0030-4030-8030-000000000701'))
 and (select count(*)=0 from cotironda_private.whapi_invite_reservations_d070
  where channel_id='d079_ci'),
 'd079_real_transport_off_no_jobs_no_messages');
rollback;
