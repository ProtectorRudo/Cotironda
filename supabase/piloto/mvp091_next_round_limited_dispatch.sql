-- MVP-091 next ONE WhatsApp buyer round, 2 known suppliers; no secrets.
-- A single 12h start window is enabled by a separate operator AFTER tests.
create table cotironda_piloto_privado.next_round_window_mvp091(
 only_row boolean primary key default true check(only_row=true),
 starts_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 check(expires_at>starts_at),
 check(expires_at<=starts_at+interval '24 hours')
);
alter table cotironda_piloto_privado.next_round_window_mvp091 enable row level security;
revoke all on cotironda_piloto_privado.next_round_window_mvp091
 from public,anon,authenticated,service_role;

create function cotironda_piloto_privado.allow_next_pilot_send_mvp091(
 p_request uuid,p_supplier text
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
 select 1 from cotironda_piloto_privado.next_round_window_mvp091 w
 join cotironda_piloto_privado.requests r on
   r.created_at>=w.starts_at and r.created_at<w.expires_at
 join cotironda_piloto_privado.participants b on b.key=r.buyer_key
 join cotironda_piloto_privado.participants s on s.key=p_supplier
 join cotironda_piloto_privado.invitations i on
   i.request_id=r.id and i.supplier_key=s.key
 where w.only_row and w.expires_at>clock_timestamp()
   and r.id=p_request and r.state='prepared'
   and r.closes_at>clock_timestamp() and r.delivery_city='La Plata'
   and r.buyer_key='arquitecto'
   and b.participant_role='buyer' and b.consent_at is not null
   and b.opted_out_at is null and b.chat_hmac is not null
   and s.key in ('corralon_ailin','corralon_nahuel')
   and s.participant_role='supplier' and s.delivery_city=r.delivery_city
   and s.chat_hmac is not null and s.consent_at is not null
   and s.opted_out_at is null and i.state='prepared'
   and (select count(*) from cotironda_piloto_privado.requests rr
       where rr.created_at>=w.starts_at and rr.created_at<w.expires_at)=1
   and (select count(*) from cotironda_piloto_privado.request_lines l
        where l.request_id=r.id) between 1 and 8
   and not exists(select 1 from cotironda_piloto_privado.request_lines l
      where l.request_id=r.id and (
        l.family_code not in ('cemento_gris_obra','hidrofugo')
        or not exists(select 1 from cotironda_piloto_privado.catalogue_lines c
           where c.participant_key=s.key and c.family_code=l.family_code
             and c.recognition_state='curated_family')))
   and not exists(select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=r.id and v.supplier_key=s.key)
 );
$fn$;
revoke all on function cotironda_piloto_privado.allow_next_pilot_send_mvp091(uuid,text)
 from public,anon,authenticated,service_role;

-- Claim and authorize share the same per-request permission and both check
-- consent/cutoff, with SKIP LOCKED and irreversible leased/uncertain states.

create or replace function public.cotironda_piloto_claim_whapi_v1()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare row_ record; token uuid;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
 where only_row and whatsapp_outbound_enabled=true) then
  return jsonb_build_object('state','outbound_disabled');
 end if;
 select o.request_id,o.supplier_key,o.message_body,p.chat_hmac into row_
 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.participants p on p.key=o.supplier_key
 where o.state='pending'
 and cotironda_piloto_privado.allow_next_pilot_send_mvp091(o.request_id,o.supplier_key)
 order by o.created_at,o.supplier_key
 for update of o skip locked limit 1;
 if not found then return jsonb_build_object('state','empty');end if;
 token:=gen_random_uuid();
 update cotironda_piloto_privado.whapi_outbox
 set state='leased',lease_token=token,leased_at=clock_timestamp()
 where request_id=row_.request_id and supplier_key=row_.supplier_key;
 return jsonb_build_object('state','leased','request_id',row_.request_id,
 'supplier_key',row_.supplier_key,'chat_hmac',row_.chat_hmac,
 'message_body',row_.message_body,'lease_token',token);
end;
$fn$;
revoke all on function public.cotironda_piloto_claim_whapi_v1()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_claim_whapi_v1() to service_role;

-- Recheck consent, state, time, scope, sender and lease immediately before HTTP.
create or replace function public.cotironda_piloto_authorize_whapi_v1(
 p_request uuid,p_supplier text,p_lease uuid
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
 select 1 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.integration_flags f on f.only_row
 where o.request_id=p_request and o.supplier_key=p_supplier
 and o.state='leased' and o.lease_token=p_lease
 and f.whatsapp_outbound_enabled=true
 and cotironda_piloto_privado.allow_next_pilot_send_mvp091(o.request_id,o.supplier_key)
 );
$fn$;
revoke all on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 to service_role;

-- DO NOT INSERT scope or turn on outbound in migration.
-- In the operator step, authorize EXACTLY the current request and Nahuel,
-- rewrite only HIS pending body, perform a rollback smoke, THEN consider output.
