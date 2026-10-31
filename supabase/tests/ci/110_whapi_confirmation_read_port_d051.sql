-- D051 real PostgreSQL17 CI, synthetic only. NEVER Supabase DEV.
begin;
do $audit$
begin
 if not exists (select 1 from pg_roles where rolname=
  'cotironda_confirmation_reader_d051' and not rolcanlogin
  and not rolinherit and not rolbypassrls)
 or (select count(*) from pg_proc where oid in (
   'cotironda_private.whapi_confirm_load_inbox_d051(text,text)'::regprocedure,
   'cotironda_private.whapi_confirm_find_ack_d051(text,text)'::regprocedure)
   and proconfig @> array['search_path=']::text[])<>2
 or has_function_privilege('anon',
    'cotironda_private.whapi_confirm_load_inbox_d051(text,text)','EXECUTE')
 or has_function_privilege('service_role',
    'cotironda_private.whapi_confirm_find_ack_d051(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
    'cotironda_private.whapi_confirm_load_inbox_d051(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_confirm_gateway',
    'cotironda_private.whapi_confirm_load_inbox_d051(text,text)','EXECUTE')
 or not has_function_privilege('cotironda_confirm_gateway',
    'cotironda_private.whapi_confirm_find_ack_d051(text,text)','EXECUTE')
 or has_table_privilege('cotironda_confirm_gateway',
    'cotironda_private.whapi_inbox_v1','SELECT')
 or has_table_privilege('cotironda_confirm_gateway',
    'cotironda_private.whapi_reply_jobs_d047','SELECT')
 then raise exception 'd051_role_or_rpc_violation';end if;
end;$audit$;
insert into public.organizations(id,display_name,organization_type)
 values('aaaaaaaa-0000-4000-8000-000000000511','D051 comprador falso','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000512','D051 proveedor falso','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values('bbbbbbbb-0000-4000-8000-000000000512','Proveedor sintético',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values('dddddddd-0000-4000-8000-000000000514',
 'aaaaaaaa-0000-4000-8000-000000000511',
 now()-interval '1 minute',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values('dddddddd-0000-4000-8000-000000000514',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
 values('dddddddd-0000-4000-8000-000000000514',
 'bbbbbbbb-0000-4000-8000-000000000512','anon_d051_demo',1);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000514';
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values('d051_ci',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000512',
 now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,
 payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,
 source_unix,crypto_key_id)
 values('d051_ci',repeat('b',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000512',
 'dddddddd-0000-4000-8000-000000000514',
 repeat('c',64),'text',decode(repeat('45',36),'hex'),
 decode(repeat('12',12),'hex'),decode(repeat('23',16),'hex'),
 1800000000,'aes_d051_ci'),
 ('d051_ci',repeat('d',64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000512',
 'dddddddd-0000-4000-8000-000000000514',
 repeat('e',64),'text',decode(repeat('46',36),'hex'),
 decode(repeat('13',12),'hex'),decode(repeat('24',16),'hex'),
 1800000000,'aes_d051_ci');
do $setup$
declare
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 job jsonb;
 lease jsonb;
begin
 perform cotironda_private.whapi_save_draft_from_inbox_d048(
 'd051_ci',repeat('b',64),'eeeeeeee-0000-4000-8000-000000000511',
 0,offer);
 job:=cotironda_private.whapi_enqueue_reply_d047('d051_ci',repeat('b',64),1);
 lease:=cotironda_private.whapi_lease_reply_d047();
 if lease->>'jobId'<>job->>'jobId'
 then raise exception 'd051_lease_wrong_job';end if;
 perform cotironda_private.whapi_finish_reply_d047(
  (lease->>'jobId')::uuid,(lease->>'leaseToken')::uuid,
   true,repeat('f',64));
end;$setup$;

-- Actually call with the restricted gateway role; no raw table reads.
set local role cotironda_confirm_gateway;
do $check$
declare
 row_json jsonb;ack jsonb;
begin
 select cotironda_private.whapi_confirm_load_inbox_d051(
  'd051_ci',repeat('d',64)) into row_json;
 if row_json->>'cryptoKeyId'<>'aes_d051_ci'
    or row_json->>'fingerprint'<>repeat('e',64)
    or row_json->>'cipherHex'<>repeat('46',36)
    or row_json->>'nonceHex'<>repeat('13',12)
    or row_json->>'tagHex'<>repeat('24',16)
    or row_json->>'supplierOrgId'<>'bbbbbbbb-0000-4000-8000-000000000512'
    or row_json->>'roundId'<>'dddddddd-0000-4000-8000-000000000514'
    or row_json ? 'phone' or row_json ? 'text'
 then raise exception 'd051_encrypted_read_bad';end if;
 if cotironda_private.whapi_confirm_load_inbox_d051(
  'd051_ci',repeat('f',64)) is not null
 then raise exception 'd051_nonexistent_inbox';end if;

 select cotironda_private.whapi_confirm_find_ack_d051(
  'd051_ci',repeat('f',64)) into ack;
 if ack->>'estado'<>'accepted_by_transport'
   or ack->>'originMessageKey'<>repeat('b',64)
   or ack->>'transportAckHmac'<>repeat('f',64)
   or ack->>'chatKey'<>repeat('a',64)
   or ack->>'revision'<>'1'
   or ack ? 'phone' or ack ? 'messageBody'
 then raise exception 'd051_ack_not_bound';end if;
 if cotironda_private.whapi_confirm_find_ack_d051(
   'd051_ci',repeat('0',64)) is not null
   or cotironda_private.whapi_confirm_find_ack_d051(
   'other_channel',repeat('f',64)) is not null
 then raise exception 'd051_ack_wrong_channel_or_hash';end if;
end;$check$;
reset role;
rollback;
