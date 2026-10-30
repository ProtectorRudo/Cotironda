-- D028 PG17 - synth-only; entire data transaction ROLLBACK.
begin;
create function pg_temp.must_fail(p_sql text,p_fragment text) returns void
language plpgsql as $$
declare v_msg text; failed boolean:=false;
begin
 begin execute p_sql;
 exception when others then
  get stacked diagnostics v_msg=message_text;
  if position(p_fragment in v_msg)=0 then
    raise exception 'unexpected_failure expected:% actual:%',p_fragment,v_msg;
  end if; failed:=true;
 end;
 if not failed then raise exception 'unexpected_success:%',p_fragment; end if;
end;$$;

do $$
begin
 if not exists(select 1 from pg_roles where rolname='cotironda_whapi_inbox_writer'
   and not rolcanlogin and not rolbypassrls and not rolinherit)
 then raise exception 'whapi_writer_role_bad';end if;
 if has_table_privilege('anon','cotironda_private.whapi_inbox_v1','SELECT')
    or has_table_privilege('authenticated','cotironda_private.whapi_inbox_v1','INSERT')
    or has_table_privilege('service_role','cotironda_private.whapi_contacts_v1','SELECT')
    or has_function_privilege('authenticated',
     'cotironda_private.whapi_record_optout_v1(text,text,text,text,bigint)','EXECUTE')
    or has_function_privilege('service_role',
     'cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)','EXECUTE')
    or (select pg_get_userbyid(proowner) from pg_proc
      where oid='cotironda_private.whapi_inbox_record_v1(text,text,text,text,text,bytea,bytea,bytea,bigint)'::regprocedure)
      <>'cotironda_whapi_inbox_writer'
    or (select count(*) from pg_class where oid in
    ('cotironda_private.whapi_inbox_v1'::regclass,'cotironda_private.whapi_contacts_v1'::regclass)
    and relrowsecurity)<>2
 then raise exception 'whapi_security_permissions_invalid';end if;
 if exists(select 1 from information_schema.columns
   where table_schema='cotironda_private'
   and table_name='whapi_inbox_v1'
   and column_name in ('chat_id','phone','telephone','message_body','texto','wa_id'))
 then raise exception 'plaintext_columns_found';end if;
end;$$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-0000-4000-8000-000000000301','Comprador ficticio','buyer'),
 ('bbbbbbbb-0000-4000-8000-000000000302','Proveedor ficticio B','supplier'),
 ('cccccccc-0000-4000-8000-000000000303','Proveedor ficticio C','supplier');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
 values ('bbbbbbbb-0000-4000-8000-000000000302','Corralón sintético',true),
        ('cccccccc-0000-4000-8000-000000000303','Pinturería sintética',true);
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values ('dddddddd-0000-4000-8000-000000000304',
   'aaaaaaaa-0000-4000-8000-000000000301',now()-interval '1 minute',now()+interval '2 hours'),
 ('dddddddd-0000-4000-8000-000000000305',
   'aaaaaaaa-0000-4000-8000-000000000301',now()-interval '1 minute',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit) values
 ('dddddddd-0000-4000-8000-000000000304',1,'cemento_001',10,'bag'),
 ('dddddddd-0000-4000-8000-000000000305',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1
 (round_id,supplier_org_id,anon_id,invite_position) values
 ('dddddddd-0000-4000-8000-000000000304',
  'bbbbbbbb-0000-4000-8000-000000000302','anon_test_b',1),
 ('dddddddd-0000-4000-8000-000000000305',
  'bbbbbbbb-0000-4000-8000-000000000302','anon_test_b',1);
insert into cotironda_private.whapi_contacts_v1
 (channel_id,chat_key,supplier_org_id,verified_at,consented_at) values
 ('whapi-dev',repeat('a',64),'bbbbbbbb-0000-4000-8000-000000000302',
   now()-interval '1 day',now()-interval '1 day'),
 ('whapi-dev',repeat('f',64),'cccccccc-0000-4000-8000-000000000303',
   now()-interval '1 day',now()-interval '1 day');
update cotironda_private.rounds_v1 set status='abierta'
 where id in ('dddddddd-0000-4000-8000-000000000304',
 'dddddddd-0000-4000-8000-000000000305');

-- Ambigüedad: proveedor pertenece a DOS rondas abiertas. No inferir contexto.
select pg_temp.must_fail(
 $cmd$select cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',50),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)$cmd$,
 'inbox_invitation_missing_or_ambiguous');
-- Cancelar la segunda; una sola invitación activa.
update cotironda_private.rounds_v1 set status='cancelada'
 where id='dddddddd-0000-4000-8000-000000000305';

do $$
declare r jsonb;
begin
 r:=cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',50),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000);
 if r<> '{"estado":"entrada_persistida","repetido":false}'::jsonb
 then raise exception 'inbox_first_save_failed';end if;
 r:=cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('a',64),repeat('b',64),repeat('c',64),'text',
 decode(repeat('44',50),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000);
 if r->>'repetido'<>'true' then raise exception 'inbox_replay_failed';end if;
 if (select count(*) from cotironda_private.whapi_inbox_v1)<>1
 then raise exception 'duplicate_inbox_insert';end if;
 if (select round_id from cotironda_private.whapi_inbox_v1 where message_key=repeat('b',64))
   <>'dddddddd-0000-4000-8000-000000000304'::uuid
 then raise exception 'wrong_round_binding';end if;
end;$$;
select pg_temp.must_fail(
 $cmd$select cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('a',64),repeat('b',64),repeat('d',64),'text',
 decode(repeat('44',50),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)$cmd$,
 'inbox_event_collision');
select pg_temp.must_fail(
 $cmd$select cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('f',64),repeat('e',64),repeat('d',64),'text',
 decode(repeat('44',50),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)$cmd$,
 'inbox_invitation_missing_or_ambiguous');
select pg_temp.must_fail(
 $cmd$select cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('a',64),repeat('e',64),repeat('d',64),'text',
 decode('44','hex'),decode('11','hex'),decode(repeat('22',16),'hex'),1800000000)$cmd$,
 'inbox_payload_invalid');
