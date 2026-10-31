-- D024 / Issue #147: estructura privada de rondas (NO migración oficial, NO instalar en DEV).
-- Sólo esqueleto, sin API, funciones públicas, Service Role DML ni envío real.
-- Ejecutar en PostgreSQL CI posterior a migraciones 1-12. No cambiar sus 12 entradas.
create schema if not exists cotironda_private;

create table cotironda_private.rounds_v1 (
  id uuid primary key default gen_random_uuid(),
  buyer_org_id uuid not null references public.organizations(id) on delete restrict,
  status text not null default 'programada'
    check(status in ('programada','abierta','cerrada','cancelada')),
  begins_at timestamptz not null,
  ends_at timestamptz not null,
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint round_window_v1 check(ends_at>begins_at and
    ends_at<=begins_at+interval '30 days'),
  constraint round_status_timestamps_v1 check(
    (status='programada' and opened_at is null and closed_at is null)
    or (status='abierta' and opened_at is not null and closed_at is null)
    or (status='cerrada' and opened_at is not null and closed_at is not null
        and closed_at>=ends_at)
    or (status='cancelada' and closed_at is not null and closed_at<ends_at))
);

-- El reloj lo controla PostgreSQL: no se aceptan cambios arbitrarios de estado.
-- Cada operación futura debe pasar por una RPC server-only transaccional.
create function cotironda_private.guard_round_transition_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_now timestamptz:=clock_timestamp();
begin
 if tg_op='INSERT' then
   if new.status<>'programada' or new.opened_at is not null
      or new.closed_at is not null then
     raise exception 'round_must_begin_programmed'; end if;
   return new;
 end if;
 if new.id<>old.id or new.buyer_org_id<>old.buyer_org_id
    or new.begins_at<>old.begins_at or new.ends_at<>old.ends_at
    or new.created_at<>old.created_at then
   raise exception 'round_identity_immutable'; end if;
 if old.status='programada' and new.status='abierta'
    and v_now>=old.begins_at and v_now<old.ends_at then
    new.opened_at:=v_now;new.closed_at:=null;
 elsif old.status='abierta' and new.status='cerrada'
    and v_now>=old.ends_at then
    new.opened_at:=old.opened_at;new.closed_at:=v_now;
 elsif old.status in ('programada','abierta') and new.status='cancelada'
    and v_now<old.ends_at then
    new.opened_at:=old.opened_at;new.closed_at:=v_now;
 else
    raise exception 'round_transition_not_allowed';
 end if;
 return new;
end;
$fn$;
create trigger round_transition_v1
  before insert or update on cotironda_private.rounds_v1
  for each row execute function cotironda_private.guard_round_transition_v1();

