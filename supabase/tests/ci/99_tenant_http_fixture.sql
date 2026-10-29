-- SOLO GitHub Actions/PostgreSQL efímero. Prohibido ejecutar en Supabase real.
-- Dos proveedores, cuatro cuentas ficticias: propietarios A/B, lector C y suspendido D.
begin;
do $guard$
begin
 if current_database() <> 'cotironda_ci_http'
  or (select enabled from cotironda_private.registration_settings where singleton=true) is distinct from false
  or (select count(*) from auth.users)<>0
  or (select count(*) from auth.sessions)<>0
  or (select count(*) from public.organizations)<>0
  or (select count(*) from cotironda_private.registration_attempt_quotas)<>0
  or (select count(*) from public.supplier_profiles)<>0
  or (select count(*) from public.supplier_products)<>0
 then raise exception 'tenant_http_fixture_requires_isolated_empty_ci'; end if;
end;
$guard$;
insert into auth.users(id,email_confirmed_at,is_anonymous) values
 ('a1111111-1111-4111-8111-111111111111',now(),false),
 ('b2222222-2222-4222-8222-222222222222',now(),false),
 ('c3333333-3333-4333-8333-333333333333',now(),false),
 ('d4444444-4444-4444-8444-444444444444',now(),false);
insert into auth.sessions(id,user_id,not_after) values
 ('f1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111',null),
 ('f2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222',null),
 ('f3333333-3333-4333-8333-333333333333','c3333333-3333-4333-8333-333333333333',null),
 ('f4444444-4444-4444-8444-444444444444','d4444444-4444-4444-8444-444444444444',null);
insert into public.organizations(id,display_name,organization_type) values
 ('11111111-1111-4111-8111-111111111111','Proveedor A de CI','supplier'),
 ('22222222-2222-4222-8222-222222222222','Proveedor B de CI','supplier');
insert into public.organization_members(organization_id,user_id,membership_role,status) values
 ('11111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','owner','active'),
 ('22222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','owner','active'),
 ('11111111-1111-4111-8111-111111111111','c3333333-3333-4333-8333-333333333333','member','active'),
 ('11111111-1111-4111-8111-111111111111','d4444444-4444-4444-8444-444444444444','manager','suspended');
insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes) values
 ('11111111-1111-4111-8111-111111111111','Corralon A CI',false),
 ('22222222-2222-4222-8222-222222222222','Corralon B CI',false);
insert into public.supplier_categories(organization_id,category_code) values
 ('11111111-1111-4111-8111-111111111111','electricidad'),
 ('22222222-2222-4222-8222-222222222222','electricidad');
insert into public.supplier_products(id,organization_id,category_code,product_name,unit_code) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','electricidad','Cable A CI','m'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','electricidad','Cable B CI','m');
insert into public.supplier_delivery_areas(id,organization_id,province,city) values
 ('aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','Buenos Aires','La Plata'),
 ('bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','Buenos Aires','Mar del Plata');
commit;
