-- ONLY cotironda-dev; actual managed storage.objects and real auth.users.
-- NEVER deploy, never use on production, never open commercial registrations.
-- One explicit transaction; 2 existing test users selected internally (no emails/UUID logs).
-- The storage.objects rows are ONLY SQL metadata, never Storage API file bytes.
-- Claims/role manually emulated: this is NOT a genuine signed Auth JWT E2E.
begin;
set local statement_timeout='15s';

do $pre$
declare v_confirmed uuid; v_other uuid;
begin
 if (select enabled from cotironda_private.registration_settings where singleton=true) is distinct from false
 or (select count(*) from public.organizations) <> 0
 or (select count(*) from public.organization_members) <> 0
 or (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 0 then
   raise exception 'TEST_FAILED: entorno no vacio o registro habilitado';
 end if;
 if not exists(select 1 from storage.buckets
  where id='cotironda-buyer-drafts' and public=false and file_size_limit=10485760)
 then raise exception 'TEST_FAILED: bucket privado ausente'; end if;
 select id into v_confirmed from auth.users
  where email_confirmed_at is not null and is_anonymous is not true order by created_at limit 1;
 select id into v_other from auth.users
  where email_confirmed_at is null and is_anonymous is not true order by created_at limit 1;
 if v_confirmed is null or v_other is null or v_confirmed=v_other
 then raise exception 'TEST_FAILED: se requieren dos cuentas de ensayo distintas'; end if;
 perform set_config('cotironda_test.user_a',v_confirmed::text,true);
 perform set_config('cotironda_test.user_b',v_other::text,true);
end;
$pre$;

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','CI ROLLBACK A','buyer'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','CI ROLLBACK B','both');
insert into public.organization_members(organization_id,user_id,membership_role,status)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('cotironda_test.user_a')::uuid,'owner','active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',current_setting('cotironda_test.user_b')::uuid,'owner','active');

-- A: real storage table, restricted ROLE authenticated, identity from test account.
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.user_a'),true);
insert into storage.objects(bucket_id,name)
 values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf');
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 1
 then raise exception 'TEST_FAILED: A no puede leer su propio objeto';end if;
end;$check$;

-- A cannot insert to B and cannot smuggle JS extension.
do $deny$
begin
 begin
  insert into storage.objects(bucket_id,name) values('cotironda-buyer-drafts','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
  raise exception 'TEST_FAILED: A escribio en B';
 exception when insufficient_privilege then null; end;
 begin
  insert into storage.objects(bucket_id,name) values('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.js');
  raise exception 'TEST_FAILED: se permitio JS';
 exception when insufficient_privilege then null; end;
end;
$deny$;

-- UPDATE and DELETE are denied even to an active owner; no upsert/replacement.
do $readonly$
declare affected integer;
begin
 update storage.objects set name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf'
 where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf';
 get diagnostics affected=row_count;
 if affected <> 0 then raise exception 'TEST_FAILED: owner pudo UPDATE';end if;
 delete from storage.objects
 where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.pdf';
 get diagnostics affected=row_count;
 if affected <> 0 then raise exception 'TEST_FAILED: owner pudo DELETE';end if;
end;$readonly$;

-- B: 2nd existing test user, Auth JWT still emulated. Cannot read A.
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.user_b'),true);
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 0
 then raise exception 'TEST_FAILED: B pudo leer objeto de A';end if;
end;$check$;
insert into storage.objects(bucket_id,name) values('cotironda-buyer-drafts','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 1
 then raise exception 'TEST_FAILED: B no puede leer propio objeto';end if;
end;$check$;

-- A can read its own A, but never B.
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.user_a'),true);
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 1
 then raise exception 'TEST_FAILED: A pudo leer B';end if;
end;$check$;

-- Remove owner privilege for A: reader only, cannot INSERT.
reset role;
update public.organization_members set membership_role='member'
 where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id=current_setting('cotironda_test.user_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.user_a'),true);
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 1
 then raise exception 'TEST_FAILED: member no puede leer su empresa';end if;
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
  raise exception 'TEST_FAILED: member pudo escribir';
 exception when insufficient_privilege then null;end;
end;$check$;

-- Suspend the member: both reads and new uploads must fail closed.
reset role;
update public.organization_members set status='suspended'
 where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id=current_setting('cotironda_test.user_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.user_a'),true);
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 0
 then raise exception 'TEST_FAILED: suspendido pudo leer';end if;
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
  raise exception 'TEST_FAILED: suspendido pudo escribir';
 exception when insufficient_privilege then null;end;
end;$check$;

-- Anon even with forged sub claim cannot read anything or insert.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub',current_setting('cotironda_test.user_b'),true);
do $check$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 0
 then raise exception 'TEST_FAILED: anon pudo leer';end if;
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/cccccccc-cccc-4ccc-8ccc-cccccccccccc/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
  raise exception 'TEST_FAILED: anon pudo escribir';
 exception when insufficient_privilege then null;end;
end;$check$;

reset role;
do $post$
begin
 if (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') <> 2
 or (select count(*) from public.organizations) <> 2
 or (select count(*) from public.organization_members) <> 2
 then raise exception 'TEST_FAILED: fixture inesperado';end if;
end;$post$;
-- ALL fixtures are reversed: never commit or create a Storage API object.
rollback;
select (select count(*) from public.organizations) as organizations_after,
       (select count(*) from public.organization_members) as members_after,
       (select count(*) from storage.objects where bucket_id='cotironda-buyer-drafts') as files_after,
       (select enabled from cotironda_private.registration_settings where singleton=true) as registration_enabled;