create table cotironda_private.round_items_v1 (
  round_id uuid not null references cotironda_private.rounds_v1(id) on delete restrict,
  line_no smallint not null check(line_no between 1 and 8),
  product_code text not null check(product_code ~ '^[a-z][a-z0-9_]{2,49}
  unit text not null check(unit in
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')),
  primary key(round_id,line_no)
);

create table cotironda_private.round_invites_v1 (
  round_id uuid not null references cotironda_private.rounds_v1(id) on delete restrict,
  supplier_org_id uuid not null references public.supplier_profiles(organization_id)
    on delete restrict,
  anon_id text not null check(anon_id ~ '^anon_[a-z0-9_]{3,45}$'),
  invite_position smallint not null check(invite_position between 1 and 10),
  created_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id),
  unique(round_id,anon_id),
  unique(round_id,invite_position)
);
create index round_invites_supplier_v1_idx
  on cotironda_private.round_invites_v1(supplier_org_id,round_id);

-- Snapshot económico: no acepta texto libre, teléfonos, contactos ni equivalencia
-- técnica autodeclarada. Los campos permitidos son estrictos.
-- Objeto de línea: line_no(int), unit(text), available_qty(decimal string),
-- net_unit_price(decimal string o null), vat_rate('0','10.5','21' o null).
create function cotironda_private.check_quote_lines_v1(p_lines jsonb,p_round uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $fn$
declare
  v_line jsonb;
  v_lineno integer;
  v_seen int[]:=array[]::int[];
  v_text text;
begin
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1
     or jsonb_array_length(p_lines)>8 then return false; end if;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line)<>'object'
      or (select count(*) from jsonb_object_keys(v_line))<>5
      or not (v_line ?& array['line_no','unit','available_qty','net_unit_price','vat_rate'])
      or jsonb_typeof(v_line->'line_no')<>'number'
      or (v_line->>'line_no') !~ '^[1-8]$'
      or jsonb_typeof(v_line->'unit')<>'string'
      or (v_line->>'unit') not in
        ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
      or jsonb_typeof(v_line->'available_qty')<>'string'
      or (v_line->>'available_qty') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$'
      or (v_line->>'available_qty')::numeric<=0
      or (jsonb_typeof(v_line->'net_unit_price') not in ('null','string'))
      or (jsonb_typeof(v_line->'net_unit_price')='string'
         and (v_line->>'net_unit_price') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$')
      or (jsonb_typeof(v_line->'vat_rate') not in ('null','string'))
      or (jsonb_typeof(v_line->'vat_rate')='string'
         and (v_line->>'vat_rate') not in ('0','10.5','21'))
    then return false; end if;
    v_lineno:=(v_line->>'line_no')::integer;
    if v_lineno=any(v_seen) or not exists(
      select 1 from cotironda_private.round_items_v1 i
      where i.round_id=p_round and i.line_no=v_lineno
    ) then return false; end if;
    v_seen:=array_append(v_seen,v_lineno);
  end loop;
  return true;
exception when others then
  return false;
end;
$fn$;

-- Una ronda abierta congela el pedido y la lista de invitaciones.
create function cotironda_private.guard_round_setup_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_id uuid; v_status text;
begin
 v_id:=case when tg_op='DELETE' then old.round_id else new.round_id end;
 select status into v_status from cotironda_private.rounds_v1 where id=v_id for update;
 if v_status is distinct from 'programada' then
   raise exception 'round_setup_is_frozen'; end if;
 if tg_op='UPDATE' and old.round_id<>new.round_id then
   raise exception 'round_setup_round_id_immutable'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$fn$;
create trigger round_items_setup_v1
 before insert or update or delete on cotironda_private.round_items_v1
 for each row execute function cotironda_private.guard_round_setup_v1();
create trigger round_invites_setup_v1
 before insert or update or delete on cotironda_private.round_invites_v1
 for each row execute function cotironda_private.guard_round_setup_v1();

create table cotironda_private.offer_drafts_v1 (
  round_id uuid not null,
  supplier_org_id uuid not null,
  revision integer not null default 1 check(revision>0),
  currency text not null check(currency in ('ARS','USD')),
  payment_method text check(payment_method in
    ('contado','transferencia','cuenta_corriente_30_dias')),
  lead_days smallint check(lead_days between 0 and 120),
  freight_gross numeric(18,2) check(freight_gross>=0),
  min_goods_gross numeric(18,2) check(min_goods_gross>=0),
  lines_snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict,
  check(cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
);

create table cotironda_private.offer_events_v1 (
  round_id uuid not null,
  event_id uuid not null,
  supplier_org_id uuid not null,
  event_kind text not null check(event_kind in ('draft_saved','offer_confirmed')),
  revision integer not null check(revision>0),
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key(round_id,event_id),
  unique(round_id,supplier_org_id,event_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict
);

-- Los eventos de proveedor tampoco se pueden registrar después del cierre,
-- ni antes de abrir. Este control no sustituye autenticar al actor que los envía.
create function cotironda_private.guard_offer_event_insert_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_status text; v_start timestamptz; v_end timestamptz;
begin
 select status,begins_at,ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 where id=new.round_id for update;
 if v_status is distinct from 'abierta'
    or clock_timestamp()<v_start or clock_timestamp()>=v_end then
   raise exception 'offer_event_outside_round_window'; end if;
 if not exists (
   select 1 from cotironda_private.offer_drafts_v1 d
   where d.round_id=new.round_id and d.supplier_org_id=new.supplier_org_id
     and d.revision=new.revision
 ) then raise exception 'offer_event_revision_missing'; end if;
 return new;
end;
$fn$;
create trigger offer_event_insert_v1
 before insert on cotironda_private.offer_events_v1
 for each row execute function cotironda_private.guard_offer_event_insert_v1();

create table cotironda_private.offer_versions_v1 (
  round_id uuid not null,
  supplier_org_id uuid not null,
  version integer not null check(version>0),
  draft_revision integer not null check(draft_revision>0),
  confirmation_event_id uuid not null,
  currency text not null check(currency in ('ARS','USD')),
  payment_method text check(payment_method in
    ('contado','transferencia','cuenta_corriente_30_dias')),
  lead_days smallint check(lead_days between 0 and 120),
  freight_gross numeric(18,2) check(freight_gross>=0),
  min_goods_gross numeric(18,2) check(min_goods_gross>=0),
  lines_snapshot jsonb not null,
  confirmed_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id,version),
  unique(round_id,supplier_org_id,draft_revision),
  unique(round_id,confirmation_event_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict,
  foreign key(round_id,supplier_org_id,confirmation_event_id)
    references cotironda_private.offer_events_v1(round_id,supplier_org_id,event_id)
    on delete restrict,
  check(cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
);

-- No confiar en version/evento autodeclarado: se revisan al insertar.
create function cotironda_private.guard_offer_version_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare
 v_d cotironda_private.offer_drafts_v1%rowtype;
 v_kind text;
 v_event_revision integer;
 v_status text;
 v_start timestamptz;
 v_end timestamptz;
 v_last integer;
begin
 select r.status,r.begins_at,r.ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 r where r.id=new.round_id
 for update; -- serializa confirmaciones de toda la ronda (en CI y futuro backend).
 if v_status is distinct from 'abierta' or
    clock_timestamp()<v_start or clock_timestamp()>=v_end then
  raise exception 'quote_confirmation_round_not_open'; end if;
 select * into v_d from cotironda_private.offer_drafts_v1 d
  where d.round_id=new.round_id and d.supplier_org_id=new.supplier_org_id;
 if not found or v_d.revision<>new.draft_revision
  or v_d.currency<>new.currency
  or v_d.payment_method is distinct from new.payment_method
  or v_d.lead_days is distinct from new.lead_days
  or v_d.freight_gross is distinct from new.freight_gross
  or v_d.min_goods_gross is distinct from new.min_goods_gross
  or v_d.lines_snapshot<>new.lines_snapshot then
  raise exception 'quote_confirmation_draft_mismatch'; end if;
 select e.event_kind,e.revision into v_kind,v_event_revision
 from cotironda_private.offer_events_v1 e
 where e.round_id=new.round_id and e.supplier_org_id=new.supplier_org_id
   and e.event_id=new.confirmation_event_id;
 if v_kind is distinct from 'offer_confirmed'
   or v_event_revision<>new.draft_revision then
   raise exception 'quote_confirmation_event_invalid'; end if;
 select coalesce(max(version),0) into v_last
 from cotironda_private.offer_versions_v1 v
 where v.round_id=new.round_id and v.supplier_org_id=new.supplier_org_id;
 if new.version<>v_last+1 then raise exception 'quote_version_out_of_sequence'; end if;
 return new;
end;
$fn$;
create trigger guard_offer_version_insert_v1
  before insert on cotironda_private.offer_versions_v1
  for each row execute function cotironda_private.guard_offer_version_v1();

create function cotironda_private.guard_draft_revision_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_status text; v_start timestamptz; v_end timestamptz;
begin
 select status,begins_at,ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 where id=new.round_id for update;
 if v_status is distinct from 'abierta' or
    clock_timestamp()<v_start or clock_timestamp()>=v_end then
   raise exception 'quote_draft_round_not_open'; end if;
 if tg_op='INSERT' and new.revision<>1 then
   raise exception 'quote_draft_initial_revision_invalid'; end if;
 if tg_op='UPDATE' and
   (new.round_id<>old.round_id or new.supplier_org_id<>old.supplier_org_id
    or new.revision<>old.revision+1) then
   raise exception 'quote_draft_revision_invalid'; end if;
 new.updated_at:=now();
 return new;
end;
$fn$;
create trigger guard_offer_draft_v1
  before insert or update on cotironda_private.offer_drafts_v1
  for each row execute function cotironda_private.guard_draft_revision_v1();

create function cotironda_private.reject_immutable_quote_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 raise exception 'confirmed_offer_and_event_are_immutable';
end;
$fn$;
create trigger quote_versions_immutable_v1
  before update or delete on cotironda_private.offer_versions_v1
  for each row execute function cotironda_private.reject_immutable_quote_v1();
create trigger quote_events_immutable_v1
  before update or delete on cotironda_private.offer_events_v1
  for each row execute function cotironda_private.reject_immutable_quote_v1();

-- Todas las tablas son server-only, no se publica Data API ni WebSocket.
alter table cotironda_private.rounds_v1 enable row level security;
alter table cotironda_private.round_items_v1 enable row level security;
alter table cotironda_private.round_invites_v1 enable row level security;
alter table cotironda_private.offer_drafts_v1 enable row level security;
alter table cotironda_private.offer_events_v1 enable row level security;
alter table cotironda_private.offer_versions_v1 enable row level security;
revoke all on cotironda_private.rounds_v1,
 cotironda_private.round_items_v1, cotironda_private.round_invites_v1,
 cotironda_private.offer_drafts_v1, cotironda_private.offer_events_v1,
 cotironda_private.offer_versions_v1 from public, anon, authenticated, service_role;
revoke all on function cotironda_private.check_quote_lines_v1(jsonb,uuid),
 cotironda_private.guard_offer_version_v1(),
 cotironda_private.guard_draft_revision_v1(),
 cotironda_private.reject_immutable_quote_v1(),
 cotironda_private.guard_round_transition_v1(),
 cotironda_private.guard_round_setup_v1(),
 cotironda_private.guard_offer_event_insert_v1()
 from public, anon, authenticated, service_role;
-- Sin policies: RLS cierra acceso; solo owner/postgres podrá probarlo.
comment on table cotironda_private.offer_versions_v1 is
 'D024 estructura CI: oferta confirmada inmutable, NO API ni aceptación comercial.';
),
  -- MVP-028: keep the technical description literally requested by the
  -- buyer. NULL only for historical/CI synthetic rounds, not new UI.
  source_description text check(
    char_length(source_description) between 3 and 90
    and source_description ~ '^[[:alnum:] ÁÉÍÓÚÜÑáéíóúüñ.,()/+²³-]+
  unit text not null check(unit in
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')),
  primary key(round_id,line_no)
);

create table cotironda_private.round_invites_v1 (
  round_id uuid not null references cotironda_private.rounds_v1(id) on delete restrict,
  supplier_org_id uuid not null references public.supplier_profiles(organization_id)
    on delete restrict,
  anon_id text not null check(anon_id ~ '^anon_[a-z0-9_]{3,45}$'),
  invite_position smallint not null check(invite_position between 1 and 10),
  created_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id),
  unique(round_id,anon_id),
  unique(round_id,invite_position)
);
create index round_invites_supplier_v1_idx
  on cotironda_private.round_invites_v1(supplier_org_id,round_id);

-- Snapshot económico: no acepta texto libre, teléfonos, contactos ni equivalencia
-- técnica autodeclarada. Los campos permitidos son estrictos.
-- Objeto de línea: line_no(int), unit(text), available_qty(decimal string),
-- net_unit_price(decimal string o null), vat_rate('0','10.5','21' o null).
create function cotironda_private.check_quote_lines_v1(p_lines jsonb,p_round uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $fn$
declare
  v_line jsonb;
  v_lineno integer;
  v_seen int[]:=array[]::int[];
  v_text text;
begin
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1
     or jsonb_array_length(p_lines)>8 then return false; end if;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line)<>'object'
      or (select count(*) from jsonb_object_keys(v_line))<>5
      or not (v_line ?& array['line_no','unit','available_qty','net_unit_price','vat_rate'])
      or jsonb_typeof(v_line->'line_no')<>'number'
      or (v_line->>'line_no') !~ '^[1-8]$'
      or jsonb_typeof(v_line->'unit')<>'string'
      or (v_line->>'unit') not in
        ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
      or jsonb_typeof(v_line->'available_qty')<>'string'
      or (v_line->>'available_qty') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$'
      or (v_line->>'available_qty')::numeric<=0
      or (jsonb_typeof(v_line->'net_unit_price') not in ('null','string'))
      or (jsonb_typeof(v_line->'net_unit_price')='string'
         and (v_line->>'net_unit_price') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$')
      or (jsonb_typeof(v_line->'vat_rate') not in ('null','string'))
      or (jsonb_typeof(v_line->'vat_rate')='string'
         and (v_line->>'vat_rate') not in ('0','10.5','21'))
    then return false; end if;
    v_lineno:=(v_line->>'line_no')::integer;
    if v_lineno=any(v_seen) or not exists(
      select 1 from cotironda_private.round_items_v1 i
      where i.round_id=p_round and i.line_no=v_lineno
    ) then return false; end if;
    v_seen:=array_append(v_seen,v_lineno);
  end loop;
  return true;
exception when others then
  return false;
end;
$fn$;

-- Una ronda abierta congela el pedido y la lista de invitaciones.
create function cotironda_private.guard_round_setup_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_id uuid; v_status text;
begin
 v_id:=case when tg_op='DELETE' then old.round_id else new.round_id end;
 select status into v_status from cotironda_private.rounds_v1 where id=v_id for update;
 if v_status is distinct from 'programada' then
   raise exception 'round_setup_is_frozen'; end if;
 if tg_op='UPDATE' and old.round_id<>new.round_id then
   raise exception 'round_setup_round_id_immutable'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$fn$;
create trigger round_items_setup_v1
 before insert or update or delete on cotironda_private.round_items_v1
 for each row execute function cotironda_private.guard_round_setup_v1();
create trigger round_invites_setup_v1
 before insert or update or delete on cotironda_private.round_invites_v1
 for each row execute function cotironda_private.guard_round_setup_v1();

create table cotironda_private.offer_drafts_v1 (
  round_id uuid not null,
  supplier_org_id uuid not null,
  revision integer not null default 1 check(revision>0),
  currency text not null check(currency in ('ARS','USD')),
  payment_method text check(payment_method in
    ('contado','transferencia','cuenta_corriente_30_dias')),
  lead_days smallint check(lead_days between 0 and 120),
  freight_gross numeric(18,2) check(freight_gross>=0),
  min_goods_gross numeric(18,2) check(min_goods_gross>=0),
  lines_snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict,
  check(cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
);

create table cotironda_private.offer_events_v1 (
  round_id uuid not null,
  event_id uuid not null,
  supplier_org_id uuid not null,
  event_kind text not null check(event_kind in ('draft_saved','offer_confirmed')),
  revision integer not null check(revision>0),
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key(round_id,event_id),
  unique(round_id,supplier_org_id,event_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict
);

-- Los eventos de proveedor tampoco se pueden registrar después del cierre,
-- ni antes de abrir. Este control no sustituye autenticar al actor que los envía.
create function cotironda_private.guard_offer_event_insert_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_status text; v_start timestamptz; v_end timestamptz;
begin
 select status,begins_at,ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 where id=new.round_id for update;
 if v_status is distinct from 'abierta'
    or clock_timestamp()<v_start or clock_timestamp()>=v_end then
   raise exception 'offer_event_outside_round_window'; end if;
 if not exists (
   select 1 from cotironda_private.offer_drafts_v1 d
   where d.round_id=new.round_id and d.supplier_org_id=new.supplier_org_id
     and d.revision=new.revision
 ) then raise exception 'offer_event_revision_missing'; end if;
 return new;
end;
$fn$;
create trigger offer_event_insert_v1
 before insert on cotironda_private.offer_events_v1
 for each row execute function cotironda_private.guard_offer_event_insert_v1();

create table cotironda_private.offer_versions_v1 (
  round_id uuid not null,
  supplier_org_id uuid not null,
  version integer not null check(version>0),
  draft_revision integer not null check(draft_revision>0),
  confirmation_event_id uuid not null,
  currency text not null check(currency in ('ARS','USD')),
  payment_method text check(payment_method in
    ('contado','transferencia','cuenta_corriente_30_dias')),
  lead_days smallint check(lead_days between 0 and 120),
  freight_gross numeric(18,2) check(freight_gross>=0),
  min_goods_gross numeric(18,2) check(min_goods_gross>=0),
  lines_snapshot jsonb not null,
  confirmed_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id,version),
  unique(round_id,supplier_org_id,draft_revision),
  unique(round_id,confirmation_event_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict,
  foreign key(round_id,supplier_org_id,confirmation_event_id)
    references cotironda_private.offer_events_v1(round_id,supplier_org_id,event_id)
    on delete restrict,
  check(cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
);

-- No confiar en version/evento autodeclarado: se revisan al insertar.
create function cotironda_private.guard_offer_version_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare
 v_d cotironda_private.offer_drafts_v1%rowtype;
 v_kind text;
 v_event_revision integer;
 v_status text;
 v_start timestamptz;
 v_end timestamptz;
 v_last integer;
begin
 select r.status,r.begins_at,r.ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 r where r.id=new.round_id
 for update; -- serializa confirmaciones de toda la ronda (en CI y futuro backend).
 if v_status is distinct from 'abierta' or
    clock_timestamp()<v_start or clock_timestamp()>=v_end then
  raise exception 'quote_confirmation_round_not_open'; end if;
 select * into v_d from cotironda_private.offer_drafts_v1 d
  where d.round_id=new.round_id and d.supplier_org_id=new.supplier_org_id;
 if not found or v_d.revision<>new.draft_revision
  or v_d.currency<>new.currency
  or v_d.payment_method is distinct from new.payment_method
  or v_d.lead_days is distinct from new.lead_days
  or v_d.freight_gross is distinct from new.freight_gross
  or v_d.min_goods_gross is distinct from new.min_goods_gross
  or v_d.lines_snapshot<>new.lines_snapshot then
  raise exception 'quote_confirmation_draft_mismatch'; end if;
 select e.event_kind,e.revision into v_kind,v_event_revision
 from cotironda_private.offer_events_v1 e
 where e.round_id=new.round_id and e.supplier_org_id=new.supplier_org_id
   and e.event_id=new.confirmation_event_id;
 if v_kind is distinct from 'offer_confirmed'
   or v_event_revision<>new.draft_revision then
   raise exception 'quote_confirmation_event_invalid'; end if;
 select coalesce(max(version),0) into v_last
 from cotironda_private.offer_versions_v1 v
 where v.round_id=new.round_id and v.supplier_org_id=new.supplier_org_id;
 if new.version<>v_last+1 then raise exception 'quote_version_out_of_sequence'; end if;
 return new;
end;
$fn$;
create trigger guard_offer_version_insert_v1
  before insert on cotironda_private.offer_versions_v1
  for each row execute function cotironda_private.guard_offer_version_v1();

create function cotironda_private.guard_draft_revision_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_status text; v_start timestamptz; v_end timestamptz;
begin
 select status,begins_at,ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 where id=new.round_id for update;
 if v_status is distinct from 'abierta' or
    clock_timestamp()<v_start or clock_timestamp()>=v_end then
   raise exception 'quote_draft_round_not_open'; end if;
 if tg_op='INSERT' and new.revision<>1 then
   raise exception 'quote_draft_initial_revision_invalid'; end if;
 if tg_op='UPDATE' and
   (new.round_id<>old.round_id or new.supplier_org_id<>old.supplier_org_id
    or new.revision<>old.revision+1) then
   raise exception 'quote_draft_revision_invalid'; end if;
 new.updated_at:=now();
 return new;
end;
$fn$;
create trigger guard_offer_draft_v1
  before insert or update on cotironda_private.offer_drafts_v1
  for each row execute function cotironda_private.guard_draft_revision_v1();

create function cotironda_private.reject_immutable_quote_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 raise exception 'confirmed_offer_and_event_are_immutable';
end;
$fn$;
create trigger quote_versions_immutable_v1
  before update or delete on cotironda_private.offer_versions_v1
  for each row execute function cotironda_private.reject_immutable_quote_v1();
create trigger quote_events_immutable_v1
  before update or delete on cotironda_private.offer_events_v1
  for each row execute function cotironda_private.reject_immutable_quote_v1();

-- Todas las tablas son server-only, no se publica Data API ni WebSocket.
alter table cotironda_private.rounds_v1 enable row level security;
alter table cotironda_private.round_items_v1 enable row level security;
alter table cotironda_private.round_invites_v1 enable row level security;
alter table cotironda_private.offer_drafts_v1 enable row level security;
alter table cotironda_private.offer_events_v1 enable row level security;
alter table cotironda_private.offer_versions_v1 enable row level security;
revoke all on cotironda_private.rounds_v1,
 cotironda_private.round_items_v1, cotironda_private.round_invites_v1,
 cotironda_private.offer_drafts_v1, cotironda_private.offer_events_v1,
 cotironda_private.offer_versions_v1 from public, anon, authenticated, service_role;
revoke all on function cotironda_private.check_quote_lines_v1(jsonb,uuid),
 cotironda_private.guard_offer_version_v1(),
 cotironda_private.guard_draft_revision_v1(),
 cotironda_private.reject_immutable_quote_v1(),
 cotironda_private.guard_round_transition_v1(),
 cotironda_private.guard_round_setup_v1(),
 cotironda_private.guard_offer_event_insert_v1()
 from public, anon, authenticated, service_role;
-- Sin policies: RLS cierra acceso; solo owner/postgres podrá probarlo.
comment on table cotironda_private.offer_versions_v1 is
 'D024 estructura CI: oferta confirmada inmutable, NO API ni aceptación comercial.';

    and source_description !~* '(https?://|www[.]|[0-9]{10,})'
  ),
  quantity numeric(18,3) not null check(quantity>0),
  unit text not null check(unit in
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')),
  primary key(round_id,line_no)
);

create table cotironda_private.round_invites_v1 (
  round_id uuid not null references cotironda_private.rounds_v1(id) on delete restrict,
  supplier_org_id uuid not null references public.supplier_profiles(organization_id)
    on delete restrict,
  anon_id text not null check(anon_id ~ '^anon_[a-z0-9_]{3,45}$'),
  invite_position smallint not null check(invite_position between 1 and 10),
  created_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id),
  unique(round_id,anon_id),
  unique(round_id,invite_position)
);
create index round_invites_supplier_v1_idx
  on cotironda_private.round_invites_v1(supplier_org_id,round_id);

-- Snapshot económico: no acepta texto libre, teléfonos, contactos ni equivalencia
-- técnica autodeclarada. Los campos permitidos son estrictos.
-- Objeto de línea: line_no(int), unit(text), available_qty(decimal string),
-- net_unit_price(decimal string o null), vat_rate('0','10.5','21' o null).
create function cotironda_private.check_quote_lines_v1(p_lines jsonb,p_round uuid)
returns boolean language plpgsql stable security invoker set search_path='' as $fn$
declare
  v_line jsonb;
  v_lineno integer;
  v_seen int[]:=array[]::int[];
  v_text text;
begin
  if jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)<1
     or jsonb_array_length(p_lines)>8 then return false; end if;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    if jsonb_typeof(v_line)<>'object'
      or (select count(*) from jsonb_object_keys(v_line))<>5
      or not (v_line ?& array['line_no','unit','available_qty','net_unit_price','vat_rate'])
      or jsonb_typeof(v_line->'line_no')<>'number'
      or (v_line->>'line_no') !~ '^[1-8]$'
      or jsonb_typeof(v_line->'unit')<>'string'
      or (v_line->>'unit') not in
        ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
      or jsonb_typeof(v_line->'available_qty')<>'string'
      or (v_line->>'available_qty') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,3})?$'
      or (v_line->>'available_qty')::numeric<=0
      or (jsonb_typeof(v_line->'net_unit_price') not in ('null','string'))
      or (jsonb_typeof(v_line->'net_unit_price')='string'
         and (v_line->>'net_unit_price') !~ '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$')
      or (jsonb_typeof(v_line->'vat_rate') not in ('null','string'))
      or (jsonb_typeof(v_line->'vat_rate')='string'
         and (v_line->>'vat_rate') not in ('0','10.5','21'))
    then return false; end if;
    v_lineno:=(v_line->>'line_no')::integer;
    if v_lineno=any(v_seen) or not exists(
      select 1 from cotironda_private.round_items_v1 i
      where i.round_id=p_round and i.line_no=v_lineno
    ) then return false; end if;
    v_seen:=array_append(v_seen,v_lineno);
  end loop;
  return true;
exception when others then
  return false;
end;
$fn$;

-- Una ronda abierta congela el pedido y la lista de invitaciones.
create function cotironda_private.guard_round_setup_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_id uuid; v_status text;
begin
 v_id:=case when tg_op='DELETE' then old.round_id else new.round_id end;
 select status into v_status from cotironda_private.rounds_v1 where id=v_id for update;
 if v_status is distinct from 'programada' then
   raise exception 'round_setup_is_frozen'; end if;
 if tg_op='UPDATE' and old.round_id<>new.round_id then
   raise exception 'round_setup_round_id_immutable'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$fn$;
create trigger round_items_setup_v1
 before insert or update or delete on cotironda_private.round_items_v1
 for each row execute function cotironda_private.guard_round_setup_v1();
create trigger round_invites_setup_v1
 before insert or update or delete on cotironda_private.round_invites_v1
 for each row execute function cotironda_private.guard_round_setup_v1();

create table cotironda_private.offer_drafts_v1 (
  round_id uuid not null,
  supplier_org_id uuid not null,
  revision integer not null default 1 check(revision>0),
  currency text not null check(currency in ('ARS','USD')),
  payment_method text check(payment_method in
    ('contado','transferencia','cuenta_corriente_30_dias')),
  lead_days smallint check(lead_days between 0 and 120),
  freight_gross numeric(18,2) check(freight_gross>=0),
  min_goods_gross numeric(18,2) check(min_goods_gross>=0),
  lines_snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict,
  check(cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
);

create table cotironda_private.offer_events_v1 (
  round_id uuid not null,
  event_id uuid not null,
  supplier_org_id uuid not null,
  event_kind text not null check(event_kind in ('draft_saved','offer_confirmed')),
  revision integer not null check(revision>0),
  payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key(round_id,event_id),
  unique(round_id,supplier_org_id,event_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict
);

-- Los eventos de proveedor tampoco se pueden registrar después del cierre,
-- ni antes de abrir. Este control no sustituye autenticar al actor que los envía.
create function cotironda_private.guard_offer_event_insert_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_status text; v_start timestamptz; v_end timestamptz;
begin
 select status,begins_at,ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 where id=new.round_id for update;
 if v_status is distinct from 'abierta'
    or clock_timestamp()<v_start or clock_timestamp()>=v_end then
   raise exception 'offer_event_outside_round_window'; end if;
 if not exists (
   select 1 from cotironda_private.offer_drafts_v1 d
   where d.round_id=new.round_id and d.supplier_org_id=new.supplier_org_id
     and d.revision=new.revision
 ) then raise exception 'offer_event_revision_missing'; end if;
 return new;
end;
$fn$;
create trigger offer_event_insert_v1
 before insert on cotironda_private.offer_events_v1
 for each row execute function cotironda_private.guard_offer_event_insert_v1();

create table cotironda_private.offer_versions_v1 (
  round_id uuid not null,
  supplier_org_id uuid not null,
  version integer not null check(version>0),
  draft_revision integer not null check(draft_revision>0),
  confirmation_event_id uuid not null,
  currency text not null check(currency in ('ARS','USD')),
  payment_method text check(payment_method in
    ('contado','transferencia','cuenta_corriente_30_dias')),
  lead_days smallint check(lead_days between 0 and 120),
  freight_gross numeric(18,2) check(freight_gross>=0),
  min_goods_gross numeric(18,2) check(min_goods_gross>=0),
  lines_snapshot jsonb not null,
  confirmed_at timestamptz not null default now(),
  primary key(round_id,supplier_org_id,version),
  unique(round_id,supplier_org_id,draft_revision),
  unique(round_id,confirmation_event_id),
  foreign key(round_id,supplier_org_id)
    references cotironda_private.round_invites_v1(round_id,supplier_org_id)
    on delete restrict,
  foreign key(round_id,supplier_org_id,confirmation_event_id)
    references cotironda_private.offer_events_v1(round_id,supplier_org_id,event_id)
    on delete restrict,
  check(cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
);

-- No confiar en version/evento autodeclarado: se revisan al insertar.
create function cotironda_private.guard_offer_version_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare
 v_d cotironda_private.offer_drafts_v1%rowtype;
 v_kind text;
 v_event_revision integer;
 v_status text;
 v_start timestamptz;
 v_end timestamptz;
 v_last integer;
begin
 select r.status,r.begins_at,r.ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 r where r.id=new.round_id
 for update; -- serializa confirmaciones de toda la ronda (en CI y futuro backend).
 if v_status is distinct from 'abierta' or
    clock_timestamp()<v_start or clock_timestamp()>=v_end then
  raise exception 'quote_confirmation_round_not_open'; end if;
 select * into v_d from cotironda_private.offer_drafts_v1 d
  where d.round_id=new.round_id and d.supplier_org_id=new.supplier_org_id;
 if not found or v_d.revision<>new.draft_revision
  or v_d.currency<>new.currency
  or v_d.payment_method is distinct from new.payment_method
  or v_d.lead_days is distinct from new.lead_days
  or v_d.freight_gross is distinct from new.freight_gross
  or v_d.min_goods_gross is distinct from new.min_goods_gross
  or v_d.lines_snapshot<>new.lines_snapshot then
  raise exception 'quote_confirmation_draft_mismatch'; end if;
 select e.event_kind,e.revision into v_kind,v_event_revision
 from cotironda_private.offer_events_v1 e
 where e.round_id=new.round_id and e.supplier_org_id=new.supplier_org_id
   and e.event_id=new.confirmation_event_id;
 if v_kind is distinct from 'offer_confirmed'
   or v_event_revision<>new.draft_revision then
   raise exception 'quote_confirmation_event_invalid'; end if;
 select coalesce(max(version),0) into v_last
 from cotironda_private.offer_versions_v1 v
 where v.round_id=new.round_id and v.supplier_org_id=new.supplier_org_id;
 if new.version<>v_last+1 then raise exception 'quote_version_out_of_sequence'; end if;
 return new;
end;
$fn$;
create trigger guard_offer_version_insert_v1
  before insert on cotironda_private.offer_versions_v1
  for each row execute function cotironda_private.guard_offer_version_v1();

create function cotironda_private.guard_draft_revision_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare v_status text; v_start timestamptz; v_end timestamptz;
begin
 select status,begins_at,ends_at into v_status,v_start,v_end
 from cotironda_private.rounds_v1 where id=new.round_id for update;
 if v_status is distinct from 'abierta' or
    clock_timestamp()<v_start or clock_timestamp()>=v_end then
   raise exception 'quote_draft_round_not_open'; end if;
 if tg_op='INSERT' and new.revision<>1 then
   raise exception 'quote_draft_initial_revision_invalid'; end if;
 if tg_op='UPDATE' and
   (new.round_id<>old.round_id or new.supplier_org_id<>old.supplier_org_id
    or new.revision<>old.revision+1) then
   raise exception 'quote_draft_revision_invalid'; end if;
 new.updated_at:=now();
 return new;
end;
$fn$;
create trigger guard_offer_draft_v1
  before insert or update on cotironda_private.offer_drafts_v1
  for each row execute function cotironda_private.guard_draft_revision_v1();

create function cotironda_private.reject_immutable_quote_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 raise exception 'confirmed_offer_and_event_are_immutable';
end;
$fn$;
create trigger quote_versions_immutable_v1
  before update or delete on cotironda_private.offer_versions_v1
  for each row execute function cotironda_private.reject_immutable_quote_v1();
create trigger quote_events_immutable_v1
  before update or delete on cotironda_private.offer_events_v1
  for each row execute function cotironda_private.reject_immutable_quote_v1();

-- Todas las tablas son server-only, no se publica Data API ni WebSocket.
alter table cotironda_private.rounds_v1 enable row level security;
alter table cotironda_private.round_items_v1 enable row level security;
alter table cotironda_private.round_invites_v1 enable row level security;
alter table cotironda_private.offer_drafts_v1 enable row level security;
alter table cotironda_private.offer_events_v1 enable row level security;
alter table cotironda_private.offer_versions_v1 enable row level security;
revoke all on cotironda_private.rounds_v1,
 cotironda_private.round_items_v1, cotironda_private.round_invites_v1,
 cotironda_private.offer_drafts_v1, cotironda_private.offer_events_v1,
 cotironda_private.offer_versions_v1 from public, anon, authenticated, service_role;
revoke all on function cotironda_private.check_quote_lines_v1(jsonb,uuid),
 cotironda_private.guard_offer_version_v1(),
 cotironda_private.guard_draft_revision_v1(),
 cotironda_private.reject_immutable_quote_v1(),
 cotironda_private.guard_round_transition_v1(),
 cotironda_private.guard_round_setup_v1(),
 cotironda_private.guard_offer_event_insert_v1()
 from public, anon, authenticated, service_role;
-- Sin policies: RLS cierra acceso; solo owner/postgres podrá probarlo.
comment on table cotironda_private.offer_versions_v1 is
 'D024 estructura CI: oferta confirmada inmutable, NO API ni aceptación comercial.';
