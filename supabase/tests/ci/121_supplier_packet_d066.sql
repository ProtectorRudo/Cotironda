-- D066 tested inside the ephemeral D065 fixture transaction.
-- No real chat ID, phone, outbound messages, or Supabase DEV mutations.
do $guard$
begin
 if has_function_privilege('anon',
 'cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)','EXECUTE')
 or has_function_privilege('authenticated',
 'cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)','EXECUTE')
 or has_function_privilege('service_role',
 'cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)','EXECUTE')
 or not has_function_privilege('cotironda_match_gateway_d065',
 'cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)','EXECUTE')
 or has_table_privilege('cotironda_match_gateway_d065',
  'cotironda_private.item_display_d066','SELECT')
 or not (select relrowsecurity from pg_class
  where oid='cotironda_private.item_display_d066'::regclass)
 then raise exception 'd066_acl_insecure';end if;
end;$guard$;

set local role cotironda_match_gateway_d065;
select ci_helpers.assert_true(
 cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000662','d065_ci') is null,
 'd066_no_label_no_packet');
reset role;
insert into cotironda_private.item_display_d066(product_code,display_label)
 values('cemento_001','Cemento CPC 50 kg'),
       ('pintura_002','Pintura latex blanca');
set local role cotironda_match_gateway_d065;
do $packet$
declare a jsonb;b jsonb;
begin
 a:=cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000662','d065_ci');
 b:=cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000663','d065_ci');
 if a is null or b is null then raise exception 'd066_missing_packet';end if;
 if jsonb_array_length(a->'items')<>1 or
   a->'items'->0->>'productCode'<>'cemento_001' or
   a->'items'->0->>'label'<>'Cemento CPC 50 kg' or
   jsonb_array_length(b->'items')<>1 or
   b->'items'->0->>'productCode'<>'pintura_002' or
   a->>'deliveryZone'<>'La Plata' or
   a->>'vatRequest'<>'no_especificado' or
   a ? 'chatKey' or a ? 'phone' or a ? 'company_name' or
   b ? 'chatKey' or b ? 'phone'
 then raise exception 'd066_scope_or_pii_leak';end if;
 if a<>cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000662','d065_ci')
 then raise exception 'd066_replay_changed_packet';end if;
 if cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000664','d065_ci') is not null
 then raise exception 'd066_opted_out_supplier_visible';end if;
 if cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000662','other_channel') is not null
 then raise exception 'd066_other_channel_visible';end if;
 if cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000662',
 'bbbbbbbb-0016-4016-8016-000000000662','d065_ci') is not null
 then raise exception 'd066_unprepared_round_visible';end if;
end;$packet$;
reset role;
-- Revoking consent AFTER preparation MUST disable the packet.
update cotironda_private.whapi_contacts_v1
 set opted_out_at=now()
 where supplier_org_id='bbbbbbbb-0016-4016-8016-000000000663'
 and channel_id='d065_ci';
set local role cotironda_match_gateway_d065;
select ci_helpers.assert_true(
 cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000663','d065_ci') is null,
 'd066_baja_after_preparation_blocks_packet');
reset role;
update public.supplier_delivery_areas set is_enabled=false
 where organization_id='bbbbbbbb-0016-4016-8016-000000000662';
set local role cotironda_match_gateway_d065;
select ci_helpers.assert_true(
 cotironda_private.preview_invitation_packet_d066(
 'dddddddd-0016-4016-8016-000000000661',
 'bbbbbbbb-0016-4016-8016-000000000662','d065_ci') is null,
 'd066_revoked_delivery_area_blocks_packet');
reset role;
select ci_helpers.assert_true(
 (select count(*)=0 from cotironda_private.whapi_reply_jobs_d047
  where round_id='dddddddd-0016-4016-8016-000000000661'),
 'd066_zero_outbound_messages');
