-- MVP-097. Commercial send/quote must not fail at 2 images or 5 replies/day.
-- Variable anti-abuse/cost circuit-breakers. No customer-facing cap.
-- One PILOT row, no exposed table grants or policies.
create table cotironda_piloto_privado.operational_caps_mvp097(
 only_row boolean primary key default true check(only_row),
 max_media_per_24h integer not null default 500 check(max_media_per_24h between 1 and 10000),
 max_document_ai_per_24h integer not null default 100 check(max_document_ai_per_24h between 1 and 1000),
 max_text_ai_per_24h integer not null default 200 check(max_text_ai_per_24h between 1 and 1000),
 max_replies_per_24h integer not null default 100 check(max_replies_per_24h between 1 and 1000),
 updated_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.operational_caps_mvp097 enable row level security;
revoke all on cotironda_piloto_privado.operational_caps_mvp097 from public,anon,authenticated,service_role;
insert into cotironda_piloto_privado.operational_caps_mvp097(only_row)values(true);

create or replace function public.cotironda_piloto_reserve_ai_mvp094(
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
 if n>=(select max_text_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row) then return false;end if;
 insert into cotironda_piloto_privado.ai_attempts_mvp094(
 message_hmac,chat_hmac)values(p_message_hmac,p_chat_hmac)
 on conflict do nothing;
 get diagnostics reserved=row_count;
 return reserved=1;
end;$fn$;

create or replace function public.cotironda_piloto_reserve_reply_mvp094(
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
 if n>=(select max_replies_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row) then return false;end if;
 insert into cotironda_piloto_privado.ai_replies_mvp094(
 message_hmac,chat_hmac,reply_code)
 values(p_message_hmac,p_chat_hmac,p_reply_code) on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;

create or replace function public.cotironda_piloto_reserve_media_mvp095(
 p_message_hmac text,p_chat_hmac text,p_media_id_sha256 text,p_mime text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_key text;v_kind text;v_role text;v_request uuid;n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$'
   or p_chat_hmac !~ '^[a-f0-9]{64}$'
   or p_media_id_sha256 !~ '^[a-f0-9]{64}$'
   or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'text/csv','text/plain')
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
     where only_row and whatsapp_inbound_enabled)then return false;end if;
 select m.participant_key,m.kind,p.participant_role into v_key,v_kind,v_role
 from cotironda_piloto_privado.whapi_inbox m
 join cotironda_piloto_privado.participants p on
   p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
   and m.kind in('image','document') and m.processing_state='needs_review'
   and m.received_at>clock_timestamp()-interval '10 minutes'
   and p.consent_at is not null and p.opted_out_at is null
   and p.participant_role in ('buyer','supplier')
 for update of m;
 if v_key is null then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
   where key=v_key and chat_hmac=p_chat_hmac for update;
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
    where chat_hmac=p_chat_hmac
      and reserved_at>=clock_timestamp()-interval '24 hours')>=(select max_media_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row)
 then return false;end if;
 if v_role='supplier' then
   select count(*),min(i.request_id::text)::uuid into n,v_request
   from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.supplier_key=v_key and i.state='prepared'
    and r.state='prepared' and r.closes_at>clock_timestamp();
   if n<>1 then v_request:=null;end if;
 end if;
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,request_id,kind,mime,media_id_sha256)
 values(p_message_hmac,p_chat_hmac,v_key,v_request,v_kind,p_mime,p_media_id_sha256)
 on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;

create or replace function public.cotironda_piloto_reserve_document_ai_mvp095(
 p_message_hmac text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_key text;v_chat text;n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then return false;end if;
 select a.participant_key,a.chat_hmac into v_key,v_chat
 from cotironda_piloto_privado.media_archive_mvp095 a
 join cotironda_piloto_privado.participants p
   on p.key=a.participant_key and p.chat_hmac=a.chat_hmac
 where a.message_hmac=p_message_hmac and a.state='stored'
   and a.review_state='review_required' and a.ai_reserved_at is null
   and p.consent_at is not null and p.opted_out_at is null;
 if v_key is null then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
   where key=v_key and chat_hmac=v_chat for update;
 select count(*) into n from cotironda_piloto_privado.media_archive_mvp095
 where chat_hmac=v_chat and ai_reserved_at>=clock_timestamp()-interval '24 hours';
 if n>=(select max_document_ai_per_24h from cotironda_piloto_privado.operational_caps_mvp097 where only_row) then return false;end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set ai_reserved_at=clock_timestamp()
 where message_hmac=p_message_hmac and ai_reserved_at is null
   and state='stored' and review_state='review_required';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
