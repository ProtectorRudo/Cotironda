-- Issue #147 / D024: ejecutar en PG17 CI después del SQL estructural.
-- Ningún usuario real, ni empresa existente. Toda fila de prueba se revierte.
begin;

create function pg_temp.must_fail(p_sql text,p_code text) returns void
language plpgsql as $fn$
declare v_err text; v_failed boolean:=false;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_err=message_text;
    if position(p_code in v_err)=0 then
      raise exception 'unexpected_error: expected %, got %',p_code,v_err;
    end if;
    v_failed:=true;
  end;
  if not v_failed then raise exception 'unexpected_success_for_%',p_code; end if;
end;
$fn$;

do $test$
begin
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='cotironda_private' and c.relname in
    ('rounds_v1','round_items_v1','round_invites_v1',
     'offer_drafts_v1','offer_events_v1','offer_versions_v1') and c.relrowsecurity)<>6
 then raise exception 'rls_missing_on_rounds_tables'; end if;
 if has_table_privilege('anon','cotironda_private.offer_versions_v1','SELECT')
    or has_table_privilege('authenticated','cotironda_private.offer_versions_v1','SELECT')
    or has_table_privilege('service_role','cotironda_private.offer_versions_v1','INSERT')
    or has_table_privilege('service_role','cotironda_private.rounds_v1','SELECT')
    or has_function_privilege('service_role',
       'cotironda_private.check_quote_lines_v1(jsonb,uuid)','EXECUTE')
 then raise exception 'private_ledger_grants_insecure'; end if;
end;$test$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-0000-0000-000000000001','Comprador ficticio A','buyer'),
 ('bbbbbbbb-0000-0000-0000-000000000002','Proveedor ficticio B','supplier'),
 ('cccccccc-0000-0000-0000-000000000003','Proveedor ficticio C','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0000-0000-0000-000000000002','Proveedor sintético B',true),
 ('cccccccc-0000-0000-0000-000000000003','Proveedor sintético C',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values ('dddddddd-0000-0000-0000-000000000004',
 'aaaaaaaa-0000-0000-0000-000000000001',now()-interval '1 hour',now()+interval '1 hour');
select pg_temp.must_fail(
 $$update cotironda_private.rounds_v1 set buyer_org_id='bbbbbbbb-0000-0000-0000-000000000002'
   where id='dddddddd-0000-0000-0000-000000000004'$$,
 'round_identity_immutable');
select pg_temp.must_fail(
 $$update cotironda_private.rounds_v1 set status='cerrada'
   where id='dddddddd-0000-0000-0000-000000000004'$$,
 'round_transition_not_allowed');


insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit) values
 ('dddddddd-0000-0000-0000-000000000004',1,'cemento_001',10,'bag'),
 ('dddddddd-0000-0000-0000-000000000004',2,'pintura_001',5,'l');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position) values
 ('dddddddd-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000002','anon_aaa',1),
 ('dddddddd-0000-0000-0000-000000000004','cccccccc-0000-0000-0000-000000000003','anon_bbb',2);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-0000-0000-000000000004';
do $test$ begin
 if (select opened_at is not null and status='abierta'
  from cotironda_private.rounds_v1 where id='dddddddd-0000-0000-0000-000000000004') is not true
 then raise exception 'opening_timestamp_missing'; end if;
end;$test$;
select pg_temp.must_fail(
 $cmd$update cotironda_private.rounds_v1 set status='programada'
   where id='dddddddd-0000-0000-0000-000000000004'$cmd$,
 'round_transition_not_allowed');
select pg_temp.must_fail(
 $cmd$update cotironda_private.rounds_v1 set status='cerrada'
   where id='dddddddd-0000-0000-0000-000000000004'$cmd$,
 'round_transition_not_allowed');

select pg_temp.must_fail(
 $cmd$insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
  values ('dddddddd-0000-0000-0000-000000000004',3,'cable_001',1,'m')$cmd$,
 'round_setup_is_frozen');
