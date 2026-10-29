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


-- Registro de organizaciones: invocación exclusiva desde backend con service_role.
-- El servidor DEBE verificar el token del usuario y obtener p_user_id de Supabase
-- Auth, jamás del cuerpo enviado por el cliente. SECURITY INVOKER: sin bypass implícito.
create table cotironda_private.organization_registration_requests (
 user_id uuid not null references auth.users(id),
 request_id uuid not null,
 organization_id uuid not null unique references public.organizations(id),
 request_payload jsonb not null check (jsonb_typeof(request_payload) = 'object'),
 created_at timestamptz not null default now(),
 primary key(user_id, request_id)
);
alter table cotironda_private.organization_registration_requests enable row level security;
revoke all on cotironda_private.organization_registration_requests from public, anon, authenticated;
grant select, insert on cotironda_private.organization_registration_requests to service_role;

-- Servicio con privilegios mínimos necesarios para la transacción.
grant insert on public.organizations, public.organization_members,
 public.supplier_profiles to service_role;

create function cotironda_private.register_company(
 p_user_id uuid, p_request_id uuid, p_name text, p_type text, p_trade_name text default null
) returns table(organization_id uuid, replay boolean)
language plpgsql security invoker
set search_path = ''
as $$
declare
 v_org uuid;
 v_name text;
 v_trade text;
 v_payload jsonb;
 v_existing jsonb;
begin
 if p_user_id is null or p_request_id is null then
   raise exception 'registro_identificadores_invalidos' using errcode='22023';
 end if;
 v_name := btrim(p_name);
 if v_name is null or length(v_name) < 2 or length(v_name) > 160 then
   raise exception 'nombre_invalido' using errcode='22023';
 end if;
 if p_type is null or p_type not in ('buyer','supplier','both') then
   raise exception 'tipo_invalido' using errcode='22023';
 end if;
 if p_type in ('supplier','both') then
   v_trade := btrim(p_trade_name);
   if v_trade is null or length(v_trade) < 2 or length(v_trade) > 160 then
     raise exception 'nombre_comercial_invalido' using errcode='22023';
   end if;
 elsif p_trade_name is not null then
   raise exception 'nombre_comercial_no_aplica' using errcode='22023';
 end if;
 v_payload := jsonb_build_object('nombre',v_name,'tipo',p_type,'nombreComercial',v_trade);
 -- Serializa reintentos concurrentes con misma pareja actor/request.
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_user_id::text || ':' || p_request_id::text, 0));
 select reg.organization_id, reg.request_payload into v_org, v_existing
   from cotironda_private.organization_registration_requests reg
   where reg.user_id = p_user_id and reg.request_id = p_request_id
   for update;
 if found then
   if v_existing <> v_payload then
     raise exception 'request_id_reutilizado_con_distinto_contenido' using errcode='23505';
   end if;
   return query select v_org, true;
   return;
 end if;
 insert into public.organizations(display_name,organization_type)
 values (v_name,p_type) returning id into v_org;
 insert into public.organization_members(organization_id,user_id,membership_role)
 values (v_org,p_user_id,'owner');
 if p_type in ('supplier','both') then
   insert into public.supplier_profiles(organization_id,trade_name,accepting_quotes)
   values (v_org,v_trade,false);
 end if;
 insert into cotironda_private.organization_registration_requests(
    user_id,request_id,organization_id,request_payload)
 values(p_user_id,p_request_id,v_org,v_payload);
 return query select v_org,false;
end;
$$;
revoke all on function cotironda_private.register_company(uuid,uuid,text,text,text)
 from public, anon, authenticated;
grant execute on function cotironda_private.register_company(uuid,uuid,text,text,text)
 to service_role;
