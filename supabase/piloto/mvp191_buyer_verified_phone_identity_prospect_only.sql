-- MVP191 — PROPOSED, DEVELOPMENT ONLY. DO NOT INSTALL without explicit
-- PILOT publication authority. Depends on MVP178 original_share_policy (OFF).
--
-- Identity proof for one buyer round, not a document download permission.
-- No new table, service-role API, contact lookup, redirect or WhatsApp message.
--
-- Supabase Auth phone-confirmed users only; session_id must still exist in
-- auth.sessions. The original WhatsApp chat ID was SHA-256-hashed privately
-- in participant_channels_mvp109 from authenticated inbound Whapi.
-- The confirmed phone is compared INSIDE PostgreSQL to that private digest.
-- Neither phone nor digest is returned. No raw_user_meta_data is trusted.
--
-- A shared buyer tracking URL or an email-only login is NEVER sufficient.
-- This returns boolean only, and only for already closed NEW rounds after
-- the independently authorised prospective originals policy activation.
create or replace function public.cotironda_piloto_buyer_identity_mvp191(
 p_request_id uuid
) returns boolean
language sql volatile security definer
set search_path='' as $fn$
 select
  p_request_id is not null
  and (auth.jwt()->>'role')='authenticated'
  and (auth.jwt()->>'iss')=
      'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1'
  and (auth.uid() is not null)
  and exists (
    select 1
    from auth.users u
    join auth.sessions sess
     on sess.user_id=u.id
    join cotironda_piloto_privado.requests r
     on r.id=p_request_id
    join cotironda_piloto_privado.original_share_policy_mvp178 policy
     on policy.singleton=true
     and policy.enabled=true and policy.activated_at is not null
     and r.created_at>policy.activated_at
    join cotironda_piloto_privado.participants buyer
     on buyer.key=r.buyer_key
     and buyer.participant_role='buyer'
     and buyer.consent_at is not null
     and buyer.opted_out_at is null
     and buyer.chat_hmac ~ '^[a-f0-9]{64}$'
    join cotironda_piloto_privado.participant_channels_mvp109 contact
     on contact.participant_key=buyer.key
     and contact.chat_hmac=buyer.chat_hmac
    join cotironda_piloto_privado.whapi_inbox proof
     on proof.message_hmac=contact.authenticated_message_hmac
     and proof.participant_key=buyer.key
     and proof.chat_hmac=buyer.chat_hmac
    where u.id=auth.uid()
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until<=clock_timestamp())
      and u.is_anonymous is false
      and u.phone_confirmed_at is not null
      and u.phone ~ '^[+]?[1-9][0-9]{7,15}$'
      -- AUTH-confirmed phone only. The plaintext verified identity never
      -- crosses the service response or enters a new business table.
      and contact.contact_sha256=encode(extensions.digest(
       regexp_replace(u.phone,'^[+]','','')||'@s.whatsapp.net',
       'sha256'
      ),'hex')
      and sess.id=case
        when (auth.jwt()->>'session_id') ~*
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        then (auth.jwt()->>'session_id')::uuid
        else null::uuid end
      and (sess.not_after is null or sess.not_after>clock_timestamp())
      and case when (auth.jwt()->>'exp') ~ '^[0-9]{9,11}$'
       then (auth.jwt()->>'exp')::bigint >
         extract(epoch from clock_timestamp())::bigint
       else false end
      and r.state='closed'
      and r.closed_at is not null
      and r.closed_at>=r.closes_at
      and r.closed_at<=clock_timestamp()
      and not exists(
       select 1
       from cotironda_piloto_privado.participant_channels_mvp109 duplicate
       join cotironda_piloto_privado.participants buyer2
        on buyer2.key=duplicate.participant_key
       where duplicate.contact_sha256=contact.contact_sha256
        and duplicate.participant_key<>buyer.key
        and buyer2.participant_role='buyer'
        and buyer2.opted_out_at is null
      )
  );
$fn$;

-- SECURITY DEFINER functions default to PUBLIC execute.
-- Remove all grants, including service_role: only the normal JWT of a
-- verified authenticated user is allowed to invoke this boolean check.
revoke all on function
 public.cotironda_piloto_buyer_identity_mvp191(uuid)
 from public,anon,authenticated,service_role;
grant execute on function
 public.cotironda_piloto_buyer_identity_mvp191(uuid)
 to authenticated;