select pg_temp.must_fail(
 $cmd$delete from cotironda_private.round_invites_v1
  where round_id='dddddddd-0000-0000-0000-000000000004'
    and anon_id='anon_bbb'$cmd$,
 'round_setup_is_frozen');

select pg_temp.must_fail(
 $$insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
   values ('dddddddd-0000-0000-0000-000000000004',
    'bbbbbbbb-0000-0000-0000-000000000002','anon_other',3)$$,
 'duplicate key');

-- Formato cerrado de snapshot, sin campos de texto arbitrarios ni teléfonos.
do $test$ begin
 if not cotironda_private.check_quote_lines_v1(
   '[{"line_no":1,"unit":"bag","available_qty":"10",
       "net_unit_price":"2500.00","vat_rate":"21"}]'::jsonb,
   'dddddddd-0000-0000-0000-000000000004') then
   raise exception 'valid_quote_rejected'; end if;
 if cotironda_private.check_quote_lines_v1(
   '[{"line_no":1,"unit":"bag","available_qty":"10",
       "net_unit_price":"2500.00","vat_rate":"21",
       "whatsapp":"+5492211234567"}]'::jsonb,
   'dddddddd-0000-0000-0000-000000000004') then
   raise exception 'pii_field_accepted'; end if;
 if cotironda_private.check_quote_lines_v1(
   '[{"line_no":7,"unit":"bag","available_qty":"10",
       "net_unit_price":"2500.00","vat_rate":"21"}]'::jsonb,
   'dddddddd-0000-0000-0000-000000000004') then
   raise exception 'foreign_line_accepted'; end if;
 if cotironda_private.check_quote_lines_v1(
   '[{"line_no":1,"unit":"bag","available_qty":"10",
       "net_unit_price":"2500.00","vat_rate":"21"},
     {"line_no":1,"unit":"bag","available_qty":"10",
       "net_unit_price":"2500.00","vat_rate":"21"}]'::jsonb,
   'dddddddd-0000-0000-0000-000000000004') then
   raise exception 'duplicate_line_accepted'; end if;
end;$test$;

insert into cotironda_private.offer_drafts_v1
(round_id,supplier_org_id,revision,currency,payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot)
values
('dddddddd-0000-0000-0000-000000000004','bbbbbbbb-0000-0000-0000-000000000002',
 1,'ARS','contado',3,1000,0,
 '[{"line_no":1,"unit":"bag","available_qty":"10",
   "net_unit_price":"2500.00","vat_rate":"21"}]'::jsonb);
select pg_temp.must_fail(
 $$update cotironda_private.offer_drafts_v1 set revision=3
   where round_id='dddddddd-0000-0000-0000-000000000004'$$,
 'quote_draft_revision_invalid');
select pg_temp.must_fail(
 $$insert into cotironda_private.offer_drafts_v1
   (round_id,supplier_org_id,revision,currency,lines_snapshot)
   values ('dddddddd-0000-0000-0000-000000000004',
   'cccccccc-0000-0000-0000-000000000003',2,'ARS',
   '[{"line_no":1,"unit":"bag","available_qty":"10",
     "net_unit_price":"2500.00","vat_rate":"21"}]'::jsonb)$$,
 'quote_draft_initial_revision_invalid');

insert into cotironda_private.offer_events_v1
(round_id,event_id,supplier_org_id,event_kind,revision,payload_sha256)
values ('dddddddd-0000-0000-0000-000000000004',
  'eeeeeeee-0000-0000-0000-000000000005',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'offer_confirmed',1,repeat('a',64));
select pg_temp.must_fail(
 $$insert into cotironda_private.offer_events_v1
    (round_id,event_id,supplier_org_id,event_kind,revision,payload_sha256)
   values ('dddddddd-0000-0000-0000-000000000004',
    'eeeeeeee-0000-0000-0000-000000000005',
    'cccccccc-0000-0000-0000-000000000003',
    'offer_confirmed',1,repeat('b',64))$$,
 'duplicate key');
