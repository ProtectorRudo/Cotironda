-- MVP-104 / SOLO PILOTO. At most one supplier acknowledgement per incoming
-- WhatsApp HMAC. This ledger MUST NOT authorize a quote, price, ranking or
-- reveal contact data. Never retry an uncertain Whapi send automatically.
create table cotironda_piloto_privado.supplier_ack_mvp104(
 message_hmac text primary key references
  cotironda_piloto_privado.whapi_inbox(message_hmac),
 chat_hmac text not null check(chat_hmac ~ '^[a-f0-9]{64}$'),
 mode text not null check(mode in ('text_quote','media_quote')),
 state text not null default 'leased'
  check(state in ('leased','api_accepted','uncertain')),
 reserved_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz
);
alter table cotironda_piloto_privado.supplier_ack_mvp104
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_ack_mvp104
 from public,anon,authenticated,service_role;

create function public.cotironda_piloto_reserve_supplier_ack_mvp104(
 p_message_hmac text,p_chat_hmac text,p_mode text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_key text;n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_chat_hmac is null or p_chat_hmac !~ '^[a-f0-9]{64}$'
  or p_mode not in ('text_quote','media_quote') then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled and whatsapp_outbound_enabled)
 then return false;end if;
 -- A signed, authenticated inbox message must have exactly one matching,
 -- consented, current supplier + active invitation. No guessed phone numbers.
 select m.participant_key into v_key
 from cotironda_piloto_privado.whapi_inbox m
 join cotironda_piloto_privado.participants p
   on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 left join cotironda_piloto_privado.media_archive_mvp095 a
   on a.message_hmac=m.message_hmac and a.participant_key=p.key
 join cotironda_piloto_privado.invitations i
   on i.supplier_key=p.key
   and i.request_id=coalesce(m.request_id,a.request_id)
 join cotironda_piloto_privado.requests r
   on r.id=i.request_id
 where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
  and m.received_at>clock_timestamp()-interval '15 minutes'
  and p.participant_role='supplier'
  and p.consent_at is not null and p.opted_out_at is null
  and r.state='prepared' and r.closes_at>clock_timestamp()
  and i.state='prepared'
  and ((p_mode='text_quote' and m.kind='text'
    and m.processing_state='quote_recorded'
    and exists(select 1 from cotironda_piloto_privado.offer_versions o
      where o.source_message_hmac=m.message_hmac
       and o.supplier_key=p.key and o.request_id=m.request_id))
   or (p_mode='media_quote' and m.kind in ('image','document')
    and m.processing_state='needs_review'
    and a.state='stored' and a.review_state='suggested_only'
    and a.request_id=i.request_id
    and exists(select 1
      from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
      where q.message_hmac=m.message_hmac
       and q.request_id=a.request_id and q.supplier_key=p.key
       and q.source_sha256=a.content_sha256
       and q.state='awaiting_fidelity_check')))
 for update of p;
 if v_key is null then return false;end if;
 insert into cotironda_piloto_privado.supplier_ack_mvp104(
  message_hmac,chat_hmac,mode)
 values(p_message_hmac,p_chat_hmac,p_mode) on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_supplier_ack_mvp104(text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_supplier_ack_mvp104(text,text,text)
 to service_role;

create function public.cotironda_piloto_finish_supplier_ack_mvp104(
 p_message_hmac text,p_state text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_state not in ('api_accepted','uncertain')then return false;end if;
 update cotironda_piloto_privado.supplier_ack_mvp104
 set state=p_state,finished_at=clock_timestamp()
 where message_hmac=p_message_hmac and state='leased';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_finish_supplier_ack_mvp104(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_supplier_ack_mvp104(text,text)
 to service_role;
