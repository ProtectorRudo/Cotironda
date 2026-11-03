-- MVP-089 / operator ONLY, Supabase project cotironda-piloto.
-- One scoped invitation to Nahuel. This NEVER enables outbound nor sends.
-- May be executed after MVP089 migration and tests, with operator approval.
begin;
do $check$
declare rid uuid; c integer; expiry timestamptz;
begin
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled=true and whatsapp_outbound_enabled=false)
 then raise exception 'mvp089_outbound_must_stay_off' using errcode='42501';end if;
 select count(*),min(id::text)::uuid into c,rid
 from cotironda_piloto_privado.requests
 where state='prepared' and buyer_key='arquitecto' and delivery_city='La Plata'
   and closes_at>clock_timestamp()
   and (select count(*) from cotironda_piloto_privado.request_lines l where l.request_id=id)=2;
 if c<>1 then raise exception 'mvp089_request_ambiguous' using errcode='42501';end if;
 if not cotironda_piloto_privado.allow_single_test_send_mvp089(rid,'corralon_nahuel') then
   -- scope not created yet: perform strict validation separately below.
   if not exists(
     select 1 from cotironda_piloto_privado.invitations i
     join cotironda_piloto_privado.participants p on p.key=i.supplier_key
     join cotironda_piloto_privado.requests r on r.id=i.request_id
     join cotironda_piloto_privado.participants b on b.key=r.buyer_key
     join cotironda_piloto_privado.whapi_outbox o on o.request_id=r.id and o.supplier_key=p.key
     where i.request_id=rid and i.supplier_key='corralon_nahuel'
       and o.state='pending' and i.state='prepared'
       and p.delivery_city='La Plata' and p.consent_at is not null
       and p.opted_out_at is null and p.chat_hmac is not null
       and b.consent_at is not null and b.opted_out_at is null
       and not exists(select 1 from cotironda_piloto_privado.offer_versions v
          where v.request_id=rid and v.supplier_key=p.key)
   ) then raise exception 'mvp089_supplier_not_eligible' using errcode='42501';end if;
 end if;
 if exists(select 1 from cotironda_piloto_privado.whapi_test_send_scope_mvp089) then
   raise exception 'mvp089_scope_already_created' using errcode='42501';end if;
 select least(r.closes_at,clock_timestamp()+interval '12 hours') into expiry
 from cotironda_piloto_privado.requests r where r.id=rid;
 insert into cotironda_piloto_privado.whapi_test_send_scope_mvp089(
    only_row,request_id,supplier_key,expires_at)
 values(true,rid,'corralon_nahuel',expiry);
 if not cotironda_piloto_privado.allow_single_test_send_mvp089(rid,'corralon_nahuel') then
   raise exception 'mvp089_scope_validation_failure' using errcode='42501';end if;
 update cotironda_piloto_privado.whapi_outbox
 set message_body=cotironda_piloto_privado.invitation_body_mvp089(rid)
 where request_id=rid and supplier_key='corralon_nahuel' and state='pending';
 if not found then raise exception 'mvp089_pending_message_not_found' using errcode='42501';end if;
end;$check$;
commit;
-- After operator step run READ ONLY checks; NO FLAG CHANGE in this file.
