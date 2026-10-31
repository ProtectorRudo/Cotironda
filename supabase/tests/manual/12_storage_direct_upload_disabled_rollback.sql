-- Sólo cotironda-dev. PROHIBIDO usar en producción.
-- Ejecutar únicamente tras migración 10. Datos ficticios en BEGIN/ROLLBACK.
-- Inserción de una FILA DE METADATOS como postgres: NO es un archivo físico.
begin;
set local statement_timeout='15s';
do $pre$
declare v_user uuid;
begin
 if (select enabled from cotironda_private.registration_settings where singleton=true) is distinct from false
 or (select count(*) from public.organizations)<>0
 or (select count(*) from public.organization_members)<>0
 or (select count(*) from auth.sessions)<>0
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>0
 or (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
      and policyname='cotironda_buyer_drafts_read_member'
      and cmd='SELECT' and position('storage_session_active' in coalesce(qual,''))>0)<>1
 or exists(select 1 from pg_policies where schemaname='storage' and tablename='objects'
      and cmd in ('INSERT','UPDATE','DELETE','ALL'))
 then raise exception 'TEST_FAILED: Storage dev no coincide con estado cerrado';end if;
 select id into v_user from auth.users
  where email_confirmed_at is not null and is_anonymous is not true
  order by created_at limit 1;
 if v_user is null then raise exception 'TEST_FAILED: falta usuario confirmado de ensayo';end if;
 perform set_config('cotironda_test.uid',v_user::text,true);
end;$pre$;
insert into public.organizations(id,display_name,organization_type)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Buyer Storage closed CI','buyer');
insert into public.organization_members(organization_id,user_id,membership_role,status)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 current_setting('cotironda_test.uid')::uuid,'owner','active');
insert into auth.sessions(id,user_id,not_after) values
 ('f1111111-1111-4111-8111-111111111111',
 current_setting('cotironda_test.uid')::uuid,null);
-- Fixture SQL as postgres: no Storage upload HTTP or bytes, then rollback.
insert into storage.objects(bucket_id,name)
values ('cotironda-buyer-drafts',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf');
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object(
 'sub',current_setting('cotironda_test.uid'),
 'session_id','f1111111-1111-4111-8111-111111111111',
 'role','authenticated',
 'is_anonymous',false,'cotironda_email_verified',true)::text,true);
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.uid'),true);
do $check$
begin
 if cotironda_private.storage_session_active() is distinct from true
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>1
 then raise exception 'TEST_FAILED: lectura al owner vigente rota';end if;
 begin
  insert into storage.objects(bucket_id,name)
   values('cotironda-buyer-drafts',
   'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
  raise exception 'TEST_FAILED: owner pudo hacer upload directo sin antivirus';
 exception when insufficient_privilege then null;
 end;
end;$check$;
reset role;
delete from auth.sessions where id='f1111111-1111-4111-8111-111111111111';
set local role authenticated;
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts')<>0
 then raise exception 'TEST_FAILED: JWT revocado aún lee';end if;
end;$check$;
reset role;
rollback;
select (select count(*) from public.organizations) as organizations_after,
 (select count(*) from public.organization_members) as memberships_after,
 (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') as objects_after,
 (select count(*) from auth.sessions) as sessions_after,
 (select enabled from cotironda_private.registration_settings where singleton=true) as registration_enabled;
