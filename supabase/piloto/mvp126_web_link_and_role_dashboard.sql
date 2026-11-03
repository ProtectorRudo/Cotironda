-- MVP-126: WEB LOGIN ↔ VERIFIED WHATSAPP (pilot only).
-- No signup, no outbound messaging, no contact disclosure.
-- Challenge shown only to a user with a LIVE Supabase Auth session.
-- Linking occurs only from an authenticated WhatsApp incoming message.
create table if not exists cotironda_piloto_privado.web_link_challenges_mvp126 (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 desired_role text not null check (desired_role in ('buyer','supplier')),
 code_sha256 text not null unique check (code_sha256 ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 proof_message_hmac text unique,
 check (expires_at > issued_at and expires_at <= issued_at + interval '10 minutes'),
 check ((consumed_at is null) = (proof_message_hmac is null))
);
create index if not exists web_challenges_user_recent_mvp126
 on cotironda_piloto_privado.web_link_challenges_mvp126(auth_user_id,issued_at desc);

create table if not exists cotironda_piloto_privado.web_account_links_mvp126 (
 id uuid primary key default gen_random_uuid(),
 auth_user_id uuid not null references auth.users(id) on delete cascade,
 participant_key text not null references cotironda_piloto_privado.participants(key),
 participant_role text not null check (participant_role in ('buyer','supplier')),
 challenge_id uuid not null unique references cotironda_piloto_privado.web_link_challenges_mvp126(id),
 proof_message_hmac text not null unique check (proof_message_hmac ~ '^[a-f0-9]{64}$'),
 linked_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz
);
-- One active web identity per WhatsApp participant and vice versa.
-- Multi-company memberships require a later separately audited migration.
create unique index if not exists web_link_active_participant_mvp126
 on cotironda_piloto_privado.web_account_links_mvp126(participant_key)
 where revoked_at is null;
create unique index if not exists web_link_active_user_mvp126
 on cotironda_piloto_privado.web_account_links_mvp126(auth_user_id)
 where revoked_at is null;
alter table cotironda_piloto_privado.web_link_challenges_mvp126 enable row level security;
alter table cotironda_piloto_privado.web_account_links_mvp126 enable row level security;
revoke all on table cotironda_piloto_privado.web_link_challenges_mvp126
 from public,anon,authenticated;
revoke all on table cotironda_piloto_privado.web_account_links_mvp126
 from public,anon,authenticated;

-- Read-only helper: signed JWT alone is insufficient after logout.
-- A session must still exist and the user must be confirmed/unblocked.
create or replace function cotironda_piloto_privado.current_web_user_mvp126()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare uid uuid; claims jsonb; sid text;
begin
 uid:=auth.uid();
 if uid is null then return null;end if;
 claims:=auth.jwt();
 sid:=claims->>'session_id';
 if sid is null or sid !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 then return null;end if;
 if not exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
  where s.id=sid::uuid and s.user_id=uid
   and (s.not_after is null or s.not_after>clock_timestamp())
   and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
   and u.deleted_at is null and not u.is_anonymous
   and (u.banned_until is null or u.banned_until<clock_timestamp()))
 then return null;end if;
 return uid;
end;$$;
revoke all on function cotironda_piloto_privado.current_web_user_mvp126()
 from public,anon,authenticated;
grant execute on function cotironda_piloto_privado.current_web_user_mvp126()
 to authenticated,service_role;

