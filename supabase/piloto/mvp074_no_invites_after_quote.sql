-- MVP-074: no invitar nuevamente a un proveedor que ya presentó su oferta.
-- SOLO PILOTO: ilggkalaafhtiysyzlmg. La fuente literal de la oferta NO se toca.
-- El estado 'pending' puede cancelarse; 'leased', 'uncertain' y 'api_accepted'
-- tienen resultado de entrega potencialmente desconocido y se conservan.
create or replace function cotironda_piloto_privado.cancel_pending_invite_on_quote_v1()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  update cotironda_piloto_privado.whapi_outbox o
     set state='cancelled'
   where o.request_id=new.request_id
     and o.supplier_key=new.supplier_key
     and o.state='pending';
  return new;
end;
$fn$;

revoke all on function cotironda_piloto_privado.cancel_pending_invite_on_quote_v1()
 from public,anon,authenticated,service_role;

create trigger cancel_pending_invite_after_quote
 after insert on cotironda_piloto_privado.offer_versions
 for each row
 execute function cotironda_piloto_privado.cancel_pending_invite_on_quote_v1();

-- Reparación de invitaciones anteriores aún en espera: respetar las ofertas
-- existentes y NO afectar otras empresas/proveedores ni estados inciertos.
update cotironda_piloto_privado.whapi_outbox o
   set state='cancelled'
 where o.state='pending'
   and exists(
     select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=o.request_id and v.supplier_key=o.supplier_key
   );

-- Adaptado desde el runtime ACTUAL D073f; conserva consentimiento del comprador,
-- estado, antigüedad de la ronda, catálogo/zonas ya filtrados al invitar y SKIP LOCKED.
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
 join cotironda_piloto_privado.requests r on r.id=o.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where o.state='pending' and p.participant_role='supplier'
   and buyer.participant_role='buyer' and buyer.consent_at is not null
   and r.state='prepared' and r.created_at>clock_timestamp()-interval '7 days'
   and p.chat_hmac is not null and p.consent_at is not null
   and not exists(
     select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=o.request_id and v.supplier_key=o.supplier_key
   )
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

-- Doble comprobación justo antes de la llamada externa a Whapi: una respuesta
-- entrante entre claim y autorización invalida ese envío. Leases no se reintentan.
create or replace function public.cotironda_piloto_authorize_whapi_v1(
 p_request uuid,p_supplier text,p_lease uuid
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
 select 1
 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.participants p on p.key=o.supplier_key
 join cotironda_piloto_privado.requests r on r.id=o.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 join cotironda_piloto_privado.integration_flags f on f.only_row=true
 where o.request_id=p_request and o.supplier_key=p_supplier
 and o.state='leased' and o.lease_token=p_lease
 and p.consent_at is not null and p.chat_hmac is not null
 and buyer.consent_at is not null and buyer.participant_role='buyer'
 and r.state='prepared' and r.created_at>clock_timestamp()-interval '7 days'
 and f.whatsapp_outbound_enabled=true
 and not exists(
   select 1 from cotironda_piloto_privado.offer_versions v
   where v.request_id=o.request_id and v.supplier_key=o.supplier_key
 ));
$fn$;

revoke all on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 to service_role;
