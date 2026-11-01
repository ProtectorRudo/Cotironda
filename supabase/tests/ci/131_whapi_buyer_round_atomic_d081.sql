-- MVP-046 / D081: true PostgreSQL17 CI, all test data rolled back.
begin;
grant usage on schema ci_helpers to
 cotironda_whapi_round_gateway_d081,cotironda_buyer_zone_gateway_d077,
 cotironda_buyer_gateway_d076;
grant execute on function ci_helpers.assert_true(boolean,text) to
 cotironda_whapi_round_gateway_d081,cotironda_buyer_zone_gateway_d077,
 cotironda_buyer_gateway_d076;

create function pg_temp.d081_fail(command text,expected text) returns void
language plpgsql as $fn$
declare v_error text;v_failed boolean:=false;
begin
 begin execute command;
 exception when others then
  get stacked diagnostics v_error=message_text;
  if pg_catalog.strpos(v_error,expected)=0
  then raise exception 'd081_incorrect_error_expected_%,_actual_%',expected,v_error;end if;
  v_failed:=true;
 end;
 if not v_failed then raise exception 'd081_unexpected_success';end if;
end;$fn$;

do $priv$ begin
 if not exists(select 1 from pg_roles
   where rolname='cotironda_whapi_round_writer_d081' and not rolcanlogin
    and not rolbypassrls and not rolinherit)
 or not exists(select 1 from pg_roles
   where rolname='cotironda_whapi_round_gateway_d081' and not rolcanlogin
    and not rolbypassrls and not rolinherit)
 or has_function_privilege('anon',
  'cotironda_private.whapi_create_buyer_round_d081(text,text,text,text,uuid,text,text,jsonb,integer)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_create_buyer_round_d081(text,text,text,text,uuid,text,text,jsonb,integer)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_create_buyer_round_d081(text,text,text,text,uuid,text,text,jsonb,integer)','EXECUTE')
 or not has_function_privilege('cotironda_whapi_round_gateway_d081',
  'cotironda_private.whapi_create_buyer_round_d081(text,text,text,text,uuid,text,text,jsonb,integer)','EXECUTE')
 or has_table_privilege('cotironda_whapi_round_gateway_d081',
  'cotironda_private.rounds_v1','INSERT')
 or has_table_privilege('cotironda_whapi_round_gateway_d081',
  'cotironda_private.buyer_whapi_round_sources_d081','SELECT')
 or has_table_privilege('anon',
  'cotironda_private.buyer_whapi_round_sources_d081','SELECT')
 or has_table_privilege('service_role',
  'cotironda_private.buyer_whapi_round_sources_d081','INSERT')
 or (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc
  where oid='cotironda_private.whapi_create_buyer_round_d081(text,text,text,text,uuid,text,text,jsonb,integer)'::regprocedure)
  <>'cotironda_whapi_round_writer_d081'
 then raise exception 'd081_acl_failed';end if;
end;$priv$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0081-4081-8081-000000000811','Arquitecto D081','buyer'),
 ('aaaaaaaa-0081-4081-8081-000000000812','Otro arquitecto D081','buyer');
