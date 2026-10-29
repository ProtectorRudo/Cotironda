-- Cotironda: esquema declarativo de la Etapa 01 (NO aplicado a ninguna BD).
-- Generar migracion con Supabase CLI una vez habilitado entorno aislado.
-- Ningun permiso de escritura sobre empresas y miembros desde el navegador.

create schema if not exists cotironda_private;
revoke all on schema cotironda_private from public, anon, authenticated;
grant usage on schema cotironda_private to service_role;

create table public.organizations (
 id uuid primary key default gen_random_uuid(),
 display_name text not null check (char_length(btrim(display_name)) between 2 and 160),
 organization_type text not null check (organization_type in ('buyer', 'supplier', 'both')),
 created_at timestamptz not null default now()
);

create table public.organization_members (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 membership_role text not null check (membership_role in ('owner', 'manager', 'member')),
 status text not null default 'active' check (status in ('active', 'suspended')),
 created_at timestamptz not null default now(),
 primary key (organization_id, user_id)
);
create index organization_members_by_user on public.organization_members(user_id, organization_id)
 where status = 'active';

create table public.catalog_categories (
 code text primary key check (code ~ '^[a-z][a-z0-9_]{1,49}$'),
 label text not null check (char_length(btrim(label)) between 3 and 100),
 is_active boolean not null default true
);
insert into public.catalog_categories(code, label) values
 ('corralon', 'Materiales de corralon'),
 ('pintureria', 'Pinturas e impermeabilizantes'),
 ('electricidad', 'Materiales electricos'),
 ('construccion_seco', 'Construccion en seco'),
 ('sanitarios', 'Sanitarios y plomeria')
on conflict (code) do nothing;

create table public.supplier_profiles (
 organization_id uuid primary key references public.organizations(id) on delete cascade,
 trade_name text not null check (char_length(btrim(trade_name)) between 2 and 160),
 accepting_quotes boolean not null default false,
 updated_at timestamptz not null default now()
);

create table public.supplier_categories (
 organization_id uuid not null references public.supplier_profiles(organization_id) on delete cascade,
 category_code text not null references public.catalog_categories(code),
 is_enabled boolean not null default true,
 primary key (organization_id, category_code)
);

