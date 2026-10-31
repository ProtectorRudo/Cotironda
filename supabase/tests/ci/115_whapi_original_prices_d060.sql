-- D060 PG17 isolated CI: price as quoted + tenant-safe buyer read, ROLLBACK.
begin;
create function pg_temp.must_fail_d060(q text, needle text)
returns void language plpgsql as $fn$
declare msg text; failed bool:=false;
begin
 begin execute q;
 exception when others then
   get stacked diagnostics msg=message_text;
   if position(needle in msg)=0
   then raise exception 'd060_wrong_error expected=% got=%',needle,msg;end if;
   failed:=true;
 end;
 if not failed then raise exception 'd060_expected_failure_%',needle;end if;
end;$fn$;
do $acl$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_price_writer_d060'
    and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not exists(select 1 from pg_roles where rolname='cotironda_price_gateway_d060'
    and not rolcanlogin and not rolinherit and not rolbypassrls)
 or not (select relrowsecurity from pg_class
  where oid='cotironda_private.whapi_price_sources_d060'::regclass)
 or not (select relrowsecurity from pg_class
  where oid='cotironda_private.whapi_price_lines_d060'::regclass)
 or has_table_privilege('anon','cotironda_private.whapi_price_lines_d060','SELECT')
 or has_table_privilege('authenticated','cotironda_private.whapi_price_lines_d060','SELECT')
 or has_table_privilege('service_role','cotironda_private.whapi_price_sources_d060','SELECT')
 or has_table_privilege('cotironda_price_gateway_d060','cotironda_private.whapi_price_lines_d060','INSERT')
 or has_function_privilege('anon','cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)','EXECUTE')
 or has_function_privilege('service_role','cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)','EXECUTE')
 or not has_function_privilege('cotironda_price_gateway_d060','cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','public.buyer_quoted_prices_d060(uuid)','EXECUTE')
 or has_function_privilege('anon','public.buyer_quoted_prices_d060(uuid)','EXECUTE')
 or has_function_privilege('service_role','public.buyer_quoted_prices_d060(uuid)','EXECUTE')
 or (select prosecdef from pg_proc where oid=
  'public.buyer_quoted_prices_d060(uuid)'::regprocedure)<>false
 or (select pg_get_userbyid(proowner) from pg_proc where oid=
  'cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)'::regprocedure)<>'cotironda_price_writer_d060'
 or (select pg_get_userbyid(proowner) from pg_proc where oid=
  'cotironda_private.buyer_quoted_prices_d060(uuid)'::regprocedure)<>'cotironda_rounds_reader'
 then raise exception 'd060_permissions_insecure'; end if;
end;$acl$;

insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('11111111-0010-4010-8010-000000000601',now(),false),
 ('22222222-0010-4010-8010-000000000602',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('33333333-0010-4010-8010-000000000603',
  '11111111-0010-4010-8010-000000000601',now()+interval '1 day'),
 ('33333333-0010-4010-8010-000000000604',
  '22222222-0010-4010-8010-000000000602',now()+interval '1 day');
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0010-4010-8010-000000000605','comprador d060','buyer'),
 ('aaaaaaaa-0010-4010-8010-000000000606','otro comprador d060','buyer'),
 ('bbbbbbbb-0010-4010-8010-000000000607','corralon d060','supplier');
insert into public.organization_members(organization_id,user_id,membership_role,status) values
 ('aaaaaaaa-0010-4010-8010-000000000605',
  '11111111-0010-4010-8010-000000000601','owner','active'),
 ('aaaaaaaa-0010-4010-8010-000000000606',
  '22222222-0010-4010-8010-000000000602','owner','active');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
values('bbbbbbbb-0010-4010-8010-000000000607','Nombre privado',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at) values
 ('dddddddd-0010-4010-8010-000000000608',
  'aaaaaaaa-0010-4010-8010-000000000605',
  now()-interval '2 minutes',now()+interval '1 hour'),
 ('dddddddd-0010-4010-8010-000000000609',
  'aaaaaaaa-0010-4010-8010-000000000606',
  now()-interval '2 minutes',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit) values
 ('dddddddd-0010-4010-8010-000000000608',1,'cemento_001',10,'bag'),
 ('dddddddd-0010-4010-8010-000000000609',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
values('dddddddd-0010-4010-8010-000000000608',
 'bbbbbbbb-0010-4010-8010-000000000607','anon_corralon_01',1),
 ('dddddddd-0010-4010-8010-000000000609',
 'bbbbbbbb-0010-4010-8010-000000000607','anon_corralon_02',1);
update cotironda_private.rounds_v1 set status='abierta'
where id in ('dddddddd-0010-4010-8010-000000000608',
 'dddddddd-0010-4010-8010-000000000609');
insert into cotironda_private.whapi_contacts_v1
(channel_id,chat_key,supplier_org_id,verified_at,consented_at)
values('d060_ci',repeat('a',64),'bbbbbbbb-0010-4010-8010-000000000607',
 now()-interval '1 day',now()-interval '1 day');
insert into cotironda_private.whapi_inbox_v1
 (channel_id,message_key,chat_key,supplier_org_id,round_id,payload_fingerprint,
  kind,payload_ciphertext,payload_nonce,payload_tag,source_unix)
select 'd060_ci',repeat(m.k,64),repeat('a',64),
 'bbbbbbbb-0010-4010-8010-000000000607'::uuid,
 'dddddddd-0010-4010-8010-000000000608'::uuid,
 repeat(m.k,64),'text',decode(repeat('66',32),'hex'),
 decode(repeat('11',12),'hex'),decode(repeat('22',16),'hex'),1800000000
from (values('1'),('2'),('3'),('4'),('5')) m(k);

do $cases$
declare
 v_quote jsonb:='{"currency":"ARS","payment_method":null,"lead_days":null,
   "freight_gross":null,"min_goods_gross":null,
   "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
   "net_unit_price":null,"vat_rate":null}]}'::jsonb;
 v_evidence jsonb:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
  'line_no',1,'quoted_unit_price','121.00','vat_basis','no_informado',
  'source_line_no',1,'source_sha256',repeat('d',64)));
 v_revised jsonb;
 v_quote_revised jsonb;
 v_result jsonb;
 r uuid:='dddddddd-0010-4010-8010-000000000608';
