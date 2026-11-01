-- D025 / Issue #149. PostgreSQL 17 CI, siempre ROLLBACK.
begin;

insert into auth.users(id,email_confirmed_at,is_anonymous)
 values ('11111111-1111-4111-8111-111111111111',now(),false),
        ('22222222-2222-4222-8222-222222222222',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('33333333-3333-4333-8333-333333333333',
 '11111111-1111-4111-8111-111111111111',now()+interval '1 day');
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Comprador Alfa','buyer'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Comprador Beta','buyer');
insert into public.organization_members(organization_id,user_id,membership_role,status)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '11111111-1111-4111-8111-111111111111','owner','active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '22222222-2222-4222-8222-222222222222','owner','active');
insert into cotironda_private.rounds_v1(id,buyer_org_id,begins_at,ends_at) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',now()-interval '1 hour',now()+interval '1 hour'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',now()-interval '1 hour',now()+interval '1 hour');
insert into cotironda_private.round_items_v1(round_id,line_no,product_code,quantity,unit)
 values ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'cemento_001',10,'bag'),
        ('dddddddd-dddd-4ddd-8ddd-dddddddddddd',2,'pintura_001',3,'l'),
        ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',1,'privado_001',2,'unit');

do $test$
begin
  if exists(select 1 from pg_roles where rolname='cotironda_rounds_reader'
    and (rolcanlogin or rolbypassrls)) then raise exception 'reader_has_privileged_role'; end if;
  -- Simulación de Supabase hospedado: el reader NO tiene USAGE de auth.
  -- Solo usa JWT de PostgREST y validación de sesión con función restringida.
  if has_schema_privilege('cotironda_rounds_reader','auth','USAGE')
     or has_function_privilege('anon',
       'cotironda_private.request_user_id_v035()','EXECUTE')
     or has_function_privilege('authenticated',
       'cotironda_private.request_user_id_v035()','EXECUTE')
     or not has_function_privilege('cotironda_rounds_reader',
       'cotironda_private.request_user_id_v035()','EXECUTE')
     or (select prosecdef from pg_proc
          where oid='cotironda_private.request_user_id_v035()'::regprocedure)<>false
  then raise exception 'hosted_auth_reader_isolation_regression';end if;
  if has_function_privilege('anon','public.buyer_round_overview_v1(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.buyer_round_overview_v1(uuid)','EXECUTE')
     or has_table_privilege('authenticated','cotironda_private.rounds_v1','SELECT')
     or has_table_privilege('cotironda_rounds_reader','cotironda_private.offer_versions_v1','SELECT')
     or has_table_privilege('cotironda_rounds_reader','cotironda_private.round_invites_v1','SELECT')
     or (select prosecdef from pg_proc
         where oid='public.buyer_round_overview_v1(uuid)'::regprocedure)<>false
     or (select pg_get_userbyid(proowner) from pg_proc
         where oid='cotironda_private.buyer_round_overview_v1(uuid)'::regprocedure)<>'cotironda_rounds_reader'
  then raise exception 'read_permissions_invalid'; end if;
end;$test$;

-- Simular JWT firmado de PostgREST sólo en PostgreSQL efímero.
set local role authenticated;
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111",
   "session_id":"33333333-3333-4333-8333-333333333333",
   "is_anonymous":false,"cotironda_email_verified":true}';

select ci_helpers.assert_true(
 (select count(*)=1 from public.buyer_round_overview_v1(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd')),
 'own_round_should_be_visible');
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_round_overview_v1(
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')),
 'cross_tenant_round_must_be_invisible');
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_round_overview_v1(
  'ffffffff-ffff-4fff-8fff-ffffffffffff')),
 'nonexistent_round_should_be_invisible');
select ci_helpers.assert_true(
 (select jsonb_array_length(items)=2 from public.buyer_round_overview_v1(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd')),
 'own_items_should_have_two_lines');
select ci_helpers.assert_true(
 (select items::text not like '%supplier_org_id%' and
    items::text not like '%precio%' and
    items::text not like '%anon_%'
    from public.buyer_round_overview_v1(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd')),
 'no_supplier_or_offer_info');

-- D035: cuando la claim legacy sub discrepa de JSON sub,
-- el helper debe detectarlo y la lectura negarse (antes se hacía por auth.uid()).
set local request.jwt.claim.sub = '22222222-2222-4222-8222-222222222222';
do $mismatch$
declare denied boolean:=false;
begin
 begin
  perform * from public.buyer_round_overview_v1(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 exception when insufficient_privilege then denied:=true; end;
 if not denied then raise exception 'conflicting_sub_claims_accepted'; end if;
end;$mismatch$;
set local request.jwt.claim.sub = '';
reset role;
-- Suspender membresía y probar que JWT firmado antiguo NO concede acceso.
update public.organization_members set status='suspended'
 where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
set local role authenticated;
select ci_helpers.assert_true(
 (select count(*)=0 from public.buyer_round_overview_v1(
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd')),
 'suspended_membership_must_fail_closed');
reset role;
update public.organization_members set status='active'
 where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

-- Sesión revocada: la función privada debe lanzar 42501, no usar JWT firmado solamente.
delete from auth.sessions where id='33333333-3333-4333-8333-333333333333';
set local role authenticated;
do $test$
declare v_denied boolean:=false;
begin
 begin
   perform * from public.buyer_round_overview_v1(
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'revoked_session_was_accepted'; end if;
end;
$test$;
reset role;

-- Sin sesión, cookie o correo verificado explícito, fail closed.
set local request.jwt.claims =
 '{"role":"authenticated","sub":"11111111-1111-4111-8111-111111111111",
  "is_anonymous":false,"cotironda_email_verified":false}';
set local role authenticated;
do $test$
declare v_denied boolean:=false;
begin
 begin
  perform * from public.buyer_round_overview_v1(
   'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
 exception when insufficient_privilege then v_denied:=true; end;
 if not v_denied then raise exception 'unverified_user_was_accepted'; end if;
end;$test$;
reset role;

rollback;
do $test$ begin
 if exists(select 1 from public.organizations where id=
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
 then raise exception 'D025_CI_rollback_failed'; end if;
end;$test$;
