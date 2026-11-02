-- MVP-109: encryption is performed in authenticated Edge using AES-GCM with
-- AAD of the authenticated chat HMAC. These tables only persist ciphertext.
-- Never infer recoverable WhatsApp numbers from HMAC values.
create table cotironda_piloto_privado.participant_channels_mvp109(
 participant_key text primary key
  references cotironda_piloto_privado.participants(key),
 chat_hmac text not null check(chat_hmac ~ '^[a-f0-9]{64}$'),
 contact_sha256 text not null check(contact_sha256 ~ '^[a-f0-9]{64}$'),
 nonce_b64 text not null check(length(nonce_b64) between 16 and 40),
 ciphertext_b64 text not null check(length(ciphertext_b64) between 32 and 300),
 authenticated_message_hmac text not null
  references cotironda_piloto_privado.whapi_inbox(message_hmac),
 bound_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.participant_channels_mvp109
 enable row level security;
revoke all on cotironda_piloto_privado.participant_channels_mvp109
 from public,anon,authenticated,service_role;
create trigger participant_channels_immutable_mvp109
 before update or delete on
 cotironda_piloto_privado.participant_channels_mvp109
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Mutable only to allow an explicit later withdrawal.
create table cotironda_piloto_privado.contact_reveal_consents_mvp109(
 participant_key text primary key
  references cotironda_piloto_privado.participants(key),
 approved_at timestamptz,
 revoked_at timestamptz,
 source_message_hmac text not null
  references cotironda_piloto_privado.whapi_inbox(message_hmac),
 check((approved_at is not null) or (revoked_at is not null))
);
alter table cotironda_piloto_privado.contact_reveal_consents_mvp109
 enable row level security;
revoke all on cotironda_piloto_privado.contact_reveal_consents_mvp109
 from public,anon,authenticated,service_role;

create function public.cotironda_piloto_bind_contact_mvp109(
 p_message_hmac text,p_chat_hmac text,p_contact_sha256 text,
 p_nonce_b64 text,p_ciphertext_b64 text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare participant text; existing record;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_chat_hmac is null or p_chat_hmac !~ '^[a-f0-9]{64}$'
  or p_contact_sha256 is null or p_contact_sha256 !~ '^[a-f0-9]{64}$'
  or p_nonce_b64 is null or length(p_nonce_b64) not between 16 and 40
  or p_ciphertext_b64 is null or length(p_ciphertext_b64) not between 32 and 300
 then return jsonb_build_object('state','invalid');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
   where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled');end if;
 select p.key into participant
 from cotironda_piloto_privado.whapi_inbox m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
  and m.received_at>clock_timestamp()-interval '15 minutes'
  and p.participant_role in ('buyer','supplier')
  and p.consent_at is not null and p.opted_out_at is null
 for update of p;
 if participant is null then
  return jsonb_build_object('state','not_permitted');end if;
 select chat_hmac,contact_sha256 into existing
 from cotironda_piloto_privado.participant_channels_mvp109
 where participant_key=participant;
 if found then
  return jsonb_build_object('state',case when
    existing.chat_hmac=p_chat_hmac and
    existing.contact_sha256=p_contact_sha256
    then 'already_bound' else 'identity_conflict' end);
 end if;
 insert into cotironda_piloto_privado.participant_channels_mvp109(
  participant_key,chat_hmac,contact_sha256,nonce_b64,ciphertext_b64,
  authenticated_message_hmac)
 values(participant,p_chat_hmac,p_contact_sha256,p_nonce_b64,
  p_ciphertext_b64,p_message_hmac);
 return jsonb_build_object('state','bound');
end;$fn$;
revoke all on function
 public.cotironda_piloto_bind_contact_mvp109(text,text,text,text,text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_bind_contact_mvp109(text,text,text,text,text)
 to service_role;

-- A one-time explicitly worded consent command is handled BEFORE the
-- legacy supplier-message quote classifier, so it can never be misread as
-- a new price or accidental offer revision.
create function public.cotironda_piloto_contact_command_mvp109(
 p_message_hmac text,p_chat_hmac text,p_action text,
 p_nonce_b64 text,p_ciphertext_b64 text,p_plaintext_sha256 text,
 p_source_unix bigint,p_contact_sha256 text,
 p_contact_nonce_b64 text,p_contact_ciphertext_b64 text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare participant text;expected_digest text;result jsonb;
begin
 if p_action not in ('approve','revoke') or
  p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$' or
  p_chat_hmac is null or p_chat_hmac !~ '^[a-f0-9]{64}$' or
  p_plaintext_sha256 is null or p_plaintext_sha256 !~ '^[a-f0-9]{64}$' or
  p_nonce_b64 is null or length(p_nonce_b64) not between 16 and 40 or
  p_ciphertext_b64 is null or length(p_ciphertext_b64) not between 32 and 500 or
  p_source_unix is null or abs(p_source_unix-
   extract(epoch from clock_timestamp())::bigint)>300
 then return jsonb_build_object('state','invalid');end if;
 expected_digest:=encode(extensions.digest(
  case when p_action='approve' then 'COTI CONTACTOS SI'
   else 'COTI CONTACTOS NO' end,'sha256'),'hex');
 if p_plaintext_sha256<>expected_digest
 then return jsonb_build_object('state','invalid_phrase');end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled');end if;
 select p.key into participant
 from cotironda_piloto_privado.participants p
 where p.chat_hmac=p_chat_hmac
  and p.participant_role in ('buyer','supplier')
  and p.consent_at is not null and p.opted_out_at is null
 for update of p;
 if participant is null then
  return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.whapi_inbox
    where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','duplicate');end if;
 insert into cotironda_piloto_privado.whapi_inbox(
  message_hmac,chat_hmac,participant_key,kind,nonce_b64,ciphertext_b64,
  plaintext_sha256,source_unix,processing_state)
 values(p_message_hmac,p_chat_hmac,participant,'text',
  p_nonce_b64,p_ciphertext_b64,p_plaintext_sha256,p_source_unix,'needs_review');
 result:=public.cotironda_piloto_bind_contact_mvp109(
  p_message_hmac,p_chat_hmac,p_contact_sha256,
  p_contact_nonce_b64,p_contact_ciphertext_b64);
 if result->>'state' not in ('bound','already_bound') then
  raise exception 'mvp109_cannot_bind_contact' using errcode='23514';end if;
 insert into cotironda_piloto_privado.contact_reveal_consents_mvp109(
  participant_key,approved_at,revoked_at,source_message_hmac)
 values(participant,case when p_action='approve' then clock_timestamp()
   else null end,
   case when p_action='revoke' then clock_timestamp() else null end,
   p_message_hmac)
 on conflict(participant_key) do update
 set approved_at=case when p_action='approve' then clock_timestamp()
   else cotironda_piloto_privado.contact_reveal_consents_mvp109.approved_at end,
  revoked_at=case when p_action='revoke' then clock_timestamp()
   else null end,
  source_message_hmac=p_message_hmac;
 return jsonb_build_object('state',
  case when p_action='approve' then 'consented' else 'revoked' end);
end;$fn$;
revoke all on function
 public.cotironda_piloto_contact_command_mvp109(
 text,text,text,text,text,text,bigint,text,text,text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_contact_command_mvp109(
 text,text,text,text,text,text,bigint,text,text,text)
 to service_role;

-- Private finalist contact snapshot, ciphertext ONLY. Never feed directly
-- to buyer tracking page or public endpoint. Call after a selected plan,
-- after 4-day deadline, rechecking specific consent at action time.
create function public.cotironda_piloto_finalist_contacts_mvp109(
 p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare req_ record;contacts jsonb;needed integer;valid_count integer;
begin
 select rq.id,rq.closes_at,rq.state,plan.supplier_keys,
   plan.candidate_count,rq.buyer_key
 into req_ from cotironda_piloto_privado.requests rq
 join cotironda_piloto_privado.finalist_coverage_plans_mvp108 plan
  on plan.request_id=rq.id and plan.state in
   ('two_complete_alternatives','one_complete_alternative')
 where rq.id=p_request and rq.state='closed'
  and rq.closes_at<=clock_timestamp();
 if not found then return jsonb_build_object('state','not_permitted');end if;
 needed:=req_.candidate_count+1;
 select count(*) into valid_count
 from cotironda_piloto_privado.participants p
 join cotironda_piloto_privado.participant_channels_mvp109 ch
  on ch.participant_key=p.key and ch.chat_hmac=p.chat_hmac
 join cotironda_piloto_privado.contact_reveal_consents_mvp109 c
  on c.participant_key=p.key and c.approved_at is not null
   and c.revoked_at is null
 where (p.key=req_.buyer_key or p.key=any(req_.supplier_keys))
  and p.consent_at is not null and p.opted_out_at is null;
 if valid_count<>needed then
  return jsonb_build_object('state','consent_or_contact_missing');end if;
 select jsonb_agg(jsonb_build_object(
  'role',case when p.key=req_.buyer_key then 'buyer' else 'supplier' end,
  'participant_key',p.key,'chat_hmac',ch.chat_hmac,
  'nonce_b64',ch.nonce_b64,'ciphertext_b64',ch.ciphertext_b64)
  order by case when p.key=req_.buyer_key then 0 else 1 end,p.key)
 into contacts
 from cotironda_piloto_privado.participants p
 join cotironda_piloto_privado.participant_channels_mvp109 ch
  on ch.participant_key=p.key and ch.chat_hmac=p.chat_hmac
 join cotironda_piloto_privado.contact_reveal_consents_mvp109 c
  on c.participant_key=p.key and c.approved_at is not null
   and c.revoked_at is null
 where (p.key=req_.buyer_key or p.key=any(req_.supplier_keys))
  and p.consent_at is not null and p.opted_out_at is null;
 return jsonb_build_object('state','ready_private',
  'count',needed,'contacts_encrypted',contacts,
  'messages_sent',false);
end;$fn$;
revoke all on function public.cotironda_piloto_finalist_contacts_mvp109(uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finalist_contacts_mvp109(uuid)
 to service_role;
