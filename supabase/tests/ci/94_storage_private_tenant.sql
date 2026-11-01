-- Pruebas de Store RLS en PostgreSQL 17 efímero: TODO dentro de ROLLBACK.
-- JWT/Storage service emulados; no certifica upload HTTP ni MIME real.
begin;
insert into auth.users(id,email_confirmed_at,is_anonymous)
values ('11111111-1111-4111-8111-111111111111',now(),false),
('22222222-2222-4222-8222-222222222222',now(),false),
('33333333-3333-4333-8333-333333333333',now(),false),
('44444444-4444-4444-8444-444444444444',now(),false),
('55555555-5555-4555-8555-555555555555',now(),false),
('66666666-6666-4666-8666-666666666666',now(),false),
('77777777-7777-4777-8777-777777777777',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('81111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',null),
 ('82222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222',null),
 ('83333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333',null),
 ('84444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444',null),
 ('85555555-5555-4555-8555-555555555555','55555555-5555-4555-8555-555555555555',null),
 ('86666666-6666-4666-8666-666666666666','66666666-6666-4666-8666-666666666666',null),
 ('87777777-7777-4777-8777-777777777777','77777777-7777-4777-8777-777777777777',null);
insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Compradora A','buyer'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Compradora B','both'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Proveedor C','supplier');
insert into public.organization_members(organization_id,user_id,membership_role,status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner','active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner','active'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','member','active'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','member','suspended'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','66666666-6666-4666-8666-666666666666','manager','active'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','77777777-7777-4777-8777-777777777777','owner','active');
select ci_helpers.assert_true(
 (select public=false and file_size_limit=10485760 and cardinality(allowed_mime_types)=6
  from storage.buckets where id='cotironda-buyer-drafts'),
 'bucket privado 10 MiB y lista MIME limitada');
select ci_helpers.assert_true(
 (select count(*) from pg_policies where schemaname='storage'
 and tablename='objects' and policyname like 'cotironda_buyer_drafts_%')=2,
 'únicas políticas select e insert para drafts');
select ci_helpers.assert_true(
 not exists(select 1 from pg_policies where schemaname='storage'
   and tablename='objects' and policyname like 'cotironda_buyer_drafts_%'
   and cmd in ('UPDATE','DELETE','ALL')),
 'sin UPDATE ni DELETE para drafts');
select ci_helpers.assert_true(
 not has_table_privilege('authenticated','storage.buckets','UPDATE')
 and not has_table_privilege('anon','storage.buckets','UPDATE'),
 'usuarios no pueden volver público el bucket');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"11111111-1111-4111-8111-111111111111","session_id":"81111111-1111-4111-8111-111111111111"}',true);

insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
select ci_helpers.assert_true((select count(*) from storage.objects where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf')=1,'owner A puede cargar PDF');

do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf');
  raise exception 'TEST_FAILED: owner A no puede escribir sobre B';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/../bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
  raise exception 'TEST_FAILED: path con traversal es inválido';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/extra/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
  raise exception 'TEST_FAILED: path extra es inválido';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.js');
  raise exception 'TEST_FAILED: extensión JS está prohibida';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.docm');
  raise exception 'TEST_FAILED: legacy ejecutable doc macro está prohibido';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/presupuesto.pdf');
  raise exception 'TEST_FAILED: nombre arbitrario no permitido';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

select ci_helpers.assert_true((select count(*) from storage.objects)=1,'A solo ve archivo A');
-- UPDATE/DELETE no tiene policy aunque el caller tenga grants: deben afectar 0 filas.
do $block$
declare n integer;
begin
 update storage.objects set name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/ffffffff-ffff-4fff-8fff-ffffffffffff.pdf'
 where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf'; get diagnostics n=row_count;
 if n<>0 then raise exception 'TEST_FAILED: update no permitido';end if;
 delete from storage.objects where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf'; get diagnostics n=row_count;
 if n<>0 then raise exception 'TEST_FAILED: delete no permitido';end if;
end;
$block$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"22222222-2222-4222-8222-222222222222","session_id":"82222222-2222-4222-8222-222222222222"}',true);

insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.xlsx');
select ci_helpers.assert_true((select count(*) from storage.objects where name='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.xlsx')=1,'owner B puede cargar XLSX');

select ci_helpers.assert_true((select count(*) from storage.objects)=1,'B no ve archivos de A');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"33333333-3333-4333-8333-333333333333","session_id":"83333333-3333-4333-8333-333333333333"}',true);

select ci_helpers.assert_true((select count(*) from storage.objects)=1,'miembro de A puede leer A');
do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.png');
  raise exception 'TEST_FAILED: miembro no puede subir';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"44444444-4444-4444-8444-444444444444","session_id":"84444444-4444-4444-8444-444444444444"}',true);

select ci_helpers.assert_true((select count(*) from storage.objects)=0,'miembro suspendido no lee');
do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.pdf');
  raise exception 'TEST_FAILED: miembro suspendido no sube';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"55555555-5555-4555-8555-555555555555","session_id":"85555555-5555-4555-8555-555555555555"}',true);

select ci_helpers.assert_true((select count(*) from storage.objects)=0,'sin empresa no lee');
do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.pdf');
  raise exception 'TEST_FAILED: sin empresa no sube';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"66666666-6666-4666-8666-666666666666","session_id":"86666666-6666-4666-8666-666666666666"}',true);

insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.docx');
select ci_helpers.assert_true((select count(*) from storage.objects where name='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/99999999-9999-4999-8999-999999999999.docx')=1,'manager puede subir DOCX');

select ci_helpers.assert_true((select count(*) from storage.objects)=2,'manager solo ve los 2 de A');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-4777-8777-777777777777',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"77777777-7777-4777-8777-777777777777","session_id":"87777777-7777-4777-8777-777777777777"}',true);

select ci_helpers.assert_true((select count(*) from storage.objects)=0,'proveedor no ve borradores compradores');
do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','cccccccc-cccc-4ccc-8ccc-cccccccccccc/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.pdf');
  raise exception 'TEST_FAILED: supplier no sube';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select set_config('request.jwt.claims','{"role":"authenticated","is_anonymous":false,"cotironda_email_verified":true,"sub":"11111111-1111-4111-8111-111111111111","session_id":"81111111-1111-4111-8111-111111111111"}',true);

select ci_helpers.assert_true((select count(*) from storage.objects)=0,'anon no ve ni con sub falsificado');
do $block$
begin
 begin
  insert into storage.objects(bucket_id,name) values ('cotironda-buyer-drafts','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requests/dddddddd-dddd-4ddd-8ddd-dddddddddddd/88888888-8888-4888-8888-888888888888.pdf');
  raise exception 'TEST_FAILED: anon no puede subir';
 exception when insufficient_privilege then null;
 end;
end;
$block$;

reset role;
select ci_helpers.assert_true(
 (select count(*) from storage.objects)=3,
 'exactamente 3 objetos de prueba (A owner, B owner, A manager)');
rollback;
