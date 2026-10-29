-- Pruebas RLS de dos organizaciones. A ejecutar SOLO en Supabase aislado.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users(id,instance_id,aud,role,email,created_at,updated_at) values
('11111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-a@cotironda.invalid',now(),now()),
('22222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','rls-b@cotironda.invalid',now(),now());
insert into public.organizations(id,display_name,organization_type) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Proveedor A','supplier'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Proveedor B','supplier');
insert into public.organization_members(organization_id,user_id,membership_role) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','owner'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','owner');
insert into public.supplier_profiles(organization_id,trade_name) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Corralon A'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Corralon B');
insert into public.supplier_categories(organization_id,category_code) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','corralon'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','corralon');
insert into public.supplier_products(organization_id,category_code,product_name,unit_code) values
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','corralon','Cemento 50 kg','bag'),
('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','corralon','Cemento 25 kg','bag');

set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((select count(*)::integer from public.organizations),1,'A solo ve su empresa');
select is((select count(*)::integer from public.organization_members),1,'A solo ve su membresia');
select is((select count(*)::integer from public.supplier_profiles),1,'A solo ve su proveedor');
select is((select count(*)::integer from public.supplier_products),1,'A solo ve sus productos');
update public.supplier_profiles set trade_name='Intento ajeno' where organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
update public.supplier_profiles set trade_name='Editado A' where organization_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select trade_name from public.supplier_profiles limit 1),'Editado A','A puede editar su perfil');
select is(has_table_privilege('authenticated','public.organization_members','UPDATE'),false,'sin escalado de rol por API');
select is(has_schema_privilege('authenticated','cotironda_private','USAGE'),false,'contactos privados');

reset role;
select is((select trade_name from public.supplier_profiles
 where organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
 'Corralon B','no se modifica proveedor ajeno');

set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is((select count(*)::integer from public.supplier_products),1,'B solo ve su catalogo');
select * from finish();
rollback;
