-- ONLY cotironda-dev and prechecked 9th migration; temporary real Auth session rows.
-- All changes (including auth.sessions) are ROLLBACK; no HTTP Storage or signed JWT.
begin;
set local statement_timeout='15s';
do $pre$
declare a uuid; b uuid;
begin
 if (select enabled from cotironda_private.registration_settings where singleton=true) is distinct from false
 or (select count(*) from auth.sessions)<>0
 or (select count(*) from public.organizations)<>0
 or (select count(*) from public.organization_members)<>0
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>0
 or (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
    and policyname like 'cotironda_buyer_drafts_%'
    and position('storage_session_active' in coalesce(qual,'')||coalesce(with_check,''))>0)<>2
 then raise exception 'TEST_FAILED: requisitos de dev no cumplidos';end if;
 select id into a from auth.users where email_confirmed_at is not null and is_anonymous is not true order by created_at limit 1;
 select id into b from auth.users where email_confirmed_at is null and is_anonymous is not true order by created_at limit 1;
 if a is null or b is null or a=b then raise exception 'TEST_FAILED: cuentas de ensayo no preparadas';end if;
 perform set_config('cotironda_test.a',a::text,true);
 perform set_config('cotironda_test.b',b::text,true);
end;$pre$;
insert into public.organizations(id,display_name,organization_type)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Ensayo revocación A','buyer'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Ensayo revocación B','buyer');
insert into public.organization_members(organization_id,user_id,membership_role,status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('cotironda_test.a')::uuid,'owner','active'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',current_setting('cotironda_test.b')::uuid,'owner','active');
insert into auth.sessions(id,user_id,not_after) values
('f1111111-1111-4111-8111-111111111111',current_setting('cotironda_test.a')::uuid,null),
('f2222222-2222-4222-8222-222222222222',current_setting('cotironda_test.b')::uuid,null);

-- Cuenta confirmada, sesión presente: lectura vacía y carga de metadata permitida.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.a'),'session_id','f1111111-1111-4111-8111-111111111111',
 'role','authenticated','is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.a'),true);
do $t$
begin
 if cotironda_private.storage_session_active() is distinct from true
 then raise exception 'TEST_FAILED: sesion A vigente denegada';end if;
end;$t$;
insert into storage.objects(bucket_id,name)
values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf');
do $t$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>1
 then raise exception 'TEST_FAILED: A no ve su borrador';end if;
end;$t$;
reset role;

-- Otra cuenta no confirmada aunque se suplante claim true en SQL: denegada.
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.b'),'session_id','f2222222-2222-4222-8222-222222222222',
 'role','authenticated','is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.b'),true);
do $t$
begin
 if cotironda_private.storage_session_active() is distinct from false
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>0
 then raise exception 'TEST_FAILED: cuenta pendiente obtuvo acceso';end if;
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
  raise exception 'TEST_FAILED: cuenta pendiente subio';
 exception when insufficient_privilege then null;end;
end;$t$;
reset role;

-- Revocar la sesión A pero conservar claim viejo en request emulado.
delete from auth.sessions where id='f1111111-1111-4111-8111-111111111111';
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.a'),'session_id','f1111111-1111-4111-8111-111111111111',
 'role','authenticated','is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.a'),true);
do $t$
begin
 if cotironda_private.storage_session_active() is distinct from false
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>0
 then raise exception 'TEST_FAILED: JWT anterior aun ve archivo';end if;
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
  raise exception 'TEST_FAILED: JWT anterior pudo escribir';
 exception when insufficient_privilege then null;end;
end;$t$;
reset role;

-- Nueva sesión de A: la anterior NO revive; nueva sesión sí.
insert into auth.sessions(id,user_id,not_after)
values ('f7777777-7777-4777-8777-777777777777',current_setting('cotironda_test.a')::uuid,null);
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.a'),'session_id','f1111111-1111-4111-8111-111111111111',
 'role','authenticated','is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.a'),true);
do $t$
begin
 if cotironda_private.storage_session_active() is distinct from false
 then raise exception 'TEST_FAILED: session anterior revivio tras login nuevo';end if;
end;$t$;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.a'),'session_id','f7777777-7777-4777-8777-777777777777',
 'role','authenticated','is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.a'),true);
do $t$
begin
 if cotironda_private.storage_session_active() is distinct from true
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>1
 then raise exception 'TEST_FAILED: nueva sesion no ve su borrador';end if;
end;$t$;
insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
reset role;

-- Vencimiento obligatorio incluso si ID sigue existiendo.
update auth.sessions set not_after=now()-interval '1 minute' where id='f7777777-7777-4777-8777-777777777777';
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.a'),'session_id','f7777777-7777-4777-8777-777777777777',
 'role','authenticated','is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.a'),true);
do $t$
begin
 if cotironda_private.storage_session_active() is distinct from false
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>0
 then raise exception 'TEST_FAILED: sesion vencida obtuvo acceso';end if;
end;$t$;
reset role;
do $post$
begin
 if (select count(*) from public.organizations)<>2
 or (select count(*) from public.organization_members)<>2
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>2
 then raise exception 'TEST_FAILED: fixtures inesperados';end if;
end;$post$;
rollback;
select (select count(*) from auth.sessions) as sessions_after,
(select count(*) from public.organizations) as orgs_after,
(select count(*) from public.organization_members) as members_after,
(select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') as files_after,
(select enabled from cotironda_private.registration_settings where singleton=true) as registration_enabled;
