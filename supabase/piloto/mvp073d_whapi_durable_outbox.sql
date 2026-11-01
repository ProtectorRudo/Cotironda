-- MVP-073d. Durable outbox for the isolated 1+2 pilot. No sends happen in SQL.
-- Outbound remains OFF until opt-in, secrets, Webhook and test are verified.
alter table cotironda_piloto_privado.integration_flags
 drop constraint integration_flags_whatsapp_outbound_enabled_check;

create table cotironda_piloto_privado.whapi_outbox (
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 supplier_key text not null references cotironda_piloto_privado.participants(key),
 message_body text not null check(char_length(message_body) between 20 and 3500),
 state text not null default 'pending'
  check(state in ('pending','leased','api_accepted','uncertain','cancelled')),
 lease_token uuid,
 leased_at timestamptz,
 whapi_message_id text,
 sent_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 primary key(request_id,supplier_key),
 check((state='leased' and lease_token is not null and leased_at is not null)
   or state<>'leased')
);
alter table cotironda_piloto_privado.whapi_outbox enable row level security;
revoke all on cotironda_piloto_privado.whapi_outbox
 from public,anon,authenticated,service_role;

create function cotironda_piloto_privado.queue_invitation_whapi_v1()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare txt text;
begin
 select 'Cotironda · Consulta de prueba' || E'\n' ||
  'Entrega: '||r.delivery_city|| E'\n' ||
  'Materiales:'|| E'\n' ||
  left(string_agg(l.quantity::text||' '||l.unit||' · '||l.original_description,
   E'\n' order by l.line_no),2700) || E'\n' ||
  'Respondé este WhatsApp con tu presupuesto completo y sus aclaraciones.'
 into txt
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.request_lines l on l.request_id=r.id
 where r.id=new.request_id
 group by r.delivery_city;
 if txt is null then raise exception 'missing_invitation_lines';end if;
 insert into cotironda_piloto_privado.whapi_outbox(request_id,supplier_key,message_body)
 values(new.request_id,new.supplier_key,txt);
 return new;
end;$fn$;
revoke all on function cotironda_piloto_privado.queue_invitation_whapi_v1()
 from PUBLIC,anon,authenticated,service_role;
create trigger enqueue_on_invitation
 after insert on cotironda_piloto_privado.invitations
 for each row execute function cotironda_piloto_privado.queue_invitation_whapi_v1();

-- Claims ONE pending, consented and matching supplier. Never auto-retry
-- a leased/uncertain request: unknown Whapi result must be reconciled manually.
create function public.cotironda_piloto_claim_whapi_v1()
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
 where o.state='pending' and p.participant_role='supplier'
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
revoke all on function public.cotironda_piloto_claim_whapi_v1()
 from PUBLIC,anon,authenticated;
grant execute on function public.cotironda_piloto_claim_whapi_v1() to service_role;

create function public.cotironda_piloto_authorize_whapi_v1(
 p_request uuid,p_supplier text,p_lease uuid
) returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(
 select 1
 from cotironda_piloto_privado.whapi_outbox o
 join cotironda_piloto_privado.participants p on p.key=o.supplier_key
 join cotironda_piloto_privado.integration_flags f on f.only_row=true
 where o.request_id=p_request and o.supplier_key=p_supplier
 and o.state='leased' and o.lease_token=p_lease
 and p.consent_at is not null and p.chat_hmac is not null
 and f.whatsapp_outbound_enabled=true);
$fn$;
revoke all on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid)
 from PUBLIC,anon,authenticated;
grant execute on function public.cotironda_piloto_authorize_whapi_v1(uuid,text,uuid) to service_role;

create function public.cotironda_piloto_finish_whapi_v1(
 p_request uuid,p_supplier text,p_lease uuid,p_state text,p_message_id text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_state not in ('api_accepted','uncertain') or
  (p_message_id is not null and length(p_message_id)>160) then
  raise exception 'invalid_delivery_state' using errcode='22023';
 end if;
 update cotironda_piloto_privado.whapi_outbox
 set state=p_state,whapi_message_id=p_message_id,
  sent_at=case when p_state='api_accepted' then clock_timestamp() else null end
 where request_id=p_request and supplier_key=p_supplier
  and lease_token=p_lease and state='leased';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_finish_whapi_v1(uuid,text,uuid,text,text)
 from PUBLIC,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_whapi_v1(uuid,text,uuid,text,text)
 to service_role;