-- User initiates onboarding once. The 96-bit code exists in plaintext
-- only in the HTTP result to THAT verified signed-in user.
create or replace function public.cotironda_piloto_new_web_link_mvp126(p_role text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare uid uuid; code text; digest text; until_at timestamptz; n int;
begin
 uid:=cotironda_piloto_privado.current_web_user_mvp126();
 if uid is null then return jsonb_build_object('state','not_authenticated');end if;
 if p_role not in ('buyer','supplier') then
  return jsonb_build_object('state','invalid_role');end if;
 -- Serialize creation, blocking parallel flood from same web identity.
 perform 1 from auth.users u where u.id=uid for update;
 if exists(select 1 from cotironda_piloto_privado.web_account_links_mvp126 l
  where l.auth_user_id=uid and l.revoked_at is null)
 then return jsonb_build_object('state','already_linked');end if;
 if exists(select 1 from cotironda_piloto_privado.web_link_challenges_mvp126 c
  where c.auth_user_id=uid and c.issued_at>clock_timestamp()-interval '2 minutes')
 then return jsonb_build_object('state','rate_limited');end if;
 select count(*) into n
  from cotironda_piloto_privado.web_link_challenges_mvp126 c
  where c.auth_user_id=uid and c.issued_at>clock_timestamp()-interval '1 day';
 if n>=8 then return jsonb_build_object('state','daily_limit');end if;
 code:=upper(encode(extensions.gen_random_bytes(12),'hex'));
 digest:=encode(extensions.digest(code,'sha256'),'hex');
 until_at:=clock_timestamp()+interval '10 minutes';
 insert into cotironda_piloto_privado.web_link_challenges_mvp126(
  auth_user_id,desired_role,code_sha256,expires_at
 ) values(uid,p_role,digest,until_at);
 return jsonb_build_object('state','issued','code',code,'expires_at',until_at);
end;$$;
revoke all on function public.cotironda_piloto_new_web_link_mvp126(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_new_web_link_mvp126(text)
 to authenticated;

-- SERVICE ROLE only. Caller must first authenticate Whapi webhook, store
-- a unique encrypted message and parse exactly "VINCULAR <24-hex-code>".
-- The SQL independently checks chat ownership, proof freshness and role.
create or replace function public.cotironda_piloto_complete_web_link_mvp126(
 p_chat_hmac text,p_message_hmac text,p_code text)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare c record; p record; received timestamptz; normalized text;
        link_id uuid;
begin
 if p_chat_hmac is null or p_chat_hmac !~ '^[a-f0-9]{64}$'
 or p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_code is null or upper(btrim(p_code)) !~ '^[A-F0-9]{24}$'
 then return jsonb_build_object('state','invalid');end if;
 normalized:=upper(btrim(p_code));
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled)
 then return jsonb_build_object('state','disabled');end if;
 select part.key,part.participant_role into p
 from cotironda_piloto_privado.participants part
 where part.chat_hmac=p_chat_hmac and part.participant_role in ('buyer','supplier')
  and part.consent_at is not null and part.opted_out_at is null
  for update of part;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 select i.received_at into received
 from cotironda_piloto_privado.whapi_inbox i
 where i.message_hmac=p_message_hmac and i.chat_hmac=p_chat_hmac
  and i.participant_key=p.key and i.kind='text'
  and i.received_at>clock_timestamp()-interval '10 minutes'
  and i.plaintext_sha256=encode(extensions.digest('VINCULAR '||normalized,'sha256'),'hex');
 if not found then return jsonb_build_object('state','not_permitted');end if;
 select wc.id,wc.auth_user_id,wc.issued_at,wc.expires_at into c
 from cotironda_piloto_privado.web_link_challenges_mvp126 wc
 join auth.users u on u.id=wc.auth_user_id
 where wc.code_sha256=encode(extensions.digest(normalized,'sha256'),'hex')
  and wc.desired_role=p.participant_role and wc.consumed_at is null
  and wc.issued_at<received and wc.expires_at>clock_timestamp()
  and u.deleted_at is null and not u.is_anonymous
  and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)
  and (u.banned_until is null or u.banned_until<clock_timestamp())
 for update of wc;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if not exists(select 1 from auth.sessions s
  where s.user_id=c.auth_user_id and
   (s.not_after is null or s.not_after>clock_timestamp()))
 then return jsonb_build_object('state','session_invalid');end if;
 insert into cotironda_piloto_privado.web_account_links_mvp126(
  auth_user_id,participant_key,participant_role,challenge_id,proof_message_hmac
 ) values(c.auth_user_id,p.key,p.participant_role,c.id,p_message_hmac)
 on conflict do nothing returning id into link_id;
 if link_id is null then return jsonb_build_object('state','already_linked');end if;
 update cotironda_piloto_privado.web_link_challenges_mvp126
 set consumed_at=clock_timestamp(),proof_message_hmac=p_message_hmac
 where id=c.id;
 return jsonb_build_object('state','linked','role',p.participant_role);
end;$$;
revoke all on function public.cotironda_piloto_complete_web_link_mvp126(text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_complete_web_link_mvp126(text,text,text)
 to service_role;

-- Lists only own request metadata; NEVER returns original supplier quotes,
-- contact details, message content, or unapproved competitive prices.
create or replace function public.cotironda_piloto_my_rounds_mvp126()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare uid uuid; bound record; result jsonb:='[]'::jsonb;
begin
 uid:=cotironda_piloto_privado.current_web_user_mvp126();
 if uid is null then return jsonb_build_object('state','not_authenticated');end if;
 select l.participant_key,l.participant_role into bound
 from cotironda_piloto_privado.web_account_links_mvp126 l
 join cotironda_piloto_privado.participants p
  on p.key=l.participant_key and p.participant_role=l.participant_role
 where l.auth_user_id=uid and l.revoked_at is null
  and p.consent_at is not null and p.opted_out_at is null;
 if not found then return jsonb_build_object('state','not_linked');end if;
 if bound.participant_role='buyer' then
  select coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb)
  into result from (
   select r.created_at,jsonb_build_object(
     'round_id',r.id,'delivery_city',r.delivery_city,'state',r.state,
     'created_at',r.created_at,'closes_at',r.closes_at,
     'items_count',(select count(*) from cotironda_piloto_privado.request_lines ln
       where ln.request_id=r.id),
     'quotes_received_unverified',(select count(distinct ov.supplier_key)
       from cotironda_piloto_privado.offer_versions ov where ov.request_id=r.id)
    ) as row_data
   from cotironda_piloto_privado.requests r
   where r.buyer_key=bound.participant_key
   order by r.created_at desc limit 50
  ) x;
 else
  select coalesce(jsonb_agg(x.row_data order by x.created_at desc),'[]'::jsonb)
  into result from (
   select r.created_at,jsonb_build_object(
     'round_id',r.id,'delivery_city',r.delivery_city,'state',r.state,
     'created_at',r.created_at,'closes_at',r.closes_at,
     'invitation_state',i.state,
     'items_count',(select count(*) from cotironda_piloto_privado.request_lines ln
       where ln.request_id=r.id),
     'my_quote_versions',(select count(*) from cotironda_piloto_privado.offer_versions ov
       where ov.request_id=r.id and ov.supplier_key=bound.participant_key)
    ) as row_data
   from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.supplier_key=bound.participant_key
   order by r.created_at desc limit 50
  ) x;
 end if;
 return jsonb_build_object('state','linked','role',bound.participant_role,'rounds',result);
end;$$;
revoke all on function public.cotironda_piloto_my_rounds_mvp126()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_my_rounds_mvp126()
 to authenticated;