create table public.supplier_products (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 category_code text not null,
 product_name text not null check (char_length(btrim(product_name)) between 2 and 250),
 manufacturer text,
 manufacturer_sku text,
 unit_code text not null check (unit_code in ('unit', 'bag', 'box', 'kg', 'g', 'l', 'ml', 'm', 'm2', 'm3', 'roll', 'pack')),
 attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
 source_type text not null default 'manual' check (source_type in ('manual', 'confirmed_import', 'confirmed_quote')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key (organization_id, category_code)
   references public.supplier_categories(organization_id, category_code) on delete restrict
);
create index supplier_products_match_idx
 on public.supplier_products(category_code, organization_id) where is_active = true;

create table public.supplier_delivery_areas (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.supplier_profiles(organization_id) on delete cascade,
 province text not null check (char_length(btrim(province)) between 2 and 100),
 city text not null check (char_length(btrim(city)) between 2 and 100),
 is_enabled boolean not null default true,
 created_at timestamptz not null default now(),
 unique(organization_id, province, city)
);

-- Los numeros de WhatsApp y los consentimientos NO se exponen a la Data API.
create table cotironda_private.supplier_contacts (
 organization_id uuid primary key references public.supplier_profiles(organization_id) on delete cascade,
 whatsapp_e164 text check (whatsapp_e164 ~ '^[+][1-9][0-9]{6,14}$'),
 whatsapp_opt_in_at timestamptz,
 opt_out_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint whatsapp_consent_consistent
   check (whatsapp_opt_in_at is null or whatsapp_e164 is not null)
);
alter table cotironda_private.supplier_contacts enable row level security;
revoke all on cotironda_private.supplier_contacts from public, anon, authenticated;
grant select, insert, update, delete on cotironda_private.supplier_contacts to service_role;

-- Marcas de tiempo del servidor (clientes no pueden falsificarlas).
create function cotironda_private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger supplier_profiles_touch
 before update on public.supplier_profiles for each row
 execute function cotironda_private.touch_updated_at();
create trigger supplier_products_touch
 before update on public.supplier_products for each row
 execute function cotironda_private.touch_updated_at();
create trigger supplier_contacts_touch
 before update on cotironda_private.supplier_contacts for each row
 execute function cotironda_private.touch_updated_at();

-- RLS siempre activa en tablas expuestas.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.catalog_categories enable row level security;
alter table public.supplier_profiles enable row level security;
alter table public.supplier_categories enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_delivery_areas enable row level security;

-- Revocar privilegios por defecto; el rol anon no obtiene acceso.
revoke all on public.organizations, public.organization_members,
 public.catalog_categories, public.supplier_profiles,
 public.supplier_categories, public.supplier_products,
 public.supplier_delivery_areas from PUBLIC, anon, authenticated;

grant select on public.organizations, public.organization_members,
 public.catalog_categories, public.supplier_profiles,
 public.supplier_categories, public.supplier_products,
 public.supplier_delivery_areas to authenticated;
grant update (trade_name, accepting_quotes)
 on public.supplier_profiles to authenticated;
grant insert, delete on public.supplier_categories to authenticated;
grant update (is_enabled) on public.supplier_categories to authenticated;
grant insert, delete on public.supplier_products to authenticated;
grant update (product_name, manufacturer, manufacturer_sku, unit_code,
 attributes, source_type, is_active) on public.supplier_products to authenticated;
grant insert, delete on public.supplier_delivery_areas to authenticated;
grant update (province, city, is_enabled) on public.supplier_delivery_areas to authenticated;

-- Membership SELECT deliberadamente solo propia: evita recursion en otras politicas.
create policy members_read_self on public.organization_members
 for select to authenticated using (user_id = (select auth.uid()));
create policy organizations_read_member on public.organizations
 for select to authenticated using (
   exists (select 1 from public.organization_members m
     where m.organization_id = organizations.id
       and m.user_id = (select auth.uid()) and m.status = 'active')
 );
create policy categories_read_active on public.catalog_categories
 for select to authenticated using (is_active);

create policy supplier_profiles_read_own on public.supplier_profiles
 for select to authenticated using (
   exists (select 1 from public.organization_members m
     where m.organization_id = supplier_profiles.organization_id
       and m.user_id = (select auth.uid()) and m.status = 'active')
 );
create policy supplier_profiles_update_managers on public.supplier_profiles
 for update to authenticated
 using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_profiles.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')))
 with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_profiles.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));

create policy supplier_categories_read_own on public.supplier_categories
 for select to authenticated using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_categories.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'));
create policy supplier_categories_insert_manager on public.supplier_categories
 for insert to authenticated with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_categories.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
create policy supplier_categories_update_manager on public.supplier_categories
 for update to authenticated
 using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_categories.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')))
 with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_categories.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
create policy supplier_categories_delete_manager on public.supplier_categories
 for delete to authenticated using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_categories.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));

create policy supplier_products_read_own on public.supplier_products
 for select to authenticated using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_products.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'));
create policy supplier_products_insert_manager on public.supplier_products
 for insert to authenticated with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_products.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
create policy supplier_products_update_manager on public.supplier_products
 for update to authenticated
 using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_products.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')))
 with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_products.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
create policy supplier_products_delete_manager on public.supplier_products
 for delete to authenticated using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_products.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));

create policy supplier_areas_read_own on public.supplier_delivery_areas
 for select to authenticated using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_delivery_areas.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'));
create policy supplier_areas_insert_manager on public.supplier_delivery_areas
 for insert to authenticated with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_delivery_areas.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
create policy supplier_areas_update_manager on public.supplier_delivery_areas
 for update to authenticated
 using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_delivery_areas.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')))
 with check (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_delivery_areas.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
create policy supplier_areas_delete_manager on public.supplier_delivery_areas
 for delete to authenticated using (exists (select 1 from public.organization_members m
   where m.organization_id = supplier_delivery_areas.organization_id
     and m.user_id = (select auth.uid()) and m.status = 'active'
     and m.membership_role in ('owner','manager')));
