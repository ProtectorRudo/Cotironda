-- Verifica migración 11 en PostgreSQL 17 efímero. NO subir bytes a Storage.
begin;
select ci_helpers.assert_true(
 (select public=false and file_size_limit=10485760 and cardinality(allowed_mime_types)=6
  from storage.buckets where id='cotironda-upload-quarantine'),
 'cuarentena privada 10 MiB y seis MIME');
select ci_helpers.assert_true(
 (select count(*) from pg_policies
  where schemaname='storage' and tablename='objects')=1,
 'ni una policy adicional permite listar o cargar en cuarentena');
select ci_helpers.assert_true(
 (select count(*) from pg_policies
  where schemaname='storage' and tablename='objects'
   and policyname='cotironda_buyer_drafts_read_member' and cmd='SELECT')=1,
 'lectura de borradores no cambió');
select ci_helpers.assert_true(
 (select relrowsecurity from pg_class
  where oid='cotironda_private.document_intake_jobs'::regclass),
 'ledger privado RLS habilitado');
select ci_helpers.assert_true(
 (select count(*) from pg_policies
  where schemaname='cotironda_private' and tablename='document_intake_jobs')=0,
 'sin policies para usuarios del ledger');
select ci_helpers.assert_true(
 not has_table_privilege('anon','cotironda_private.document_intake_jobs','SELECT')
 and not has_table_privilege('authenticated','cotironda_private.document_intake_jobs','INSERT')
 and not has_table_privilege('authenticated','cotironda_private.document_intake_jobs','UPDATE')
 and not has_table_privilege('service_role','cotironda_private.document_intake_jobs','DELETE')
 and has_table_privilege('service_role','cotironda_private.document_intake_jobs','SELECT')
 and has_table_privilege('service_role','cotironda_private.document_intake_jobs','INSERT'),
 'ledger sin permisos de usuario, service_role no puede DELETE');
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('a1111111-1111-4111-8111-111111111111',now(),false);
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Buyer cuarentena A','buyer'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Buyer cuarentena B','buyer');
insert into cotironda_private.document_intake_jobs(
 id,organization_id,requested_by,request_id,file_id,idempotency_key,declared_mime,declared_size)
values(
 '11111111-1111-4111-8111-111111111111',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 'a1111111-1111-4111-8111-111111111111',
 'c1111111-1111-4111-8111-111111111111',
 'd1111111-1111-4111-8111-111111111111',
 'e1111111-1111-4111-8111-111111111111',
 'application/pdf',1234);
select ci_helpers.assert_true(
 (select status='pending' and scan_verdict is null
  from cotironda_private.document_intake_jobs
  where id='11111111-1111-4111-8111-111111111111'),
 'pendiente y sin aprobado por defecto');
-- No duplicar el mismo pedido ni el mismo objeto para el mismo cliente.
do $guard$
begin
 begin
  insert into cotironda_private.document_intake_jobs
   (organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    gen_random_uuid(),gen_random_uuid(),'e1111111-1111-4111-8111-111111111111',
    'application/pdf',1200);
  raise exception 'TEST_FAILED: dedupe no funciona';
 exception when unique_violation then null; end;
 begin
  insert into cotironda_private.document_intake_jobs
   (organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    gen_random_uuid(),'d1111111-1111-4111-8111-111111111111',
    gen_random_uuid(),'application/pdf',1200);
  raise exception 'TEST_FAILED: objeto duplicado';
 exception when unique_violation then null; end;
 -- No permitir aprobar directamente sin scanner.
 begin
  update cotironda_private.document_intake_jobs set status='approved'
  where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: aprobación sin scanner';
 exception when raise_exception then
  if sqlerrm not in ('document_transition_invalid') then raise; end if;
 end;
 -- No permitir cambiar el tenant de un documento.
 begin
  update cotironda_private.document_intake_jobs
   set organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: tenant mutable';
 exception when raise_exception then
  if sqlerrm not in ('document_identity_immutable') then raise;end if;
 end;
 -- MIME falso y tamaño excesivo no persisten.
 begin
  insert into cotironda_private.document_intake_jobs
   (organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'application/x-msdownload',1234);
  raise exception 'TEST_FAILED: MIME arbitrario';
 exception when check_violation then null;end;
 begin
  insert into cotironda_private.document_intake_jobs
   (organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'application/pdf',10485761);
  raise exception 'TEST_FAILED: archivo >10 MiB';
 exception when check_violation then null;end;
end;$guard$;
-- Mismo ID de idempotencia en empresas diferentes es aceptable (scope por tenant).
insert into cotironda_private.document_intake_jobs(
 organization_id,request_id,file_id,idempotency_key,declared_mime,declared_size)
values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
 gen_random_uuid(),gen_random_uuid(),'e1111111-1111-4111-8111-111111111111','application/pdf',1234);

-- Camino válido del worker: pending -> quarantine -> scanning -> approved CON veredicto.
update cotironda_private.document_intake_jobs set status='quarantined'
where id='11111111-1111-4111-8111-111111111111';
update cotironda_private.document_intake_jobs set status='scanning'
where id='11111111-1111-4111-8111-111111111111';
do $guard$
begin
 begin
  update cotironda_private.document_intake_jobs set status='approved'
  where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: aprobado sin hash/veredicto';
 exception when check_violation then null;end;
end;$guard$;
update cotironda_private.document_intake_jobs
set status='approved',scan_verdict='clean',scan_completed_at=now(),
 scanner_version='ci-fake-scanner-not-production',
 sha256_hex=repeat('a',64)
where id='11111111-1111-4111-8111-111111111111';
select ci_helpers.assert_true(
 (select status='approved' and sha256_hex=repeat('a',64)
  from cotironda_private.document_intake_jobs
  where id='11111111-1111-4111-8111-111111111111'),
 'solo scanner marcado limpio y hash pueden aprobar');
do $guard$
begin
 begin
  update cotironda_private.document_intake_jobs set status='quarantined'
  where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: aprobado revivió';
 exception when raise_exception then
  if sqlerrm not in ('document_transition_invalid') then raise;end if;
 end;
 begin
  update cotironda_private.document_intake_jobs set sha256_hex=repeat('b',64)
  where id='11111111-1111-4111-8111-111111111111';
  raise exception 'TEST_FAILED: alteración de hash final';
 exception when raise_exception then
  if sqlerrm not in ('document_terminal_immutable') then raise;end if;
 end;
end;$guard$;
select ci_helpers.assert_true(
 (select count(*) from cotironda_private.document_intake_jobs)=2
 and (select count(*) from storage.objects)=0
 and (select enabled=false from cotironda_private.registration_settings where singleton=true),
 'dos filas internas ficticias y cero archivos reales');
rollback;
