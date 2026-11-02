-- MVP-073f: never send an invitation after buyer BAJA/cancellation/round timeout.
-- Replace vetted RPCs only; leave in-flight leases uncertain, never auto-retry.
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
end;$fn$;

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
 and f.whatsapp_outbound_enabled=true);
$fn$;