select pg_temp.must_fail(
 $$insert into cotironda_private.offer_versions_v1
   (round_id,supplier_org_id,version,draft_revision,confirmation_event_id,
    currency,payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot)
   select round_id,supplier_org_id,2,1,
    'eeeeeeee-0000-0000-0000-000000000005',currency,
    payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot
   from cotironda_private.offer_drafts_v1$$,
 'quote_version_out_of_sequence');

insert into cotironda_private.offer_versions_v1
(round_id,supplier_org_id,version,draft_revision,confirmation_event_id,
 currency,payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot)
select round_id,supplier_org_id,1,revision,
 'eeeeeeee-0000-0000-0000-000000000005',currency,
 payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot
from cotironda_private.offer_drafts_v1;

select pg_temp.must_fail(
 $$update cotironda_private.offer_versions_v1 set freight_gross=0
   where round_id='dddddddd-0000-0000-0000-000000000004'$$,
 'confirmed_offer_and_event_are_immutable');
select pg_temp.must_fail(
 $$delete from cotironda_private.offer_versions_v1
   where round_id='dddddddd-0000-0000-0000-000000000004'$$,
 'confirmed_offer_and_event_are_immutable');
select pg_temp.must_fail(
 $$update cotironda_private.offer_events_v1 set payload_sha256=repeat('c',64)
   where round_id='dddddddd-0000-0000-0000-000000000004'$$,
 'confirmed_offer_and_event_are_immutable');

update cotironda_private.offer_drafts_v1
 set revision=2,freight_gross=1500
 where round_id='dddddddd-0000-0000-0000-000000000004';
insert into cotironda_private.offer_events_v1
(round_id,event_id,supplier_org_id,event_kind,revision,payload_sha256)
values ('dddddddd-0000-0000-0000-000000000004',
  'ffffffff-0000-0000-0000-000000000006',
  'bbbbbbbb-0000-0000-0000-000000000002',
  'offer_confirmed',2,repeat('b',64));
insert into cotironda_private.offer_versions_v1
(round_id,supplier_org_id,version,draft_revision,confirmation_event_id,
 currency,payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot)
select round_id,supplier_org_id,2,revision,
 'ffffffff-0000-0000-0000-000000000006',currency,
 payment_method,lead_days,freight_gross,min_goods_gross,lines_snapshot
from cotironda_private.offer_drafts_v1;
do $test$ begin
 if (select count(*) from cotironda_private.offer_versions_v1
   where round_id='dddddddd-0000-0000-0000-000000000004')<>2
 or (select freight_gross from cotironda_private.offer_versions_v1
   where round_id='dddddddd-0000-0000-0000-000000000004' and version=1)<>1000
 or (select freight_gross from cotironda_private.offer_versions_v1
   where round_id='dddddddd-0000-0000-0000-000000000004' and version=2)<>1500
 then raise exception 'confirmed_quote_history_mutated'; end if;
end;$test$;

-- Cancelación y reapertura inválida en ronda independiente.
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values ('dddddddd-0000-0000-0000-000000000007',
 'aaaaaaaa-0000-0000-0000-000000000001',now()-interval '1 hour',now()+interval '1 hour');
update cotironda_private.rounds_v1 set status='cancelada'
 where id='dddddddd-0000-0000-0000-000000000007';
select pg_temp.must_fail(
 $$update cotironda_private.rounds_v1 set status='abierta'
   where id='dddddddd-0000-0000-0000-000000000007'$$,
 'round_transition_not_allowed');

rollback;

do $test$ begin
 if (select count(*) from cotironda_private.rounds_v1)>0
 or (select count(*) from cotironda_private.offer_versions_v1)>0
 or exists(select 1 from public.organizations
  where id='aaaaaaaa-0000-0000-0000-000000000001')
 then raise exception 'transaction_rollback_did_not_clean'; end if;
end;$test$;
