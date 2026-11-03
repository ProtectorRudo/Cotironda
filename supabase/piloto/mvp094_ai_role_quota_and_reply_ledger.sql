-- MVP-094 PILOT ONLY: roles, consent, idempotency, quota and safe replies.
-- No AI key or message contents are stored. All functions service_role only.
do $gate$
begin
 if to_regclass('cotironda_piloto_privado.whapi_inbox') is null or
    to_regclass('cotironda_piloto_privado.integration_flags') is null
 then raise exception 'mvp094_wrong_database' using errcode='42501';end if;
end;$gate$;

create table cotironda_piloto_privado.ai_attempts_mvp094(
 message_hmac text primary key check(message_hmac ~ '^[a-f0-9]{64}$'),
 chat_hmac text not null check(chat_hmac ~ '^[a-f0-9]{64}$'),
 reserved_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.ai_attempts_mvp094 enable row level security;
revoke all on cotironda_piloto_privado.ai_attempts_mvp094
 from public,anon,authenticated,service_role;
create index ai_attempts_mvp094_quota_idx
 on cotironda_piloto_privado.ai_attempts_mvp094(chat_hmac,reserved_at desc);

-- Only the single pre-enrolled buyer from this PILOT. 12 calls/24h max,
-- one call per WhatsApp message, even if API times out. No guessing role.
create function public.cotironda_piloto_reserve_ai_mvp094(
 p_chat_hmac text,p_message_hmac text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer; reserved integer;
begin
 if p_chat_hmac !~ '^[a-f0-9]{64}$'
    or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled=true)
 or not exists(select 1 from cotironda_piloto_privado.participants p
   where p.key='arquitecto' and p.participant_role='buyer'
     and p.chat_hmac=p_chat_hmac
     and p.consent_at is not null and p.opted_out_at is null)
 or exists(select 1 from cotironda_piloto_privado.whapi_inbox
   where message_hmac=p_message_hmac)
 then return false;end if;
 -- Concurrent event order is serialized by locking a single participant.
 perform 1 from cotironda_piloto_privado.participants
 where key='arquitecto' and chat_hmac=p_chat_hmac for update;
 select count(*) into n from cotironda_piloto_privado.ai_attempts_mvp094
 where chat_hmac=p_chat_hmac and
   reserved_at>=clock_timestamp()-interval '24 hours';
 if n>=12 then return false;end if;
 insert into cotironda_piloto_privado.ai_attempts_mvp094(
 message_hmac,chat_hmac)values(p_message_hmac,p_chat_hmac)
 on conflict do nothing;
 get diagnostics reserved=row_count;
 return reserved=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_ai_mvp094(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_ai_mvp094(text,text)
 to service_role;

create table cotironda_piloto_privado.ai_replies_mvp094(
 message_hmac text primary key
  references cotironda_piloto_privado.whapi_inbox(message_hmac),
 chat_hmac text not null check(chat_hmac ~ '^[a-f0-9]{64}$'),
 reply_code text not null check(reply_code in
  ('zone','materials','how_it_works','supplier_pricing',
   'buyer_pricing','privacy','timing','status')),
 state text not null default 'leased'
  check(state in ('leased','api_accepted','uncertain')),
 created_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz
);
alter table cotironda_piloto_privado.ai_replies_mvp094 enable row level security;
revoke all on cotironda_piloto_privado.ai_replies_mvp094
 from public,anon,authenticated,service_role;

-- A reply can only be issued after an authenticated message was committed.
-- Never reply to a supplier, an unknown chat, BAJA or a duplicated event.
create function public.cotironda_piloto_reserve_reply_mvp094(
 p_message_hmac text,p_chat_hmac text,p_reply_code text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or
    p_chat_hmac !~ '^[a-f0-9]{64}$' or
    p_reply_code not in ('zone','materials','how_it_works','supplier_pricing',
      'buyer_pricing','privacy','timing','status')then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
    where only_row and whatsapp_inbound_enabled=true
       and whatsapp_outbound_enabled=true)
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.whapi_inbox m
   join cotironda_piloto_privado.participants p
    on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
   where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
    and m.kind='text' and m.received_at>clock_timestamp()-interval '10 minutes'
    and m.processing_state in ('needs_zone','needs_review')
    and p.key='arquitecto' and p.participant_role='buyer'
    and p.consent_at is not null and p.opted_out_at is null)
 then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
   where key='arquitecto' and chat_hmac=p_chat_hmac for update;
 select count(*) into n from cotironda_piloto_privado.ai_replies_mvp094
 where chat_hmac=p_chat_hmac and created_at>=clock_timestamp()-interval '24 hours';
 if n>=5 then return false;end if;
 insert into cotironda_piloto_privado.ai_replies_mvp094(
 message_hmac,chat_hmac,reply_code)
 values(p_message_hmac,p_chat_hmac,p_reply_code) on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_reply_mvp094(text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_reply_mvp094(text,text,text)
 to service_role;

create function public.cotironda_piloto_finish_reply_mvp094(
 p_message_hmac text,p_state text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or
   p_state not in ('api_accepted','uncertain') then return false;end if;
 update cotironda_piloto_privado.ai_replies_mvp094
 set state=p_state,finished_at=clock_timestamp()
 where message_hmac=p_message_hmac and state='leased';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_finish_reply_mvp094(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_reply_mvp094(text,text)
 to service_role;
