-- Test de alta a través de la única función permitida.
-- Fixtures artificiales, ejecutadas con rollback.
begin;
insert into auth.users(id) values ('cccccccc-3333-4333-8333-333333333333');

select ci_helpers.assert_true(
 (select p.prosecdef and r.rolname='cotironda_registrar'
  from pg_proc p join pg_roles r on r.oid=p.proowner
  where p.oid='cotironda_private.register_company(uuid,uuid,text,text,text)'::regprocedure),
 'función con propietario segregado');
select ci_helpers.assert_true(
 (select not rolcanlogin and not rolbypassrls and not rolsuper
  from pg_roles where rolname='cotironda_registrar'),
 'registrar sin login, superuser o bypass RLS');
select ci_helpers.assert_true(
 (select not rolcanlogin and not rolbypassrls
  from pg_roles where rolname='cotironda_app'),
 'app sin login y bypass');
select ci_helpers.assert_true(
 not has_schema_privilege('cotironda_registrar','cotironda_private','CREATE'),
 'registrar no puede crear objetos nuevos');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','public.organization_members','INSERT')
 and not has_table_privilege('cotironda_app','public.organization_members','SELECT'),
 'app no puede insertar ni leer membresías');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','public.organizations','INSERT')
 and not has_table_privilege('cotironda_app','public.organizations','SELECT'),
 'app no puede insertar ni leer organizaciones');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app',
 'cotironda_private.organization_registration_requests','INSERT'),
 'app no puede manipular requests');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','public.supplier_profiles','INSERT'),
 'app no puede insertar perfiles');
select ci_helpers.assert_true(
 has_function_privilege('cotironda_app',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'app conserva solo llamada al procedimiento');
select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'authenticated sin acceso a función');
select ci_helpers.assert_true(
 not has_function_privilege('anon',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'anon sin acceso a función');
select ci_helpers.assert_true(
 not has_function_privilege('service_role',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'service role sin acceso a función');

set local role cotironda_app;
do $$
begin
 begin
   insert into public.organization_members(organization_id,user_id,membership_role)
   values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
           'cccccccc-3333-4333-8333-333333333333','owner');
   raise exception 'TEST_FAILED: app pudo insert directo membership';
 exception when insufficient_privilege then null;
 end;
 begin
   insert into public.organizations(display_name,organization_type)
    values ('Bypass malicioso','supplier');
   raise exception 'TEST_FAILED: app pudo insert directo empresa';
 exception when insufficient_privilege then null;
 end;
end;
$$;

do $$
begin
 if (select replay from cotironda_private.register_company(
  'cccccccc-3333-4333-8333-333333333333',
  '11111111-eeee-4111-8111-111111111111',
  'Empresa demo','supplier','Corralón prueba')) is distinct from false then
  raise exception 'TEST_FAILED: primera alta debe crear';
 end if;
 if (select replay from cotironda_private.register_company(
  'cccccccc-3333-4333-8333-333333333333',
  '11111111-eeee-4111-8111-111111111111',
  'Empresa demo','supplier','Corralón prueba')) is distinct from true then
  raise exception 'TEST_FAILED: reintento debe ser replay';
 end if;
end;
$$;
reset role;
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Empresa demo')=1,
 'se creó una sola organización');
select ci_helpers.assert_true(
 (select count(*) from public.organization_members m join public.organizations o
 on o.id=m.organization_id where o.display_name='Empresa demo'
 and m.membership_role='owner')=1,
 'función registró propietario');
select ci_helpers.assert_true(
 (select count(*) from public.supplier_profiles
 where trade_name='Corralón prueba' and accepting_quotes=false)=1,
 'proveedor nació deshabilitado');
rollback;
