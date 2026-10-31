-- MVP-016 / D065: PRIVATE deterministic matching, PostgreSQL 17 CI ONLY.
-- Nothing here sends WhatsApp or opens a round. Category and locality
-- dictionaries are explicit curated records, never inferred from a name.
-- This is a TEST LAB script, NOT a production migration.
create role cotironda_matcher_d065 nologin noinherit nobypassrls;
create role cotironda_match_gateway_d065 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_matcher_d065,cotironda_match_gateway_d065;

-- Internal catalogue owner maps extracted canonical code to business rubro.
-- No matches on product names or manufacturer SKU strings.
create table cotironda_private.item_rubros_d065(
 product_code text primary key check(product_code~'^[a-z][a-z0-9_]{2,49}$'),
 category_code text not null references public.catalog_categories(code)
);
-- MVP-031 / D080. A CATEGORY alone is NOT proof of catalog coverage.
-- Only a private curator can link a concrete supplier-owned product to a
-- curated family, with a snapshot fingerprint. No browser INSERT/UPDATE.
create function cotironda_private.catalog_fingerprint_d080(p_product uuid)
 returns text language sql stable security invoker set search_path='' as $finger$
 select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
  pg_catalog.jsonb_build_object(
   'product_name',p.product_name,'manufacturer',p.manufacturer,
   'manufacturer_sku',p.manufacturer_sku,'unit_code',p.unit_code,
   'attributes',p.attributes,'source_type',p.source_type
  )::text,'UTF8')),'hex')
 from public.supplier_products p where p.id=p_product;
