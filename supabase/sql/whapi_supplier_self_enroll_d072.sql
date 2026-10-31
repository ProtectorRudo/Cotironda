-- MVP-024 / D072: opt-in WhatsApp initiated by authenticated supplier.
-- Disposable PG17 CI ONLY. DO NOT deploy in Supabase DEV before #175.
-- A supplier manager clicks a link and sends "COTI ALTA <code>" voluntarily.
-- Tokens are single-use, stored as SHA-256, bound to org+channel, 15min.
-- Incoming messages must pass an authenticated, channel-bound Whapi webhook;
-- never trust the supplier ID from incoming text.
create role cotironda_onboard_owner_d072 nologin noinherit nobypassrls;
create role cotironda_onboard_gateway_d072 nologin noinherit nobypassrls;
grant usage on schema cotironda_private,public to cotironda_onboard_owner_d072;
-- auth.uid() is a schema-qualified function; only USAGE on schema auth is
-- needed, no SELECT/INSERT/UPDATE grants on Auth tables.
grant usage on schema auth to cotironda_onboard_owner_d072;
grant usage on schema cotironda_private to cotironda_onboard_gateway_d072;
grant execute on function cotironda_private.storage_session_active()
 to cotironda_onboard_owner_d072;
grant select on public.organizations,public.organization_members,
 public.supplier_profiles to cotironda_onboard_owner_d072;
create policy d072_organizations_read on public.organizations
 for select to cotironda_onboard_owner_d072 using(true);
create policy d072_members_read on public.organization_members
 for select to cotironda_onboard_owner_d072 using(true);
create policy d072_profiles_read on public.supplier_profiles
 for select to cotironda_onboard_owner_d072 using(true);
grant select,insert on cotironda_private.whapi_contacts_v1
 to cotironda_onboard_owner_d072;
create policy d072_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_onboard_owner_d072 using(true);
create policy d072_contact_insert on cotironda_private.whapi_contacts_v1
 for insert to cotironda_onboard_owner_d072 with check(true);

create table cotironda_private.whapi_onboard_codes_d072 (
 token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
 supplier_org_id uuid not null references public.supplier_profiles(organization_id),
 channel_id text not null check(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 requested_by uuid not null references auth.users(id),
 created_at timestamptz not null default pg_catalog.clock_timestamp(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 consumed_at timestamptz,
 chat_key text check(chat_key ~ '^[a-f0-9]{64}$'),
 message_key text check(message_key ~ '^[a-f0-9]{64}$'),
 check(expires_at>created_at),
 check((consumed_at is null and chat_key is null and message_key is null)
   or (consumed_at is not null and chat_key is not null and message_key is not null)),
 check(not (revoked_at is not null and consumed_at is not null))
);
create index d072_code_limit_idx on cotironda_private.whapi_onboard_codes_d072
 (supplier_org_id,channel_id,created_at);
alter table cotironda_private.whapi_onboard_codes_d072 enable row level security;
revoke all on cotironda_private.whapi_onboard_codes_d072
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert,update(revoked_at,consumed_at,chat_key,message_key)
 on cotironda_private.whapi_onboard_codes_d072 to cotironda_onboard_owner_d072;
create policy d072_codes_read on cotironda_private.whapi_onboard_codes_d072
 for select to cotironda_onboard_owner_d072 using(true);
create policy d072_codes_insert on cotironda_private.whapi_onboard_codes_d072
 for insert to cotironda_onboard_owner_d072 with check(true);
create policy d072_codes_update on cotironda_private.whapi_onboard_codes_d072
 for update to cotironda_onboard_owner_d072 using(true) with check(true);

-- Called only through public function for a logged-in supplier manager.
-- No phone, token hash, email or supplier data returned on failure.
create function cotironda_private.whapi_issue_supplier_code_d072(
 p_supplier uuid,p_channel text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_uid uuid;v_token text;v_hash text;
 v_now timestamptz:=pg_catalog.clock_timestamp();v_issued bigint;
begin
 if p_supplier is null or p_channel is null or
  p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
 then raise exception 'd072_invalid_input' using errcode='22023';end if;
 if cotironda_private.storage_session_active() is distinct from true
 then raise exception 'd072_session_invalid' using errcode='42501';end if;
 v_uid:=auth.uid();
 if v_uid is null or not exists(
  select 1 from public.organizations o
  join public.organization_members m on m.organization_id=o.id
  join public.supplier_profiles p on p.organization_id=o.id
  where o.id=p_supplier and o.organization_type in('supplier','both')
   and m.user_id=v_uid and m.status='active'
   and m.membership_role in('owner','manager'))
 then raise exception 'd072_supplier_not_authorized' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_supplier::text||':'||p_channel,0));
 select count(*) into v_issued from cotironda_private.whapi_onboard_codes_d072
  where supplier_org_id=p_supplier and channel_id=p_channel
   and created_at>v_now-interval '24 hours';
 if v_issued>=5 then
  raise exception 'd072_daily_limit' using errcode='42501';end if;
 -- Do not re-enroll a contact that already opted out or has an active
 -- destination. Manual, audited recovery is required for number changes.
 if exists(select 1 from cotironda_private.whapi_contacts_v1 c
   where c.supplier_org_id=p_supplier and c.channel_id=p_channel)
 then raise exception 'd072_supplier_already_bound' using errcode='42501';end if;
 update cotironda_private.whapi_onboard_codes_d072
  set revoked_at=v_now where supplier_org_id=p_supplier
  and channel_id=p_channel and consumed_at is null and revoked_at is null;
 v_token:=pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   'cotironda-whapi-d072:'||p_channel||':'||v_token,'UTF8')),'hex');
 insert into cotironda_private.whapi_onboard_codes_d072(
  token_hash,supplier_org_id,channel_id,requested_by,expires_at)
 values(v_hash,p_supplier,p_channel,v_uid,v_now+interval '15 minutes');
 return pg_catalog.jsonb_build_object('state','issued','code',v_token,
  'expiresSeconds',900);
