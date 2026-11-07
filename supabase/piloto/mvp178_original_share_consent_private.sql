-- MVP178 / SOLO DESARROLLO: NO ejecutar como migración sin aprobación de piloto.
-- Registro PRIVADO por ronda, sin URLs, sin autorización del enlace WhatsApp
-- y con política global desactivada (no retroactividad).
create table if not exists cotironda_piloto_privado.original_share_policy_mvp178 (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 activated_at timestamptz,
 check((enabled = true and activated_at is not null) or
       (enabled = false and activated_at is null))
);
insert into cotironda_piloto_privado.original_share_policy_mvp178
 (singleton,enabled,activated_at) values(true,false,null)
 on conflict(singleton) do nothing;
alter table cotironda_piloto_privado.original_share_policy_mvp178
 enable row level security;
revoke all on cotironda_piloto_privado.original_share_policy_mvp178
 from public,anon,authenticated,service_role;

-- Un consentimiento prospectivo verificado podrá registrarse para cada ronda
-- antes de invitar; no se interpreta una cotización como consentimiento.
create table if not exists cotironda_piloto_privado.original_share_consents_mvp178 (
 request_id uuid not null references cotironda_piloto_privado.requests(id)
  on delete restrict,
 supplier_key text not null references cotironda_piloto_privado.participants(key)
  on delete restrict,
 consent_message_hmac text not null references
  cotironda_piloto_privado.whapi_inbox(message_hmac) on delete restrict,
 alcance text not null default 'original_identificable_tras_cierre'
  check(alcance='original_identificable_tras_cierre'),
 version text not null default 'cotironda-originales-v1'
  check(version='cotironda-originales-v1'),
 accepted_at timestamptz not null,
 revoked_at timestamptz,
 registered_at timestamptz not null default clock_timestamp(),
 primary key(request_id,supplier_key),
 check(revoked_at is null or revoked_at>=accepted_at)
);
alter table cotironda_piloto_privado.original_share_consents_mvp178
 enable row level security;
revoke all on cotironda_piloto_privado.original_share_consents_mvp178
 from public,anon,authenticated,service_role;

-- Esta función SOLO prueba que existe consentimiento individual vigente
-- para una ronda NUEVA y ya cerrada; NO autoriza por sí misma descargar:
-- falta comprador autenticado, archivo SHA vigente, URL corta y auditoría.
create or replace function public.cotironda_piloto_original_consent_preflight_mvp178(
 p_request_id uuid,p_supplier_key text)
returns boolean language sql volatile security definer set search_path='' as $fn$
 select exists(
  select 1 from cotironda_piloto_privado.original_share_consents_mvp178 c
  join cotironda_piloto_privado.original_share_policy_mvp178 pol
   on pol.singleton=true and pol.enabled=true and pol.activated_at is not null
  join cotironda_piloto_privado.requests r
   on r.id=c.request_id and r.state='closed'
   and r.closed_at is not null and r.closed_at>=r.closes_at
   and clock_timestamp()>=r.closed_at
   and r.created_at>pol.activated_at
  join cotironda_piloto_privado.invitations i
   on i.request_id=c.request_id and i.supplier_key=c.supplier_key
   and i.created_at>=c.accepted_at
  join cotironda_piloto_privado.participants supplier
   on supplier.key=c.supplier_key and supplier.participant_role='supplier'
   and supplier.consent_at is not null and supplier.opted_out_at is null
  join cotironda_piloto_privado.participants buyer
   on buyer.key=r.buyer_key and buyer.participant_role='buyer'
   and buyer.consent_at is not null and buyer.opted_out_at is null
  join cotironda_piloto_privado.whapi_inbox msg
   on msg.message_hmac=c.consent_message_hmac
   and msg.participant_key=c.supplier_key
   and msg.received_at=c.accepted_at
   and (msg.request_id is null or msg.request_id=c.request_id)
  where c.request_id=p_request_id and c.supplier_key=p_supplier_key
   and c.revoked_at is null
   and c.accepted_at>=pol.activated_at
 );
$fn$;
revoke all on function public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)
 from public,anon,authenticated,service_role;
grant execute on function public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)
 to service_role;