$finger$;
revoke all on function cotironda_private.catalog_fingerprint_d080(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.catalog_fingerprint_d080(uuid)
 to cotironda_matcher_d065;

create table cotironda_private.supplier_catalog_capabilities_d080(
 catalog_product_id uuid primary key references public.supplier_products(id)
  on delete cascade,
 product_code text not null references cotironda_private.item_rubros_d065(product_code)
  on delete restrict,
 fingerprint_sha256 text not null check(fingerprint_sha256~'^[a-f0-9]{64}$'),
 curated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table cotironda_private.supplier_catalog_capabilities_d080 enable row level security;
revoke all on cotironda_private.supplier_catalog_capabilities_d080
 from public,anon,authenticated,service_role,cotironda_app;
grant select on cotironda_private.supplier_catalog_capabilities_d080
 to cotironda_matcher_d065;
create policy d080_catalog_read on cotironda_private.supplier_catalog_capabilities_d080
 for select to cotironda_matcher_d065 using(true);

-- A locality alias only resolves when explicitly assigned province AND city.
-- Ambiguous spellings/unknown locality have no routing; the worker can
-- flag internal review, never pick a province by default.
create table cotironda_private.delivery_localities_d065(
 alias_key text primary key check(alias_key=lower(btrim(alias_key))
   and length(alias_key) between 3 and 65),
 province text not null check(length(province) between 2 and 100),
 city text not null check(length(city) between 2 and 100)
);
create table cotironda_private.round_supplier_lines_d065(
 round_id uuid not null,
 supplier_org_id uuid not null,
 line_no smallint not null,
 category_code text not null references public.catalog_categories(code),
 primary key(round_id,supplier_org_id,line_no),
 foreign key(round_id,supplier_org_id)
  references cotironda_private.round_invites_v1(round_id,supplier_org_id),
 foreign key(round_id,line_no)
  references cotironda_private.round_items_v1(round_id,line_no)
);
create table cotironda_private.round_match_preparations_d065(
 round_id uuid primary key references cotironda_private.rounds_v1(id),
 channel_id text not null check(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 invited smallint not null check(invited between 1 and 10),
 prepared_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table cotironda_private.round_match_preparations_d065 enable row level security;
revoke all on cotironda_private.round_match_preparations_d065
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.round_match_preparations_d065
 to cotironda_matcher_d065;
create policy d065_preparation_select on
 cotironda_private.round_match_preparations_d065
 for select to cotironda_matcher_d065 using(true);
create policy d065_preparation_insert on
 cotironda_private.round_match_preparations_d065
 for insert to cotironda_matcher_d065 with check(true);
create index d065_supplier_lines_idx on
 cotironda_private.round_supplier_lines_d065(supplier_org_id,round_id);
alter table cotironda_private.item_rubros_d065 enable row level security;
alter table cotironda_private.delivery_localities_d065 enable row level security;
alter table cotironda_private.round_supplier_lines_d065 enable row level security;
revoke all on cotironda_private.item_rubros_d065,
 cotironda_private.delivery_localities_d065,
 cotironda_private.round_supplier_lines_d065
 from public,anon,authenticated,service_role,cotironda_app;
grant select on cotironda_private.item_rubros_d065,
 cotironda_private.delivery_localities_d065,
 cotironda_private.round_supplier_lines_d065
 to cotironda_matcher_d065;
grant insert on cotironda_private.round_supplier_lines_d065 to cotironda_matcher_d065;
create policy d065_map_select on cotironda_private.item_rubros_d065
 for select to cotironda_matcher_d065 using(true);
create policy d065_places_select on cotironda_private.delivery_localities_d065
 for select to cotironda_matcher_d065 using(true);
create policy d065_scope_select on cotironda_private.round_supplier_lines_d065
 for select to cotironda_matcher_d065 using(true);
create policy d065_scope_insert on cotironda_private.round_supplier_lines_d065
 for insert to cotironda_matcher_d065 with check(true);

-- Dedicated NOLOGIN matcher can inspect eligible metadata only.
-- No decrypted inbox, no phone, no send job, no offer ledger.
grant select on cotironda_private.rounds_v1,
 cotironda_private.round_items_v1,
 cotironda_private.round_invites_v1,
 cotironda_private.round_requests_d064,
 cotironda_private.whapi_contacts_v1
 to cotironda_matcher_d065;
-- The D024 setup trigger locks the parent round FOR UPDATE.
grant update(status) on cotironda_private.rounds_v1 to cotironda_matcher_d065;
grant insert on cotironda_private.round_invites_v1 to cotironda_matcher_d065;
grant select on public.supplier_profiles,public.supplier_categories,
 public.supplier_delivery_areas,public.supplier_products to cotironda_matcher_d065;
create policy d065_rounds_read on cotironda_private.rounds_v1
 for select to cotironda_matcher_d065 using(true);
create policy d065_rounds_lock on cotironda_private.rounds_v1
 for update to cotironda_matcher_d065 using(true) with check(false);
create policy d065_items_read on cotironda_private.round_items_v1
 for select to cotironda_matcher_d065 using(true);
create policy d065_invites_read on cotironda_private.round_invites_v1
 for select to cotironda_matcher_d065 using(true);
create policy d065_invites_insert on cotironda_private.round_invites_v1
 for insert to cotironda_matcher_d065 with check(true);
create policy d065_requests_read on cotironda_private.round_requests_d064
 for select to cotironda_matcher_d065 using(true);
create policy d065_contacts_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_matcher_d065 using(true);
create policy d065_profiles_read on public.supplier_profiles
 for select to cotironda_matcher_d065 using(true);
create policy d065_categories_read on public.supplier_categories
 for select to cotironda_matcher_d065 using(true);
create policy d065_delivery_read on public.supplier_delivery_areas
 for select to cotironda_matcher_d065 using(true);
create policy d080_products_read on public.supplier_products
 for select to cotironda_matcher_d065 using(true);

create function cotironda_private.prepare_supplier_invites_d065(
 p_round uuid,p_channel text
) returns jsonb
language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_req cotironda_private.round_requests_d064%rowtype;
 v_round cotironda_private.rounds_v1%rowtype;
 v_province text;v_city text;
 v_count int:=0;v_existing int:=0;
 v_lines smallint[];v_supplier uuid;v_line smallint;v_rubro text;
 v_prepared cotironda_private.round_match_preparations_d065%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if p_round is null or p_channel is null or
  p_channel !~ '^[A-Za-z0-9_-]{4,64}$' then
  raise exception 'd065_invalid_input' using errcode='22023';end if;
 -- Transaction-scoped lock also serializes concurrent duplicate callers.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_round::text,0));
 select * into v_round from cotironda_private.rounds_v1 where id=p_round;
 select * into v_req from cotironda_private.round_requests_d064 where round_id=p_round;
 if v_round.id is null or v_req.round_id is null or
  v_req.buyer_org_id<>v_round.buyer_org_id then
  raise exception 'd065_round_not_found' using errcode='42501';end if;
 if v_round.status<>'programada' or v_now>=v_round.ends_at then
  raise exception 'd065_round_not_programmed' using errcode='42501';end if;
 select count(*) into v_existing from cotironda_private.round_invites_v1
  where round_id=p_round;
 if v_existing<>0 then
  select * into v_prepared from cotironda_private.round_match_preparations_d065
    where round_id=p_round;
  if not found or v_prepared.channel_id<>p_channel or
      v_prepared.invited<>v_existing then
   raise exception 'd065_existing_invites_unknown_channel' using errcode='42501';
  end if;
  -- Reject legacy/incomplete/manual invitations without line scope.
  if exists(select 1 from cotironda_private.round_invites_v1 x
    where x.round_id=p_round
    and not exists(select 1 from cotironda_private.round_supplier_lines_d065 l
     where l.round_id=x.round_id and l.supplier_org_id=x.supplier_org_id))
  then raise exception 'd065_existing_invites_without_scope' using errcode='42501';end if;
  return pg_catalog.jsonb_build_object('state','already_prepared',
   'invited',v_existing,'messagesSent',0);
 end if;

 select d.province,d.city into v_province,v_city
 from cotironda_private.delivery_localities_d065 d
 where d.alias_key=lower(pg_catalog.btrim(v_req.delivery_zone));
 if not found then return pg_catalog.jsonb_build_object(
  'state','needs_verified_location','invited',0,'messagesSent',0);end if;
 if exists(select 1 from cotironda_private.round_items_v1 i
    left join cotironda_private.item_rubros_d065 m on m.product_code=i.product_code
    where i.round_id=p_round and m.category_code is null) then
  return pg_catalog.jsonb_build_object(
   'state','needs_catalog_mapping','invited',0,'messagesSent',0);
 end if;
 if not exists(select 1 from cotironda_private.round_items_v1
  where round_id=p_round) then
  raise exception 'd065_empty_round' using errcode='22023';end if;
 -- Prefer more COVERAGE, not cheaper prices; fair deterministic tie break.
 -- Up to 10 invitations per round as already enforced by D024.
 for v_supplier,v_lines in
  select p.organization_id,
   pg_catalog.array_agg(distinct i.line_no order by i.line_no)::smallint[]
  from public.supplier_profiles p
  join public.supplier_categories sc on sc.organization_id=p.organization_id
    and sc.is_enabled=true
  join public.supplier_delivery_areas a on a.organization_id=p.organization_id
    and a.is_enabled=true and lower(pg_catalog.btrim(a.city))=
      lower(pg_catalog.btrim(v_city))
    and lower(pg_catalog.btrim(a.province))=
      lower(pg_catalog.btrim(v_province))
  join cotironda_private.whapi_contacts_v1 c on c.supplier_org_id=p.organization_id
    and c.channel_id=p_channel
    and c.consented_at<=v_now and c.verified_at<=v_now
    and c.opted_out_at is null
  join cotironda_private.round_items_v1 i on i.round_id=p_round
  join cotironda_private.item_rubros_d065 m on m.product_code=i.product_code
    and m.category_code=sc.category_code
  -- At least one CURRENT active concrete catalog product must be curated for
  -- this family and owned by THIS supplier. Changed product attributes or
  -- names invalidate the proof, without sending old scoped packets.
  where p.accepting_quotes=true and p.organization_id<>v_round.buyer_org_id
    and exists(
     select 1 from public.supplier_products prod
     join cotironda_private.supplier_catalog_capabilities_d080 cap
       on cap.catalog_product_id=prod.id and cap.product_code=i.product_code
     where prod.organization_id=p.organization_id
       and prod.category_code=sc.category_code and prod.is_active=true
       and cap.fingerprint_sha256=
         cotironda_private.catalog_fingerprint_d080(prod.id)
    )
  group by p.organization_id
  order by cardinality(pg_catalog.array_agg(distinct i.line_no
    order by i.line_no)) desc,p.organization_id
  limit 10
 loop
  v_count:=v_count+1;
  insert into cotironda_private.round_invites_v1
    (round_id,supplier_org_id,anon_id,invite_position)
  values(p_round,v_supplier,'anon_proveedor_'||lpad(v_count::text,2,'0'),
   v_count::smallint);
  foreach v_line in array v_lines loop
   select m.category_code into v_rubro
   from cotironda_private.round_items_v1 i
   join cotironda_private.item_rubros_d065 m on m.product_code=i.product_code
   where i.round_id=p_round and i.line_no=v_line;
   insert into cotironda_private.round_supplier_lines_d065
    (round_id,supplier_org_id,line_no,category_code)
   values(p_round,v_supplier,v_line,v_rubro);
  end loop;
 end loop;
 if v_count>0 then
  insert into cotironda_private.round_match_preparations_d065
   (round_id,channel_id,invited) values(p_round,p_channel,v_count);
 end if;
 return pg_catalog.jsonb_build_object(
   'state',case when v_count>0 then 'prepared' else 'no_eligible_suppliers' end,
   'invited',v_count,'messagesSent',0);
end;$fn$;
-- Security-definer owner can never write the provider's offer or read messages.
grant create on schema cotironda_private to cotironda_matcher_d065;
grant cotironda_matcher_d065 to postgres with set true,inherit false;
alter function cotironda_private.prepare_supplier_invites_d065(uuid,text)
 owner to cotironda_matcher_d065;
revoke cotironda_matcher_d065 from postgres;
revoke create on schema cotironda_private from cotironda_matcher_d065;
revoke all on function cotironda_private.prepare_supplier_invites_d065(uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.prepare_supplier_invites_d065(uuid,text)
 to cotironda_match_gateway_d065;
comment on function cotironda_private.prepare_supplier_invites_d065(uuid,text)
 is 'MVP016 server-only: match declared rubro, locality+province and consent; zero WhatsApp sends';
