-- MVP148 · PILOTO exclusivamente. Reemplaza la ventana única de MVP091
-- por una autorización por solicitud textual autenticada y catálogo curado.
-- NO crear invitaciones, leases ni mensajes. NO habilitar otro destino.
create or replace function cotironda_piloto_privado.allow_next_pilot_send_mvp091(
 p_request uuid, p_supplier text
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
  select 1
  from cotironda_piloto_privado.requests r
  join cotironda_piloto_privado.participants b on b.key=r.buyer_key
  join cotironda_piloto_privado.participants s on s.key=p_supplier
  join cotironda_piloto_privado.invitations i on
    i.request_id=r.id and i.supplier_key=s.key
  join cotironda_piloto_privado.whapi_inbox source on
    source.request_id=r.id and source.message_hmac=r.source_hmac
    and source.participant_key=b.key and source.chat_hmac=b.chat_hmac
  join cotironda_piloto_privado.integration_flags flags on flags.only_row
  where r.id=p_request and r.buyer_key='arquitecto'
    and flags.whatsapp_outbound_enabled=true
    and r.state='prepared' and r.closes_at>clock_timestamp()
    and r.delivery_city='La Plata'
    and b.participant_role='buyer' and b.chat_hmac is not null
    and b.consent_at is not null and b.opted_out_at is null
    and source.kind='text' and source.processing_state='recorded'
    and s.key in ('corralon_ailin','corralon_nahuel')
    and s.participant_role='supplier'
    and s.delivery_city=r.delivery_city and s.chat_hmac is not null
    and s.consent_at is not null and s.opted_out_at is null
    and i.state='prepared'
    and (select count(*) from cotironda_piloto_privado.request_lines l
         where l.request_id=r.id) between 1 and 8
    and not exists(
      select 1 from cotironda_piloto_privado.request_lines l
      where l.request_id=r.id and not exists(
        select 1 from cotironda_piloto_privado.catalogue_lines c
        where c.participant_key=s.key and c.family_code=l.family_code
          and c.recognition_state='curated_family'
      )
    )
    and not exists(
      select 1 from cotironda_piloto_privado.offer_versions v
      where v.request_id=r.id and v.supplier_key=s.key
    )
 );
$fn$;

-- Private predicate callable only by the trusted definer-based claim/authorize.
-- Revoke after CREATE OR REPLACE, keeping all other ACLs and code unchanged.
revoke all on function
 cotironda_piloto_privado.allow_next_pilot_send_mvp091(uuid,text)
 from public,anon,authenticated,service_role;
