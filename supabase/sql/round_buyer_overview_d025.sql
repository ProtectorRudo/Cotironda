-- D025 / Issue #149. SQL INCREMENTAL, únicamente después del ledger D024 en PG17 CI.
-- No migración oficial; SIN instalar DEV ni publicar. Solo lectura comprador.
-- NO SELECT directo de identidades, invitaciones, cotizaciones ni contactos.
create role cotironda_rounds_reader nologin noinherit nobypassrls;
grant usage on schema public,cotironda_private to cotironda_rounds_reader;
-- Necesario para auth.uid() en política RLS, sin SELECT de auth.users/sessions.
grant usage on schema auth to cotironda_rounds_reader;
grant execute on function auth.uid() to cotironda_rounds_reader;
grant select on public.organizations,public.organization_members to cotironda_rounds_reader;
grant select on cotironda_private.rounds_v1,cotironda_private.round_items_v1
  to cotironda_rounds_reader;

-- RLS de defensa en profundidad, incluso para el rol lector no conectado.
create policy d025_members_own_active on public.organization_members
 for select to cotironda_rounds_reader using (
   user_id=(select auth.uid()) and status='active'
 );
create policy d025_organizations_own_buyer on public.organizations
 for select to cotironda_rounds_reader using (
   organization_type in ('buyer','both') and exists (
     select 1 from public.organization_members m
     where m.organization_id=organizations.id
       and m.user_id=(select auth.uid()) and m.status='active'
   )
 );
create policy d025_rounds_own_buyer on cotironda_private.rounds_v1
 for select to cotironda_rounds_reader using (
   exists (
     select 1 from public.organizations o
     where o.id=rounds_v1.buyer_org_id
       and o.organization_type in ('buyer','both')
   )
 );
create policy d025_round_items_own_buyer on cotironda_private.round_items_v1
 for select to cotironda_rounds_reader using (
   exists (
     select 1 from cotironda_private.rounds_v1 r
     where r.id=round_items_v1.round_id
   )
 );

-- Reutilizar el chequeo de sesión y correo de Etapa 01; NUNCA otorgar SELECT a auth.sessions.
grant execute on function cotironda_private.is_session_verified(uuid,uuid)
 to cotironda_rounds_reader;

create function cotironda_private.buyer_round_overview_v1(p_round_id uuid)
returns table(round_id uuid, round_status text, begins_at timestamptz,
 ends_at timestamptz, items jsonb)
language plpgsql stable security definer set search_path='' as $fn$
declare
 v_claims jsonb;
 v_uid uuid;
 v_sid uuid;
begin
 if p_round_id is null then
   raise exception 'round_invalid' using errcode='22023'; end if;
 v_claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;
 if v_claims is null
    or v_claims->>'role' is distinct from 'authenticated'
    or v_claims->>'is_anonymous' is distinct from 'false'
    or v_claims->>'cotironda_email_verified' is distinct from 'true'
    or coalesce(v_claims->>'sub','') !~* '^[0-9a-f-]{36}$'
    or coalesce(v_claims->>'session_id','') !~* '^[0-9a-f-]{36}$'
 then raise exception 'round_session_invalid' using errcode='42501'; end if;
 v_uid:=(v_claims->>'sub')::uuid;
 v_sid:=(v_claims->>'session_id')::uuid;
 if v_uid is distinct from (select auth.uid())
    or not coalesce(cotironda_private.is_session_verified(v_uid,v_sid),false)
 then raise exception 'round_session_invalid' using errcode='42501'; end if;

 -- La membresía se verifica contra tablas ACTUALES, no claims de rol/empresa.
 return query
 select r.id,r.status,r.begins_at,r.ends_at,
   coalesce((
     select jsonb_agg(jsonb_build_object(
       'line_no',i.line_no,
       'product_code',i.product_code,
       'quantity',to_char(i.quantity,'FM999999999999990.000'),
       'unit',i.unit
     ) order by i.line_no)
     from cotironda_private.round_items_v1 i
     where i.round_id=r.id
   ),'[]'::jsonb)
 from cotironda_private.rounds_v1 r
 join public.organizations o on o.id=r.buyer_org_id
 join public.organization_members m on m.organization_id=r.buyer_org_id
 where r.id=p_round_id and m.user_id=v_uid and m.status='active'
   and o.organization_type in ('buyer','both');
end;
$fn$;

-- Owner de privilegios mínimos: este rol jamás puede escribir, tampoco BYPASSRLS.
grant create on schema cotironda_private to cotironda_rounds_reader;
grant cotironda_rounds_reader to postgres with set true,inherit false;
alter function cotironda_private.buyer_round_overview_v1(uuid)
 owner to cotironda_rounds_reader;
revoke cotironda_rounds_reader from postgres;
revoke create on schema cotironda_private from cotironda_rounds_reader;
revoke all on function cotironda_private.buyer_round_overview_v1(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
-- No expuesta directamente en PostgREST (esquema privado).
grant execute on function cotironda_private.buyer_round_overview_v1(uuid)
 to authenticated;
grant usage on schema cotironda_private to authenticated;

-- Único punto REST, SECURITY INVOKER (sin privilegios de postgres).
create function public.buyer_round_overview_v1(p_round_id uuid)
returns table(round_id uuid,round_status text,begins_at timestamptz,
 ends_at timestamptz,items jsonb)
language sql stable security invoker set search_path='' as $fn$
 select v.round_id,v.round_status,v.begins_at,v.ends_at,v.items
 from cotironda_private.buyer_round_overview_v1(p_round_id) v;
$fn$;
revoke all on function public.buyer_round_overview_v1(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function public.buyer_round_overview_v1(uuid) to authenticated;
comment on function public.buyer_round_overview_v1(uuid) is
 'D025 comprador autenticado: solo status y renglones, sin proveedores ni ofertas.';