select pg_temp.must_fail(
 $cmd$update cotironda_private.whapi_inbox_v1 set status='opt_out_registrado'
 where channel_id='whapi-dev'$cmd$,'whapi_inbox_immutable');
select pg_temp.must_fail(
 $cmd$update cotironda_private.whapi_contacts_v1 set consented_at=now()
 where channel_id='whapi-dev' and chat_key=repeat('a',64)$cmd$,
 'whapi_contact_immutable_or_optout_reset');

-- BAJA no necesita invitación activa ni texto claro.
update cotironda_private.rounds_v1 set status='cancelada'
 where id='dddddddd-0000-4000-8000-000000000304';
do $$
declare r jsonb;
begin
 r:=cotironda_private.whapi_record_optout_v1(
  'whapi-dev',repeat('a',64),repeat('e',64),repeat('f',64),1800000001);
 if r<>'{"estado":"baja_registrada","repetido":false}'::jsonb
 then raise exception 'optout_failed';end if;
 r:=cotironda_private.whapi_record_optout_v1(
  'whapi-dev',repeat('a',64),repeat('e',64),repeat('f',64),1800000001);
 if r->>'repetido'<>'true' then raise exception 'optout_replay_failed';end if;
 if (select opted_out_at is not null from cotironda_private.whapi_contacts_v1
  where chat_key=repeat('a',64)) is not true
 then raise exception 'optout_did_not_revoke';end if;
 if (select count(*) from cotironda_private.whapi_inbox_v1
  where kind='opt_out' and payload_ciphertext is null and round_id is null)<>1
 then raise exception 'optout_stored_plaintext_or_round';end if;
end;$$;
select pg_temp.must_fail(
 $cmd$select cotironda_private.whapi_record_optout_v1(
 'whapi-dev',repeat('a',64),repeat('e',64),repeat('d',64),1800000001)$cmd$,
 'inbox_event_collision');
select pg_temp.must_fail(
 $cmd$update cotironda_private.whapi_contacts_v1 set opted_out_at=null
 where channel_id='whapi-dev' and chat_key=repeat('a',64)$cmd$,
 'whapi_contact_immutable_or_optout_reset');
-- Reabrir una nueva ronda debe continuar bloqueando al contacto dado de baja.
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at)
 values ('dddddddd-0000-4000-8000-000000000306',
  'aaaaaaaa-0000-4000-8000-000000000301',now()-interval '1 minute',now()+interval '2 hours');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values ('dddddddd-0000-4000-8000-000000000306',1,'cemento_001',10,'bag');
insert into cotironda_private.round_invites_v1(round_id,supplier_org_id,anon_id,invite_position)
 values ('dddddddd-0000-4000-8000-000000000306',
  'bbbbbbbb-0000-4000-8000-000000000302','anon_new_b',1);
update cotironda_private.rounds_v1 set status='abierta'
 where id='dddddddd-0000-4000-8000-000000000306';
select pg_temp.must_fail(
 $cmd$select cotironda_private.whapi_inbox_record_v1(
 'whapi-dev',repeat('a',64),repeat('7',64),repeat('c',64),'text',
 decode(repeat('44',50),'hex'),decode(repeat('11',12),'hex'),
 decode(repeat('22',16),'hex'),1800000000)$cmd$,
 'inbox_consent_revoked');

rollback;
do $$
begin
 if exists(select 1 from cotironda_private.whapi_inbox_v1)
 or exists(select 1 from cotironda_private.whapi_contacts_v1)
 or exists(select 1 from public.organizations where id='aaaaaaaa-0000-4000-8000-000000000301')
 then raise exception 'd028_rollback_failed';end if;
end;$$;