insert into cotironda_private.whapi_buyer_contacts_d074(
 channel_id,chat_key,buyer_org_id,verified_at,consented_at) values
 ('d081_ci',repeat('a',64),'aaaaaaaa-0081-4081-8081-000000000811',
  now()-interval '1 day',now()-interval '1 day'),
 ('d081_ci',repeat('b',64),'aaaaaaaa-0081-4081-8081-000000000812',
  now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_buyer_inbox_d074(
 channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
 crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
values
 ('d081_ci',repeat('1',64),repeat('a',64),
  'aaaaaaaa-0081-4081-8081-000000000811',repeat('7',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000000,'pendiente_interpretacion'),
 ('d081_ci',repeat('2',64),repeat('a',64),
  'aaaaaaaa-0081-4081-8081-000000000811',repeat('8',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000020,'pendiente_interpretacion'),
 ('d081_ci',repeat('3',64),repeat('a',64),
  'aaaaaaaa-0081-4081-8081-000000000811',repeat('9',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000030,'pendiente_interpretacion'),
 ('d081_ci',repeat('4',64),repeat('b',64),
  'aaaaaaaa-0081-4081-8081-000000000812',repeat('a',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000011,'pendiente_interpretacion'),
 ('d081_ci',repeat('5',64),repeat('a',64),
  'aaaaaaaa-0081-4081-8081-000000000811',repeat('b',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000041,'pendiente_interpretacion'),
 ('d081_ci',repeat('6',64),repeat('b',64),
  'aaaaaaaa-0081-4081-8081-000000000812',repeat('c',64),
  'text','aes_2026_a',decode(repeat('44',45),'hex'),
  decode(repeat('55',12),'hex'),decode(repeat('66',16),'hex'),1800000042,'pendiente_interpretacion');
create function pg_temp.items_d081() returns jsonb language sql immutable as $$
 select '[{"line_no":1,"product_code":"cemento_gris_obra","quantity":"20","unit":"bag","source_description":"Cemento CPC Loma Negra 50 kg"}]'::jsonb;
$$;
create temporary table d081_created(round_id uuid);
grant insert on pg_temp.d081_created to cotironda_whapi_round_gateway_d081;

-- A direct WhatsApp message with confirmed materials+zone creates a real round.
set local role cotironda_whapi_round_gateway_d081;
do $direct$ declare r jsonb;rr jsonb;begin
 r:=cotironda_private.whapi_create_buyer_round_d081(
 'd081_ci',repeat('a',64),repeat('1',64),repeat('1',64),
 'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
 'no_especificado',pg_temp.items_d081(),3);
 if r->>'repetida'<>'false' or r->>'roundId' is null
 then raise exception 'd081_direct_round_not_created';end if;
 insert into pg_temp.d081_created values((r->>'roundId')::uuid);
 rr:=cotironda_private.whapi_create_buyer_round_d081(
 'd081_ci',repeat('a',64),repeat('1',64),repeat('1',64),
 'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
 'no_especificado',pg_temp.items_d081(),3);
 if rr->>'repetida'<>'true' or rr->>'roundId'<>r->>'roundId'
 then raise exception 'd081_direct_replay_made_new_round';end if;
end;$direct$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.round_requests_d064 r
  join pg_temp.d081_created x on x.round_id=r.round_id
  where r.buyer_org_id='aaaaaaaa-0081-4081-8081-000000000811'
   and r.created_by is null and r.delivery_zone='La Plata'
   and r.buyer_iva_request='no_especificado')
 and (select count(*)=1 from cotironda_private.round_items_v1 i
  join pg_temp.d081_created x on x.round_id=i.round_id
  where i.product_code='cemento_gris_obra' and i.quantity=20)
 and (select count(*)=1 from cotironda_private.buyer_whapi_round_sources_d081
  where origin_message_key=repeat('1',64)),
 'd081_direct_round_uses_d064_data_without_forged_user');

-- Plazo elegido por WhatsApp queda en DB, sin confundir entrega con cierre.
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.rounds_v1 r
  join cotironda_private.buyer_whapi_round_sources_d081 s on s.round_id=r.id
  where s.channel_id='d081_ci' and s.origin_message_key=repeat('1',64)
   and r.ends_at-r.begins_at=interval '3 days'-interval '30 seconds'),
 'd081_explicit_three_days_preserved');

-- A missing zone is registered once. Reply is bound to the existing encrypted
-- original; creation consumes that pending atomically and preserves replay.
set local role cotironda_buyer_zone_gateway_d077;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_enqueue_d077('d081_ci',repeat('a',64),
  repeat('2',64),'aaaaaaaa-0081-4081-8081-000000000811')
  ->>'estado'='zona_solicitada_en_cola','d081_ask_zone_queued_not_sent');
reset role;
set local role cotironda_whapi_round_gateway_d081;
do $answer$ declare r jsonb;begin
 r:=cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('2',64),repeat('3',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'con_iva',pg_temp.items_d081());
 if r->>'repetida'<>'false' then raise exception 'd081_reply_not_saved';end if;
 insert into pg_temp.d081_created values((r->>'roundId')::uuid);
end;$answer$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.buyer_zone_pending_d077
  where channel_id='d081_ci' and origin_message_key=repeat('2',64)
   and consumed_by_message_key=repeat('3',64)
   and consumed_round_id is not null and consumed_at is not null)
 and (select count(*)=2 from cotironda_private.buyer_whapi_round_sources_d081
  where channel_id='d081_ci')
 and (select count(*)=2 from cotironda_private.round_requests_d064 r
  join pg_temp.d081_created c on c.round_id=r.round_id),
 'd081_answer_consumed_in_same_transaction');
set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d081_ci',repeat('3',64))
 ->'original'->>'messageKey'=repeat('2',64),
 'd081_same_reply_still_authenticates_original_on_retry');
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d081_ci',repeat('5',64))
 ->'original'='null'::jsonb,
 'd081_new_chat_message_not_reuse_finished_request');
reset role;
set local role cotironda_whapi_round_gateway_d081;
select ci_helpers.assert_true(
 cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('2',64),repeat('3',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'con_iva',pg_temp.items_d081())->>'repetida'='true',
 'd081_exact_reply_replay_idempotent');
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.rounds_v1 r
  join cotironda_private.buyer_whapi_round_sources_d081 s on s.round_id=r.id
  where s.channel_id='d081_ci' and s.origin_message_key=repeat('2',64)
   and r.ends_at-r.begins_at=interval '5 days'-interval '30 seconds'),
 'd081_default_five_days_with_zone_reply');
