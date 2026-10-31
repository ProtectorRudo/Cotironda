-- D056 real concurrency fixture: disposable GitHub CI database only.
\set ON_ERROR_STOP on
create role cotironda_quota_d056_ci login inherit nobypassrls
 password :'d056_password';
grant cotironda_reply_sender_d054 to cotironda_quota_d056_ci
 with inherit true,set false,admin false;
grant connect on database cotironda_ci to cotironda_quota_d056_ci;
update cotironda_private.whapi_reply_jobs_d047
 set due_at=pg_catalog.clock_timestamp()+interval '1 day'
 where status='queued' and channel_id='whapi_d054_ci';
insert into public.organizations(id,display_name,organization_type) values
('aaaaaaaa-0000-4000-8000-000000000571','Buyer concurrency mock','buyer'),
('bbbbbbbb-0000-4000-8000-000000000572','Supplier concurrency mock','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0000-4000-8000-000000000572','Supplier concurrency mock',true);
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('d056_parallel',repeat('a',64),
'bbbbbbbb-0000-4000-8000-000000000572',
now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
select ('dddddddd-0000-4000-8000-00000000057'||n)::uuid,
'aaaaaaaa-0000-4000-8000-000000000571'::uuid,
now()-interval '1 minute',now()+interval '2 hours'
from (values('1'),('2')) x(n);
insert into cotironda_private.round_items_v1
(round_id,line_no,product_code,quantity,unit)
select ('dddddddd-0000-4000-8000-00000000057'||n)::uuid,
 1,'cemento_001',10,'bag' from (values('1'),('2')) x(n);
insert into cotironda_private.round_invites_v1
(round_id,supplier_org_id,anon_id,invite_position)
select ('dddddddd-0000-4000-8000-00000000057'||n)::uuid,
 'bbbbbbbb-0000-4000-8000-000000000572'::uuid,
 'anon_d056_parallel_'||n,1
 from (values('1'),('2')) x(n);
update cotironda_private.rounds_v1 set status='abierta'
where id::text like 'dddddddd-0000-4000-8000-00000000057%';
insert into cotironda_private.whapi_inbox_v1
(channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
kind,payload_ciphertext,payload_nonce,payload_tag,source_unix,crypto_key_id)
select 'd056_parallel',repeat(n,64),repeat('a',64),
 'bbbbbbbb-0000-4000-8000-000000000572'::uuid,
 ('dddddddd-0000-4000-8000-00000000057'||n)::uuid,
 repeat(n,64),'text',decode(repeat('44',32),'hex'),decode(repeat('55',12),'hex'),
 decode(repeat('66',16),'hex'),1800000000,'aes_d056_ci'
 from (values('1'),('2')) x(n);
insert into cotironda_private.whapi_buyer_send_policies_d056
 (buyer_org_id,channel_id,enabled,daily_message_limit,monthly_message_limit,
  monthly_budget_units,estimated_units_per_message)
values('aaaaaaaa-0000-4000-8000-000000000571',
 'd056_parallel',true,1,1,100,100);
do $seed$
declare
 n int;j jsonb;
 offer jsonb:='{"currency":"ARS","payment_method":"transferencia",
 "lead_days":3,"freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
begin
 for n in 1..2 loop
 perform cotironda_private.whapi_save_draft_from_inbox_d048(
  'd056_parallel',repeat(n::text,64),
  ('eeeeeeee-0000-4000-8000-00000000057'||n)::uuid,0,offer);
 j:=cotironda_private.whapi_enqueue_reply_d047(
  'd056_parallel',repeat(n::text,64),1);
 if j->>'state'<>'queued' then raise exception 'd056_concurrency_seed_failed';end if;
 end loop;
end;$seed$;
