-- SOLO cotironda-dev. Tablas reales, ningún archivo físico, claims o usuarios nuevos.
-- Ensayo reversible; jamás ejecutar en producción.
begin;
set local statement_timeout='15s';
do $pre$
begin
 if (select enabled from cotironda_private.registration_settings where singleton=true) is distinct from false
  or (select count(*) from public.organizations) <> 0
  or (select count(*) from cotironda_private.document_intake_jobs) <> 0
  or (select count(*) from storage.objects) <> 0
  or (select count(*) from auth.sessions) <> 0
  or (select count(*) from pg_policies where schemaname='storage' and tablename='objects') <> 1
  or not exists(select 1 from storage.buckets where id='cotironda-upload-quarantine'
      and public=false and file_size_limit=10485760)
 then raise exception 'TEST_FAILED: dev no coincide con precondiciones'; end if;
end;$pre$;
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Quarantine ledger A CI','buyer'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Quarantine ledger B CI','buyer');
insert into cotironda_private.document_intake_jobs(
 id,organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
values('11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
 'application/pdf',1048576);
do $before$
begin
 if not exists(select 1 from cotironda_private.document_intake_jobs
  where id='11111111-1111-4111-8111-111111111111' and status='pending'
    and scan_verdict is null and sha256_hex is null)
 then raise exception 'TEST_FAILED: estado inicial no es pending';end if;
 begin
  insert into cotironda_private.document_intake_jobs(
   organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   gen_random_uuid(),gen_random_uuid(),
   'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','application/pdf',1048576);
  raise exception 'TEST_FAILED: no dedupe';
 exception when unique_violation then null;end;
 begin
  update cotironda_private.document_intake_jobs
  set status='approved' where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: aprobado sin escaneo';
 exception when raise_exception then if sqlerrm<>'document_transition_invalid' then raise;end if;end;
end;$before$;
-- El cliente no puede acceder al ledger, ni siquiera siendo authenticated.
set local role authenticated;
do $auth_denied$
begin
 begin
  perform count(*) from cotironda_private.document_intake_jobs;
  raise exception 'TEST_FAILED: authenticated leyó ledger privado';
 exception when insufficient_privilege then null;end;
end;$auth_denied$;
reset role;
-- Simular scanner en SQL, sin archivo: demuestra las constraints; NO es antivirus.
update cotironda_private.document_intake_jobs set status='quarantined'
 where id='11111111-1111-4111-8111-111111111111';
update cotironda_private.document_intake_jobs set status='scanning'
 where id='11111111-1111-4111-8111-111111111111';
do $no_scan$
begin
 begin
  update cotironda_private.document_intake_jobs set status='approved'
  where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: puede aprobar sin veredicto/hash';
 exception when check_violation then null;end;
end;$no_scan$;
update cotironda_private.document_intake_jobs
 set status='approved',scan_verdict='clean',
 scanner_version='ci-synthetic-NOT-antivirus',
 scan_completed_at=now(),sha256_hex=repeat('a',64)
 where id='11111111-1111-4111-8111-111111111111';
do $post$
begin
 if (select count(*) from cotironda_private.document_intake_jobs)<>1
    or not exists(select 1 from cotironda_private.document_intake_jobs
      where status='approved' and scan_verdict='clean')
    or (select count(*) from storage.objects)<>0
 then raise exception 'TEST_FAILED: resultado incorrecto/objeto creado';end if;
 begin
  update cotironda_private.document_intake_jobs set sha256_hex=repeat('b',64)
   where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: hash final mutable';
 exception when raise_exception then
  if sqlerrm<>'document_terminal_immutable' then raise;end if;end;
end;$post$;
rollback;
select (select count(*) from cotironda_private.document_intake_jobs) as jobs_after,
 (select count(*) from public.organizations) as organizations_after,
 (select count(*) from storage.objects) as objects_after,
 (select count(*) from auth.sessions) as sessions_after,
 (select enabled from cotironda_private.registration_settings where singleton=true) as registration_enabled;
