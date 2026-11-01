-- Ejecutar en un PostgreSQL de CI o en transacción con ROLLBACK sobre
-- cotironda-dev. No crea cuentas reales. "cotironda_app" NOLOGIN.
begin;

insert into auth.users(id) values
 ('99999999-1111-4111-8111-111111111111');

select ci_helpers.assert_true(
 (select not rolcanlogin and not rolbypassrls and not rolsuper
  from pg_roles where rolname='cotironda_app'), 'rol sin login ni bypass');
select ci_helpers.assert_true(
 has_function_privilege('cotironda_app',
   'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'solamente puede ejecutar registro');
select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
   'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'authenticated no ejecuta registro');
select ci_helpers.assert_true(
 not has_function_privilege('service_role',
   'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'service_role no debe llamar a esta función');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','public.supplier_products','SELECT')
 and not has_table_privilege('cotironda_app','public.supplier_products','INSERT'),
 'sin privilegios sobre productos');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','cotironda_private.supplier_contacts','SELECT')
 and not has_table_privilege('cotironda_app','cotironda_private.supplier_contacts','INSERT'),
 'sin privilegios sobre contactos privados');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','public.organizations','UPDATE')
 and not has_table_privilege('cotironda_app','public.organizations','DELETE'),
 'no puede editar o borrar empresas');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','public.organization_members','UPDATE')
 and not has_table_privilege('cotironda_app','public.organization_members','DELETE'),
 'no puede cambiar roles');
select ci_helpers.assert_true(
 not has_table_privilege('cotironda_app','auth.users','SELECT'),
 'no puede enumerar usuarios Auth');

set local role cotironda_app;
select organization_id, replay from cotironda_private.register_company(
 '99999999-1111-4111-8111-111111111111',
 '77777777-1111-4111-8111-111111111111',
 'Constructora CI','supplier','Proveedora CI');
do $$
declare n integer;
begin
 begin
   execute 'select count(*) from public.supplier_products' into n;
   raise exception 'TEST_FAILED: leyó catálogo';
 exception when insufficient_privilege then null;
 end;
 begin
   execute 'update public.organizations set display_name=''Hack CI''';
   raise exception 'TEST_FAILED: modificó empresa';
 exception when insufficient_privilege then null;
 end;
 begin
   execute 'delete from public.organization_members';
   raise exception 'TEST_FAILED: borró membresía';
 exception when insufficient_privilege then null;
 end;
 begin
   execute 'select count(*) from cotironda_private.supplier_contacts' into n;
   raise exception 'TEST_FAILED: leyó contactos';
 exception when insufficient_privilege then null;
 end;
end
$$;
reset role;
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Constructora CI')=1,
 'rol registra empresa');
select ci_helpers.assert_true(
 (select count(*) from public.organization_members where user_id=
 '99999999-1111-4111-8111-111111111111')=1,
 'rol crea miembro');
select ci_helpers.assert_true(
 (select count(*) from public.supplier_profiles where trade_name='Proveedora CI'
   and accepting_quotes=false)=1,
 'rol crea proveedor inicialmente inactivo');
rollback;
