-- MVP-019 D068: real PostgreSQL17 ephemeral CI against D065 synthetic
-- corralon + paintshop fixture. Nothing persisted; no phone/plaintext anywhere.
-- This SQL executes INSIDE D065's single transaction before D066 fixture.
savepoint d068_recipient_fixture;
do $acl$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_recipient_owner_d068'
    and not rolcanlogin and not rolinherit and not rolbypassrls)
 or has_function_privilege('anon',
  'cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.whapi_store_recipient_d068(text,text,uuid,text,bytea,bytea,bytea)','EXECUTE')
 or has_table_privilege('cotironda_recipient_gateway_d068',
  'cotironda_private.whapi_recipient_vault_d068','SELECT')
 or has_table_privilege('authenticated',
  'cotironda_private.whapi_recipient_vault_d068','SELECT')
 or not has_function_privilege('cotironda_recipient_gateway_d068',
  'cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)','EXECUTE')
 or not (select relrowsecurity from pg_class
  where oid='cotironda_private.whapi_recipient_vault_d068'::regclass)
 then raise exception 'd068_vault_acl_invalid';end if;
end;$acl$;
-- Only made-up encrypted bytes are used: no real phone or secret.
insert into cotironda_private.item_display_d066(product_code,display_label)
 values('cemento_001','Cemento CPC 50 kg'),('pintura_002','Pintura latex blanca');
set local role cotironda_recipient_gateway_d068;
do $recipient$
declare
 r jsonb; p jsonb;
 v_round uuid:='dddddddd-0016-4016-8016-000000000661';
 v_cement uuid:='bbbbbbbb-0016-4016-8016-000000000662';
 v_paint uuid:='bbbbbbbb-0016-4016-8016-000000000663';
begin
 if cotironda_private.whapi_read_recipient_packet_d068(
    v_round,v_cement,'d065_ci',repeat('a',64)) is not null
 then raise exception 'd068_should_not_read_missing_vault';end if;
 r:=cotironda_private.whapi_store_recipient_d068(
  'd065_ci',repeat('a',64),v_cement,'recipient_ci',
  decode(repeat('ab',12),'hex'),decode(repeat('cd',32),'hex'),
  decode(repeat('ef',16),'hex'));
 if r->>'state'<>'saved' then raise exception 'd068_first_store_failed';end if;
 r:=cotironda_private.whapi_store_recipient_d068(
  'd065_ci',repeat('a',64),v_cement,'recipient_ci',
  decode(repeat('ac',12),'hex'),decode(repeat('ce',32),'hex'),
  decode(repeat('ee',16),'hex'));
 if r->>'state'<>'already_saved' then
  raise exception 'd068_replay_did_not_reuse_identity';end if;
 p:=cotironda_private.whapi_read_recipient_packet_d068(
  v_round,v_cement,'d065_ci',repeat('a',64));
 if p is null or p->>'chatKey'<>repeat('a',64)
  or p->>'cryptoKeyId'<>'recipient_ci'
  or p->>'nonceHex'<>repeat('ab',12)
  or p->>'cipherHex'<>repeat('cd',32)
  or p->>'tagHex'<>repeat('ef',16)
  or pg_catalog.jsonb_array_length(p->'packet'->'items')<>1
  or p->'packet'->'items'->0->>'productCode'<>'cemento_001'
  or p ? 'phone' or p ? 'to' or p ? 'chat_id'
 then raise exception 'd068_leak_or_scope_error';end if;
 if cotironda_private.whapi_read_recipient_packet_d068(
    v_round,v_paint,'d065_ci',repeat('a',64)) is not null
 then raise exception 'd068_cross_supplier_identity_leaked';end if;
 if cotironda_private.whapi_read_recipient_packet_d068(
    v_round,v_cement,'other_channel',repeat('a',64)) is not null
 then raise exception 'd068_cross_channel_identity_leaked';end if;
 -- Never allow a new supplier to claim an existing HMAC.
 begin
  perform cotironda_private.whapi_store_recipient_d068(
   'd065_ci',repeat('a',64),v_paint,'recipient_ci',
   decode(repeat('ab',12),'hex'),decode(repeat('cd',32),'hex'),
   decode(repeat('ef',16),'hex'));
  raise exception 'd068_foreign_supplier_was_accepted';
 exception when insufficient_privilege then null;end;
end;$recipient$;
reset role;
-- Opt-out happens AFTER the contact was registered: no packet.
update cotironda_private.whapi_contacts_v1
 set opted_out_at=pg_catalog.clock_timestamp()
 where channel_id='d065_ci' and chat_key=repeat('a',64);
set local role cotironda_recipient_gateway_d068;
do $revoked$
declare v_round uuid:='dddddddd-0016-4016-8016-000000000661';
 v_cement uuid:='bbbbbbbb-0016-4016-8016-000000000662';
begin
 if cotironda_private.whapi_read_recipient_packet_d068(
   v_round,v_cement,'d065_ci',repeat('a',64)) is not null
 then raise exception 'd068_optout_not_enforced';end if;
 -- Enrolment after BAJA must be rejected even as a historical replay.
 begin
  perform cotironda_private.whapi_store_recipient_d068(
    'd065_ci',repeat('a',64),v_cement,'recipient_ci',
    decode(repeat('ab',12),'hex'),decode(repeat('cd',32),'hex'),
    decode(repeat('ef',16),'hex'));
  raise exception 'd069_optout_replay_stored';
 exception when insufficient_privilege then null;end;
 -- Neither a foreign contact nor a made-up HMAC may be provisioned.
 begin
  perform cotironda_private.whapi_store_recipient_d068(
    'd065_ci',repeat('f',64),v_cement,'recipient_ci',
    decode(repeat('ab',12),'hex'),decode(repeat('cd',32),'hex'),
    decode(repeat('ef',16),'hex'));
  raise exception 'd069_unknown_contact_enrolled';
 exception when insufficient_privilege then null;end;
end;$revoked$;
reset role;
rollback to savepoint d068_recipient_fixture;
release savepoint d068_recipient_fixture;
-- The following D066 suite starts with NO labels and contacts still active.