begin
 -- IVA unknown: price 121 remains VISIBLE as supplier said it, without a net.
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
  'd060_ci',repeat('1',64),0,v_quote,v_evidence);
 if v_result<>'{"state":"offer_received","revision":1,"version":1,"repeated":false,"prices_preserved":true}'::jsonb
 then raise exception 'd060_first_version_mismatch_%',v_result;end if;
 if (select count(*) from cotironda_private.whapi_price_lines_d060
     where channel_id='d060_ci' and message_key=repeat('1',64)
      and quoted_unit_price=121 and vat_basis='no_informado')<>1
   or (select count(*) from cotironda_private.offer_versions_v1
      where round_id=r and lines_snapshot->0->>'net_unit_price' is null)<>1
 then raise exception 'd060_original_price_lost_or_net_invented';end if;
 if (select count(*) from cotironda_private.whapi_reply_jobs_d047 where round_id=r)<>0
 then raise exception 'd060_confirmo_generated';end if;
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
  'd060_ci',repeat('1',64),0,v_quote,v_evidence);
 if v_result->>'repeated'<>'true' then raise exception 'd060_duplicate_created';end if;
 perform pg_temp.must_fail_d060(format(
 'select cotironda_private.whapi_receive_with_prices_d060(%L,%L,0,%L::jsonb,%L::jsonb)',
 'd060_ci',repeat('1',64),v_quote::text,
 pg_catalog.jsonb_set(v_evidence,'{0,quoted_unit_price}','"122.00"')::text),
 'd060_evidence_replay_conflict');
 -- Unknown tax MUST NOT be silently net-priced.
 perform pg_temp.must_fail_d060(format(
 'select cotironda_private.whapi_receive_with_prices_d060(%L,%L,1,%L::jsonb,%L::jsonb)',
 'd060_ci',repeat('2',64),
 pg_catalog.jsonb_set(v_quote,'{lines_snapshot,0,net_unit_price}','"121.00"')::text,
 v_evidence::text),'d060_tax_assumed');
 -- IVA included, 21% explicitly, net 100+21=original 121.
 v_quote_revised:=pg_catalog.jsonb_set(v_quote,'{lines_snapshot,0,net_unit_price}','"100.00"');
 v_quote_revised:=pg_catalog.jsonb_set(v_quote_revised,'{lines_snapshot,0,vat_rate}','"21"');
 v_revised:=pg_catalog.jsonb_set(v_evidence,'{0,vat_basis}','"incluido"');
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
   'd060_ci',repeat('2',64),1,v_quote_revised,v_revised);
 if v_result->>'version'<>'2' then raise exception 'd060_correction_not_versioned';end if;
 if (select count(*) from cotironda_private.whapi_price_lines_d060
    where channel_id='d060_ci' and line_no=1)<>2
 then raise exception 'd060_price_history_missing';end if;
 perform pg_temp.must_fail_d060(format(
 'select cotironda_private.whapi_receive_with_prices_d060(%L,%L,2,%L::jsonb,%L::jsonb)',
 'd060_ci',repeat('3',64),
 pg_catalog.jsonb_set(v_quote_revised,'{lines_snapshot,0,net_unit_price}','"101.00"')::text,
 v_revised::text),'d060_double_tax_or_rounding');
 -- no incluido: original = net amount, missing VAT rate still permitted.
 v_revised:=pg_catalog.jsonb_set(v_revised,'{0,vat_basis}','"no_incluido"');
 v_quote_revised:=pg_catalog.jsonb_set(v_quote_revised,
   '{lines_snapshot,0,net_unit_price}','"121.00"');
 v_quote_revised:=pg_catalog.jsonb_set(v_quote_revised,
   '{lines_snapshot,0,vat_rate}','null'::jsonb);
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
   'd060_ci',repeat('3',64),2,v_quote_revised,v_revised);
 if v_result->>'version'<>'3' then raise exception 'd060_net_price_not_saved';end if;
 perform pg_temp.must_fail_d060(format(
 'update cotironda_private.whapi_price_lines_d060 set quoted_unit_price=1 where channel_id=%L',
 'd060_ci'),'confirmed_offer_and_event_are_immutable');
 perform pg_temp.must_fail_d060(format(
 'select cotironda_private.whapi_receive_with_prices_d060(%L,%L,3,%L::jsonb,%L::jsonb)',
 'd060_ci',repeat('4',64),v_quote::text,
 pg_catalog.jsonb_set(v_evidence,'{0,source_sha256}','null'::jsonb)::text),
 'd060_missing_evidence');
end;$cases$;

-- Read buyer sees only most recent version, alias, original and IVA condition.
set local role authenticated;
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-0010-4010-8010-000000000601",
 "session_id":"33333333-0010-4010-8010-000000000603",
 "is_anonymous":false,"cotironda_email_verified":true}';
select ci_helpers.assert_true(
 (select count(*)=1 from public.buyer_quoted_prices_d060(
  'dddddddd-0010-4010-8010-000000000608')),
 'd060_buyer_latest_only');
select ci_helpers.assert_true(
 (select supplier_alias='anon_corralon_01'
     and quoted_unit_price='121.00' and vat_basis='no_incluido'
     and offer_version=3 from public.buyer_quoted_prices_d060(
  'dddddddd-0010-4010-8010-000000000608')),
 'd060_buyer_quote_display');
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_quoted_prices_d060(
  'dddddddd-0010-4010-8010-000000000609')),
 'd060_cross_tenant_no_prices');
reset role;

-- Repeated buyer access cannot bypass membership or session revocation.
update public.organization_members set status='suspended'
 where organization_id='aaaaaaaa-0010-4010-8010-000000000605';
set local role authenticated;
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_quoted_prices_d060(
  'dddddddd-0010-4010-8010-000000000608')),
 'd060_suspended_member_no_prices');
reset role;
update public.organization_members set status='active'
 where organization_id='aaaaaaaa-0010-4010-8010-000000000605';
delete from auth.sessions where id='33333333-0010-4010-8010-000000000603';
set local role authenticated;
do $invalid$
declare denied boolean:=false;
begin
 begin
  perform * from public.buyer_quoted_prices_d060(
   'dddddddd-0010-4010-8010-000000000608');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'd060_revoked_session_exposed_prices';end if;
end;$invalid$;
reset role;
rollback;
