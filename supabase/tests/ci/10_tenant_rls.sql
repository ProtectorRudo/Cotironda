-- Test end-to-end de permisos SQL usando PostgreSQL 17 real y datos ficticios.
-- Es una emulación de auth.uid() y NO reemplaza Supabase Auth/SSR real.
begin;

insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444');

insert into public.organizations(id,display_name,organization_type) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Proveedor A','supplier'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Proveedor B','supplier');
insert into public.organization_members(organization_id,user_id,membership_role,status) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner','active'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner','active'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','33333333-3333-4333-8333-333333333333','member','suspended'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','44444444-4444-4444-8444-444444444444','member','active');

insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Corralón A',false),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Corralón B',false);
insert into public.supplier_categories(organization_id,category_code) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','corralon'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','corralon');
insert into public.supplier_products(organization_id,category_code,product_name,unit_code) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','corralon','Cemento 50 kg','bag'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','corralon','Cemento 25 kg','bag');
insert into public.supplier_delivery_areas(organization_id,province,city) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Buenos Aires','La Plata'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Buenos Aires','Berisso');

-- Control de privilegios estructurales (el cliente no se concede roles).
select ci_helpers.assert_true(not has_table_privilege('anon','public.organizations','SELECT'),
    'anon no puede leer organizaciones');
select ci_helpers.assert_true(not has_table_privilege('authenticated','public.organization_members','INSERT'),
    'usuario no puede otorgarse membresía');
select ci_helpers.assert_true(not has_table_privilege('authenticated','public.organization_members','UPDATE'),
    'usuario no puede ascenderse de rol');
select ci_helpers.assert_true(not has_schema_privilege('authenticated','cotironda_private','USAGE'),
    'sin acceso al esquema privado');
select ci_helpers.assert_true(not has_table_privilege('authenticated','public.organizations','INSERT'),
    'empresas se crean solo desde backend autorizado');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select ci_helpers.assert_true((select count(*) from public.organizations) = 1,'A solo ve su empresa');
select ci_helpers.assert_true((select count(*) from public.organization_members) = 1,'A solo ve su membresía');
select ci_helpers.assert_true((select count(*) from public.supplier_profiles) = 1,'A solo ve su perfil');
select ci_helpers.assert_true((select count(*) from public.supplier_products) = 1,'A solo ve sus productos');
select ci_helpers.assert_true((select count(*) from public.supplier_categories) = 1,'A solo ve sus categorías');
select ci_helpers.assert_true((select count(*) from public.supplier_delivery_areas) = 1,'A solo ve sus zonas');

-- Edición de su propia empresa sí, ajena no; cambios intentados no se propagan.
update public.supplier_profiles set trade_name='Actualizado A'
 where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select ci_helpers.assert_true(
 (select trade_name from public.supplier_profiles)='Actualizado A','A puede editar su perfil');
do $$
declare updated integer;
begin
  update public.supplier_profiles set trade_name='Ataque B'
  where organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'TEST FAILED: A pudo editar B'; end if;
end
$$;

-- No puede insertar catálogos para una empresa distinta aunque conozca su UUID.
do $$
begin
  begin
    insert into public.supplier_products(organization_id,category_code,product_name,unit_code)
      values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','corralon','Ataque B','bag');
    raise exception 'TEST FAILED: A pudo insertar productos de B';
  exception
    when insufficient_privilege then null;
  end;
end
$$;

insert into public.supplier_products(organization_id,category_code,product_name,unit_code)
  values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','corralon','Cal','bag');
select ci_helpers.assert_true((select count(*) from public.supplier_products)=2,
  'A puede añadir producto propio');

-- Usuario B, distinto JWT.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select ci_helpers.assert_true((select count(*) from public.supplier_products)=1,
  'B sólo ve sus productos');
select ci_helpers.assert_true((select trade_name from public.supplier_profiles)='Corralón B',
  'B no vio cambio no autorizado');
select ci_helpers.assert_true((select count(*) from public.supplier_delivery_areas)=1,
  'B solo ve su zona');

-- Miembro suspendido: sin acceso a datos de negocio.
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select ci_helpers.assert_true((select count(*) from public.organizations)=0,
  'suspendido no ve empresas');
select ci_helpers.assert_true((select count(*) from public.supplier_products)=0,
  'suspendido no ve catálogo');
select ci_helpers.assert_true((select count(*) from public.supplier_profiles)=0,
  'suspendido no ve proveedor');

-- Miembro activo pero sin rol de gerente: lee, pero no edita.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select ci_helpers.assert_true((select count(*) from public.supplier_products)=2,
  'member activo lee catálogo propio');
do $$
declare updated integer;
begin
  update public.supplier_profiles set trade_name='Ataque de member'
  where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  get diagnostics updated = row_count;
  if updated <> 0 then raise exception 'TEST FAILED: member editó perfil'; end if;
end
$$;
do $$
begin
  begin
    insert into public.supplier_products(organization_id,category_code,product_name,unit_code)
      values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','corralon','Ataque interno','bag');
    raise exception 'TEST FAILED: member añadió producto';
  exception when insufficient_privilege then null;
  end;
end
$$;

-- Sin JWT: sin datos de negocio aun con el rol authenticated.
select set_config('request.jwt.claim.sub', '', true);
select ci_helpers.assert_true((select count(*) from public.supplier_products)=0,
  'JWT ausente no ve catálogo');

reset role;
-- Verificar persistencia de la empresa B luego del ataque.
select ci_helpers.assert_true((select trade_name from public.supplier_profiles
 where organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')='Corralón B',
 'Proveedor B no modificado');

set local role anon;
select ci_helpers.assert_true(not has_table_privilege('anon','public.supplier_products','SELECT'),
  'anon no puede leer productos');

rollback;