-- A changed duration in a repeated message must NEVER mutate the previous round.
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('1',64),repeat('1',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'no_especificado',pg_temp.items_d081(),7)$$,
 'd081_replayed_changed_payload');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('1',64),repeat('1',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'no_especificado',pg_temp.items_d081(),2)$$,
 'd081_invalid_request');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('1',64),repeat('1',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'no_especificado',pg_temp.items_d081(),8)$$,
 'd081_invalid_request');

-- Once first round has consumed its locality, a NEW pedido may ask a new
-- locality immediately. The previous final reply must remain replayable.
set local role cotironda_buyer_zone_gateway_d077;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_enqueue_d077('d081_ci',repeat('a',64),
  repeat('5',64),'aaaaaaaa-0081-4081-8081-000000000811')=
 '{"estado":"zona_solicitada_en_cola","repetido":false}'::jsonb,
 'd081_new_round_can_ask_zone_after_old_consumed');
reset role;
select ci_helpers.assert_true(
 (select count(*)=2 from cotironda_private.buyer_zone_question_d077
  where channel_id='d081_ci') and
 (select consumed_round_id is null from cotironda_private.buyer_zone_pending_d077
  where channel_id='d081_ci' and chat_key=repeat('a',64)),
 'd081_new_pending_reset_after_previous_consumed');
set local role cotironda_buyer_gateway_d076;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_context_d077('d081_ci',repeat('3',64))
 ->'original'->>'messageKey'=repeat('2',64),
 'd081_old_reply_replay_uses_immutable_mapping_not_new_pending');
reset role;
set local role cotironda_buyer_zone_gateway_d077;
select ci_helpers.assert_true(
 cotironda_private.whapi_zone_enqueue_d077('d081_ci',repeat('a',64),
  repeat('2',64),'aaaaaaaa-0081-4081-8081-000000000811')
 ->>'repetido'='true','d081_old_question_never_requeues');
reset role;
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('2',64),repeat('3',64),
  'aaaaaaaa-0081-4081-8081-000000000811','Rosario',
  'con_iva',pg_temp.items_d081())$$,
 'd081_replayed_changed_payload');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('2',64),repeat('5',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'con_iva',pg_temp.items_d081())$$,
 'd081_replayed_changed_payload');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('b',64),repeat('4',64),repeat('4',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'con_iva',pg_temp.items_d081())$$,
 'd081_buyer_not_authorized');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('4',64),repeat('4',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'no_especificado',pg_temp.items_d081())$$,
 'd081_messages_not_verified');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('b',64),repeat('6',64),repeat('5',64),
  'aaaaaaaa-0081-4081-8081-000000000812','La Plata',
  'no_especificado',pg_temp.items_d081())$$,
 'd081_messages_not_verified');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('5',64),repeat('5',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'no_especificado','[{"line_no":1,"product_code":"cemento_gris_obra","quantity":"20","unit":"bag","source_description":"Guantes de látex"}]'::jsonb)$$,
 'd081_invalid_material');
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('a',64),repeat('5',64),repeat('5',64),
  'aaaaaaaa-0081-4081-8081-000000000811','La Plata',
  'contradictorio',pg_temp.items_d081())$$,
 'd081_invalid_request');

-- Another verified buyer with no open zone question chooses seven days.
set local role cotironda_whapi_round_gateway_d081;
do $seven$ declare r jsonb;begin
 r:=cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('b',64),repeat('4',64),repeat('4',64),
  'aaaaaaaa-0081-4081-8081-000000000812','La Plata',
  'no_especificado',pg_temp.items_d081(),7);
 if r->>'repetida'<>'false' then raise exception 'd081_seven_days_not_created';end if;
 insert into pg_temp.d081_created values((r->>'roundId')::uuid);
end;$seven$;
reset role;
select ci_helpers.assert_true(
 (select count(*)=1 from cotironda_private.rounds_v1 r
  join cotironda_private.buyer_whapi_round_sources_d081 s on s.round_id=r.id
  where s.channel_id='d081_ci' and s.origin_message_key=repeat('4',64)
   and r.ends_at-r.begins_at=interval '7 days'-interval '30 seconds'),
 'd081_explicit_seven_days_preserved');

-- No new future writes after BAJA; previous round stays intact/auditable.
update cotironda_private.whapi_buyer_contacts_d074
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d081_ci' and chat_key=repeat('b',64);
select pg_temp.d081_fail(
 $$select cotironda_private.whapi_create_buyer_round_d081(
  'd081_ci',repeat('b',64),repeat('4',64),repeat('4',64),
  'aaaaaaaa-0081-4081-8081-000000000812','La Plata',
  'sin_iva',pg_temp.items_d081())$$,
 'd081_buyer_not_authorized');
-- Verify deferred provenance only after all D081 calls have committed their source.
set constraints cotironda_private.d081_whapi_provenance_after_insert immediate;
select ci_helpers.assert_true(
 (select count(*)=3 from cotironda_private.buyer_whapi_round_sources_d081
  where channel_id='d081_ci'),
 'd081_rejections_left_no_orphan_rounds');
rollback;
