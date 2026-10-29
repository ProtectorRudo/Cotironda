-- Tests reales de atomicidad e idempotencia con PostgreSQL 17; datos ficticios.
-- Se aprovecha el bootstrap de roles, esquema y fixtures del job CI.
begin;
insert into auth.users(id) values
 ('55555555-5555-4555-8555-555555555555'),
 ('66666666-6666-4666-8666-666666666666');

select ci_helpers.assert_true(
 not has_function_privilege('authenticated',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'authenticated no puede invocar registro SQL');
select ci_helpers.assert_true(
 has_function_privilege('service_role',
 'cotironda_private.register_company(uuid,uuid,text,text,text)','EXECUTE'),
 'service_role puede ejecutar registro');
select ci_helpers.assert_true(
 not has_table_privilege('authenticated','cotironda_private.organization_registration_requests','SELECT'),
 'cliente no puede leer claves idempotentes');

set local role service_role;

-- Buyer: una organización y miembro, sin perfil proveedor.
select ci_helpers.assert_true(
 (select count(*) from cotironda_private.register_company(
  '55555555-5555-4555-8555-555555555555',
  '11111111-aaaa-4111-8111-111111111111',
  'Constructora Demo','buyer'))=1,'alta buyer produce respuesta');

select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Constructora Demo')=1,
 'empresa buyer creada');
select ci_helpers.assert_true(
 (select count(*) from public.organization_members m
  join public.organizations o on o.id=m.organization_id
  where o.display_name='Constructora Demo'
   and m.user_id='55555555-5555-4555-8555-555555555555' and m.membership_role='owner')=1,
 'usuario designado owner');
select ci_helpers.assert_true(
 (select count(*) from public.supplier_profiles sp
  join public.organizations o on o.id=sp.organization_id
  where o.display_name='Constructora Demo')=0,
 'buyer no crea perfil proveedor');
select ci_helpers.assert_true(
 (select replay from cotironda_private.register_company(
  '55555555-5555-4555-8555-555555555555',
  '11111111-aaaa-4111-8111-111111111111',
  'Constructora Demo','buyer'))=true,
 'reintento idéntico responde replay');
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Constructora Demo')=1,
 'reintento no duplica organización');

-- Un mismo request ID con contenido distinto es rechazado y no escribe.
do $$
begin
  begin
    perform * from cotironda_private.register_company(
      '55555555-5555-4555-8555-555555555555',
      '11111111-aaaa-4111-8111-111111111111','Otra empresa','buyer');
    raise exception 'TEST FAILED: cambio de payload aceptado';
  exception when unique_violation then null;
  end;
end
$$;
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Otra empresa')=0,
 'no escribe datos en reintento distinto');

-- Proveedor nace inactivo.
select ci_helpers.assert_true(
 (select replay from cotironda_private.register_company(
  '66666666-6666-4666-8666-666666666666',
  '22222222-aaaa-4222-8222-222222222222',
  'Comercio Demo','supplier','Corralón Ficticio'))=false,
 'alta proveedor original');
select ci_helpers.assert_true(
 (select count(*) from public.supplier_profiles
   where trade_name='Corralón Ficticio' and accepting_quotes=false)=1,
 'proveedor deshabilitado para cotizaciones');

-- Nombres, tipos y usuario falsos producen errores sin escrituras parciales.
do $$
begin
  begin
    perform * from cotironda_private.register_company(
      '55555555-5555-4555-8555-555555555555',
      '33333333-aaaa-4333-8333-333333333333','Nombre','admin');
    raise exception 'TEST FAILED: rol admin aceptado';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform * from cotironda_private.register_company(
      '77777777-7777-4777-8777-777777777777',
      '44444444-aaaa-4444-8444-444444444444','Extraña','buyer');
    raise exception 'TEST FAILED: usuario inexistente aceptado';
  exception when foreign_key_violation then null;
  end;
end
$$;
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Extraña')=0,
 'FK invalida revierte alta completa');

-- El límite de 5 altas por usuario y día se aplica atómicamente.
do $$
declare idx integer;
begin
 for idx in 1..4 loop
   perform * from cotironda_private.register_company(
     '55555555-5555-4555-8555-555555555555',
     ('00000000-0000-4000-8000-' || lpad(idx::text,12,'0'))::uuid,
     'Constructora Extra ' || idx,'buyer');
 end loop;
 begin
   perform * from cotironda_private.register_company(
     '55555555-5555-4555-8555-555555555555',
     '00000000-0000-4000-8000-000000000006', 'Empresa Sexta','buyer');
   raise exception 'TEST FAILED: falta límite diario';
 exception when raise_exception then
   if sqlerrm='TEST FAILED: falta límite diario' then raise; end if;
   if sqlerrm <> 'limite_registros' then raise; end if;
 end;
end
$$;
select ci_helpers.assert_true(
 (select count(*) from public.organizations where display_name='Empresa Sexta')=0,
 'cuota se aplica sin registros parciales');
-- Los mismos request IDs siguen permitiendo replay aun luego del límite.
select ci_helpers.assert_true(
 (select replay from cotironda_private.register_company(
  '55555555-5555-4555-8555-555555555555',
  '11111111-aaaa-4111-8111-111111111111', 'Constructora Demo','buyer'))=true,
  'replay después de cuota es válido');

reset role;
-- Un JWT autenticado no tiene uso del schema privado ni permisos de alta.
select ci_helpers.assert_true(
 not has_schema_privilege('authenticated','cotironda_private','USAGE'),
 'usuarios no tienen acceso al registro');

rollback;
