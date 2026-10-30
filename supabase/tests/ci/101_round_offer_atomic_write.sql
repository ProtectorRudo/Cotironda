-- D026 / Issue #153: PostgreSQL CI aislado, toda la información sintética.
begin;
create function pg_temp.must_fail(p_sql text,p_fragment text) returns void
language plpgsql as $fn$
declare v_msg text; v_failed bool:=false;
begin
 begin execute p_sql;
 exception when others then
  get stacked diagnostics v_msg=message_text;
  if position(p_fragment in v_msg)=0 then
   raise exception 'wrong_exception expected=% got=%',p_fragment,v_msg;
  end if;
  v_failed:=true;
 end;
 if not v_failed then raise exception 'unexpected_success_%',p_fragment; end if;
end;
$fn$;

do $t$
begin
 if not exists (select 1 from pg_roles
  where rolname='cotironda_rounds_writer' and not rolcanlogin and not rolbypassrls and not rolinherit)
 then raise exception 'writer_role_not_isolated'; end if;
 if has_function_privilege('anon',
  'cotironda_private.save_offer_draft_atomic_v1(uuid,uuid,uuid,integer,jsonb)','EXECUTE')
 or has_function_privilege('authenticated',
  'cotironda_private.save_offer_draft_atomic_v1(uuid,uuid,uuid,integer,jsonb)','EXECUTE')
 or has_function_privilege('service_role',
  'cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer)','EXECUTE')
 or has_function_privilege('cotironda_app',
  'cotironda_private.confirm_offer_atomic_v1(uuid,uuid,uuid,integer)','EXECUTE')
 or has_table_privilege('authenticated',
  'cotironda_private.offer_versions_v1','SELECT')
 or has_table_privilege('service_role',
  'cotironda_private.offer_drafts_v1','INSERT')
 or (select pg_get_userbyid(proowner) from pg_proc
    where oid='cotironda_private.save_offer_draft_atomic_v1(uuid,uuid,uuid,integer,jsonb)'::regprocedure)
    <>'cotironda_rounds_writer'
 then raise exception 'D026_write_permissions_insecure';end if;
