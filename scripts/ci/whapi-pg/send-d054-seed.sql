-- D054 ephemeral PostgreSQL17 CI seed, dummy organizations and ciphertext.
-- Inputs: -v d054_password=<masked>, no passwords persisted to git.
\set ON_ERROR_STOP on
create role cotironda_send_d054_ci login inherit nobypassrls
 password :'d054_password';
grant cotironda_reply_gateway to cotironda_send_d054_ci
 with inherit true,set false,admin false;
grant connect on database cotironda_ci to cotironda_send_d054_ci;
do $audit$
begin
 if not has_function_privilege('cotironda_send_d054_ci',
  'cotironda_private.whapi_begin_send_d053(uuid,uuid)','EXECUTE')
 or not has_function_privilege('cotironda_send_d054_ci',
  'cotironda_private.whapi_record_send_outcome_d053(uuid,uuid,text,text)','EXECUTE')
 or has_function_privilege('cotironda_send_d054_ci',
  'cotironda_private.whapi_save_draft_from_inbox_d048(text,text,uuid,integer,jsonb)','EXECUTE')
 or has_table_privilege('cotironda_send_d054_ci',
  'cotironda_private.whapi_reply_jobs_d047','SELECT')
 or exists(select 1 from pg_roles where rolname='cotironda_send_d054_ci'
   and (rolsuper or rolbypassrls or rolcreatedb or rolcreaterole))
 then raise exception 'd054_worker_least_privilege_fail';end if;
end;$audit$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000541','D054 comprador sintético','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000542','D054 proveedor sintético','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0000-4000-8000-000000000542','Corralón simulado',true);
insert into cotironda_private.whapi_contacts_v1(
 channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('whapi_d054_ci',repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000542',now()-interval '1 day',
 now()-interval '1 day');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
select ('dddddddd-0000-4000-8000-00000000054'||n)::uuid,
 'aaaaaaaa-0000-4000-8000-000000000541'::uuid,
 now()-interval '2 minutes',now()+interval '3 hours'
 from (values('1'),('2'),('3')) as t(n);
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
select ('dddddddd-0000-4000-8000-00000000054'||n)::uuid,1,'cemento_001',10,'bag'
 from (values('1'),('2'),('3')) as t(n);
insert into cotironda_private.round_invites_v1(
 round_id,supplier_org_id,anon_id,invite_position)
select ('dddddddd-0000-4000-8000-00000000054'||n)::uuid,
 'bbbbbbbb-0000-4000-8000-000000000542'::uuid,
 'anon_d054_'||n,1
 from (values('1'),('2'),('3')) as t(n);
update cotironda_private.rounds_v1 set status='abierta'
 where id::text like 'dddddddd-0000-4000-8000-00000000054%';
insert into cotironda_private.whapi_inbox_v1(
 channel_id,message_key,chat_key,supplier_org_id,round_id,
 payload_fingerprint,kind,payload_ciphertext,payload_nonce,payload_tag,
 source_unix,crypto_key_id)
select 'whapi_d054_ci',repeat(n,64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000542'::uuid,
 ('dddddddd-0000-4000-8000-00000000054'||n)::uuid,
 repeat(n,64),'text',
 decode(repeat('44',32),'hex'),decode(repeat('55',12),'hex'),
 decode(repeat('66',16),'hex'),1800000000,'aes_d054_ci'
 from (values('1'),('2'),('3')) as t(n);
do $make$
declare
 n integer;v jsonb;
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":2,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2200.00","vat_rate":"21"}]}'::jsonb;
begin
 for n in 1..3 loop
  v:=cotironda_private.whapi_save_draft_from_inbox_d048(
   'whapi_d054_ci',repeat(n::text,64),
   ('eeeeeeee-0000-4000-8000-00000000054'||n)::uuid,0,offer);
  if v->>'state'<>'linked' then raise exception 'd054_fixture_draft_failed';end if;
  v:=cotironda_private.whapi_enqueue_reply_d047(
    'whapi_d054_ci',repeat(n::text,64),1);
  if v->>'state'<>'queued' then raise exception 'd054_fixture_outbox_failed';end if;
 end loop;
end;$make$;