end;$fn$;

-- Supplier must be logged in; wrapper is invoked from Auth-enabled server.
create function public.whapi_issue_supplier_code_d072(
 p_supplier uuid,p_channel text)
returns jsonb language sql volatile security definer set search_path='' as $fn$
 select cotironda_private.whapi_issue_supplier_code_d072(
   p_supplier,p_channel);
$fn$;

-- Called ONLY from broker after genuine Whapi webhook authentication.
-- p_chat/p_message are keyed HMAC, NEVER phone or untrusted supplier ID.
create function cotironda_private.whapi_consume_supplier_code_d072(
 p_channel text,p_token text,p_chat text,p_message text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_hash text;v_code cotironda_private.whapi_onboard_codes_d072%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();v_contact record;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_token is null or p_token !~ '^[a-f0-9]{32}$'
  or p_chat is null or p_chat !~ '^[a-f0-9]{64}$'
  or p_message is null or p_message !~ '^[a-f0-9]{64}$'
 then raise exception 'd072_invalid_proof' using errcode='22023';end if;
 v_hash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   'cotironda-whapi-d072:'||p_channel||':'||p_token,'UTF8')),'hex');
 select * into v_code from cotironda_private.whapi_onboard_codes_d072
  where token_hash=v_hash and channel_id=p_channel for update;
 if not found then raise exception 'd072_unknown_code' using errcode='42501';end if;
 if v_code.consumed_at is not null then
  if v_code.chat_key<>p_chat or v_code.message_key<>p_message
  then raise exception 'd072_replay_conflict' using errcode='42501';end if;
  -- Return same org for delivery to D069 after prior vault error.
  if not exists(select 1 from cotironda_private.whapi_contacts_v1 c
    where c.channel_id=p_channel and c.chat_key=p_chat
      and c.supplier_org_id=v_code.supplier_org_id
      and c.opted_out_at is null)
  then raise exception 'd072_replay_revoked' using errcode='42501';end if;
  return pg_catalog.jsonb_build_object('state','already_registered',
    'supplierOrgId',v_code.supplier_org_id);
 end if;
 if v_code.expires_at<=v_now or v_code.revoked_at is not null
 then raise exception 'd072_expired_or_revoked' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(v_code.supplier_org_id::text||':'||p_channel,0));
 -- Supabase login/membership could have been revoked after token issue.
 if not exists(select 1 from public.organizations o
   join public.organization_members m on m.organization_id=o.id
   join public.supplier_profiles p on p.organization_id=o.id
   where o.id=v_code.supplier_org_id and o.organization_type in('supplier','both')
    and m.user_id=v_code.requested_by and m.status='active'
    and m.membership_role in('owner','manager'))
 then raise exception 'd072_owner_revoked' using errcode='42501';end if;
 -- Never overwrite another supplier's chat, re-enable BAJA, or allow two
 -- active phones for the same supplier/channel.
 if exists(select 1 from cotironda_private.whapi_contacts_v1 c
   where (c.channel_id=p_channel and c.chat_key=p_chat)
      or (c.supplier_org_id=v_code.supplier_org_id and c.channel_id=p_channel))
 then raise exception 'd072_contact_conflict' using errcode='42501';end if;
 insert into cotironda_private.whapi_contacts_v1(
  channel_id,chat_key,supplier_org_id,verified_at,consented_at)
 values(p_channel,p_chat,v_code.supplier_org_id,v_now,v_now);
 update cotironda_private.whapi_onboard_codes_d072
  set consumed_at=v_now,chat_key=p_chat,message_key=p_message
  where token_hash=v_hash;
 return pg_catalog.jsonb_build_object('state','registered',
  'supplierOrgId',v_code.supplier_org_id);
end;$fn$;

-- Own definer functions by dedicated role without login or bypassrls.
grant create on schema cotironda_private,public
 to cotironda_onboard_owner_d072;
grant cotironda_onboard_owner_d072 to postgres with set true,inherit false;
alter function cotironda_private.whapi_issue_supplier_code_d072(uuid,text)
 owner to cotironda_onboard_owner_d072;
alter function cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)
 owner to cotironda_onboard_owner_d072;
alter function public.whapi_issue_supplier_code_d072(uuid,text)
 owner to cotironda_onboard_owner_d072;
revoke cotironda_onboard_owner_d072 from postgres;
revoke create on schema cotironda_private,public
 from cotironda_onboard_owner_d072;
revoke all on function
 cotironda_private.whapi_issue_supplier_code_d072(uuid,text),
 cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
revoke all on function public.whapi_issue_supplier_code_d072(uuid,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function public.whapi_issue_supplier_code_d072(uuid,text)
 to authenticated;
grant execute on function
 cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)
 to cotironda_onboard_gateway_d072;
comment on function public.whapi_issue_supplier_code_d072(uuid,text)
 is 'Supplier owner authenticated + live session only, token expires 15 min; no phone or messages sent';
comment on function cotironda_private.whapi_consume_supplier_code_d072(text,text,text,text)
 is 'D072 private webhook gateway only; HMAC authenticated chat, opt-in voluntary, one-use token; no plaintext phone';