end;$t$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000201','Comprador TEST','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000202','Corralón TEST','supplier'),
 ('cccccccc-0000-4000-8000-000000000203','Pinturería TEST','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('bbbbbbbb-0000-4000-8000-000000000202','Comercio ficticio B',true),
 ('cccccccc-0000-4000-8000-000000000203','Comercio ficticio C',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values ('dddddddd-0000-4000-8000-000000000204',
  'aaaaaaaa-0000-4000-8000-000000000201',
  now()-interval '2 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1
 (round_id,line_no,product_code,quantity,unit) values
 ('dddddddd-0000-4000-8000-000000000204',1,'cemento_001',10,'bag'),
 ('dddddddd-0000-4000-8000-000000000204',2,'pintura_001',3,'l');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position) values
 ('dddddddd-0000-4000-8000-000000000204',
 'bbbbbbbb-0000-4000-8000-000000000202','anon_test_b',1);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000204';

do $t$
declare
 r uuid:='dddddddd-0000-4000-8000-000000000204';
 b uuid:='bbbbbbbb-0000-4000-8000-000000000202';
 c uuid:='cccccccc-0000-4000-8000-000000000203';
 ev1 uuid:='eeeeeeee-0000-4000-8000-000000000205';
 ev2 uuid:='eeeeeeee-0000-4000-8000-000000000206';
 ev3 uuid:='eeeeeeee-0000-4000-8000-000000000207';
 ev4 uuid:='eeeeeeee-0000-4000-8000-000000000208';
 ev5 uuid:='eeeeeeee-0000-4000-8000-000000000209';
 quote jsonb:='{"currency":"ARS","payment_method":"contado","lead_days":3,
  "freight_gross":"100.00","min_goods_gross":"0.00",
  "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
  "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb;
 newer jsonb;
 receipt jsonb;
begin
 -- Aún sin login de comercio, funciones privadas solo postgres controlado.
 -- No permitir que IDs o forma de autenticación sean confiados a WhatsApp.
 perform pg_temp.must_fail(format(
  'select cotironda_private.save_offer_draft_atomic_v1(%L,%L,%L,0,%L::jsonb)',
  r,c,ev1,quote::text),'supplier_not_invited');
 if (select count(*) from cotironda_private.offer_events_v1)<>0
 then raise exception 'uninvited_event_persisted';end if;

 perform pg_temp.must_fail(format(
  'select cotironda_private.save_offer_draft_atomic_v1(%L,%L,%L,0,%L::jsonb)',
  r,b,ev1,(quote||'{"telefono":"221123456"}'::jsonb)::text),
  'quote_payload_invalid');
 perform pg_temp.must_fail(format(
  'select cotironda_private.save_offer_draft_atomic_v1(%L,%L,%L,0,%L::jsonb)',
  r,b,ev1,jsonb_set(quote,'{lines_snapshot,0,net_unit_price}','"2e5"')::text),
  'quote_lines_invalid');
 perform pg_temp.must_fail(format(
  'select cotironda_private.save_offer_draft_atomic_v1(%L,%L,%L,0,%L::jsonb)',
  r,b,ev1,jsonb_set(quote,'{freight_gross}','"-50.00"')::text),
  'quote_payload_invalid');

 receipt:=cotironda_private.save_offer_draft_atomic_v1(r,b,ev1,0,quote);
 if receipt<> '{"estado":"borrador_guardado","revision":1,"repetido":false}'::jsonb
 then raise exception 'draft_receipt_unexpected: %',receipt;end if;
 if (select count(*) from cotironda_private.offer_versions_v1)<>0
 then raise exception 'draft_cannot_be_confirmed_automatically';end if;
 if (select count(*) from cotironda_private.offer_events_v1)<>1
 then raise exception 'draft_event_not_atomic';end if;
 receipt:=cotironda_private.save_offer_draft_atomic_v1(r,b,ev1,0,quote);
 if receipt->>'repetido'<>'true' or (receipt->>'revision')::int<>1
 then raise exception 'draft_replay_not_idempotent'; end if;
 perform pg_temp.must_fail(format(
  'select cotironda_private.save_offer_draft_atomic_v1(%L,%L,%L,0,%L::jsonb)',
  r,b,ev1,(quote||'{"freight_gross":"101.00"}'::jsonb)::text),
  'event_id_conflict');
 perform pg_temp.must_fail(format(
  'select cotironda_private.save_offer_draft_atomic_v1(%L,%L,%L,0,%L::jsonb)',
  r,b,ev2,quote::text),
  'stale_draft_revision');

 receipt:=cotironda_private.confirm_offer_atomic_v1(r,b,ev3,1);
 if receipt<> '{"estado":"cotizacion_confirmada","revision":1,"version":1,"repetido":false}'::jsonb
 then raise exception 'confirmation_receipt_unexpected: %',receipt;end if;
 if (select count(*) from cotironda_private.offer_versions_v1)<>1
 then raise exception 'confirmation_not_atomic';end if;
 receipt:=cotironda_private.confirm_offer_atomic_v1(r,b,ev3,1);
 if receipt->>'repetido'<>'true' or (receipt->>'version')::int<>1
 then raise exception 'confirmation_replay_not_idempotent';end if;
 perform pg_temp.must_fail(format(
  'select cotironda_private.confirm_offer_atomic_v1(%L,%L,%L,1)',
  r,b,ev4),'revision_already_confirmed');
 perform pg_temp.must_fail(format(
  'select cotironda_private.confirm_offer_atomic_v1(%L,%L,%L,0)',
  r,b,ev4),'confirmation_invalid');
 perform pg_temp.must_fail(format(
  'select cotironda_private.confirm_offer_atomic_v1(%L,%L,%L,1)',
  r,c,ev4),'supplier_not_invited');

 -- Revisar sin sobreescribir la oferta anterior; solo nueva confirmación activa.
 newer:=jsonb_set(quote,'{freight_gross}','"150.00"');
 receipt:=cotironda_private.save_offer_draft_atomic_v1(r,b,ev2,1,newer);
 if (receipt->>'revision')::int<>2 then raise exception 'draft_revision_two_failed';end if;
 if (select freight_gross from cotironda_private.offer_versions_v1
  where round_id=r and supplier_org_id=b and version=1)<>100
 then raise exception 'old_version_corrupted_before_confirmation';end if;
 receipt:=cotironda_private.confirm_offer_atomic_v1(r,b,ev5,2);
 if (receipt->>'version'<>'2' then raise exception 'version_increment_invalid';end if;
 if (select count(*) from cotironda_private.offer_versions_v1
  where round_id=r and supplier_org_id=b)<>2 or
  (select freight_gross from cotironda_private.offer_versions_v1
    where round_id=r and supplier_org_id=b and version=1)<>100 or
  (select freight_gross from cotironda_private.offer_versions_v1
    where round_id=r and supplier_org_id=b and version=2)<>150
 then raise exception 'immutable_history_not_preserved'; end if;
 perform pg_temp.must_fail(format(
  'update cotironda_private.offer_versions_v1 set freight_gross=0 where round_id=%L',
  r),'confirmed_offer_and_event_are_immutable');
end;$t$;

-- Ronda cancelada no crea evento ni borrador nuevo; replay idéntico conserva
-- el mismo comprobante ya emitido y NO representa un nuevo presupuesto.
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
values ('dddddddd-0000-4000-8000-000000000210',
 'aaaaaaaa-0000-4000-8000-000000000201',
 now()-interval '2 minutes',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
values ('dddddddd-0000-4000-8000-000000000210',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position) values
 ('dddddddd-0000-4000-8000-000000000210',
 'bbbbbbbb-0000-4000-8000-000000000202','anon_cancel_b',1);
update cotironda_private.rounds_v1 set status='cancelada'
where id='dddddddd-0000-4000-8000-000000000210';
select pg_temp.must_fail(
 $cmd$select cotironda_private.save_offer_draft_atomic_v1(
 'dddddddd-0000-4000-8000-000000000210',
 'bbbbbbbb-0000-4000-8000-000000000202',
 'eeeeeeee-0000-4000-8000-000000000211',0,
 '{"currency":"ARS","payment_method":"contado","lead_days":3,
 "freight_gross":"100.00","min_goods_gross":"0.00",
 "lines_snapshot":[{"line_no":1,"unit":"bag","available_qty":"10",
 "net_unit_price":"2500.00","vat_rate":"21"}]}'::jsonb)$cmd$,
 'round_not_accepting_quotes');

-- D026 no habilita roles de Data API ni escribe en producción.
rollback;
do $t$ begin
 if exists(select 1 from cotironda_private.rounds_v1
    where id='dddddddd-0000-4000-8000-000000000204')
 or exists(select 1 from public.organizations
    where id='aaaaaaaa-0000-4000-8000-000000000201')
 then raise exception 'd026_rollback_failed';end if;
end;$t$;
