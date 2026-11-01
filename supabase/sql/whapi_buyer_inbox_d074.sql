-- MVP-043 / D074: BUYER inbox for shared Whapi channel, PostgreSQL17 CI ONLY.
-- Requires D028, D030, D032. Not a DEV migration; backup/restore #175 first.
-- The browser, anon, authenticated and service_role get NO SELECT/EXECUTE.
-- Chat/message IDs MUST already be HMAC from trusted server, text is AES-GCM.
create table cotironda_private.whapi_buyer_contacts_d074 (
 channel_id text not null check(channel_id ~ '^[A-Za-z0-9_-]{4,64}$'),
 chat_key text not null check(chat_key ~ '^[a-f0-9]{64}$'),
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 verified_at timestamptz not null,
 consented_at timestamptz not null,
 opted_out_at timestamptz,
 primary key(channel_id,chat_key),
 check(opted_out_at is null or opted_out_at>=consented_at)
);
create table cotironda_private.whapi_buyer_inbox_d074 (
 channel_id text not null,
 message_key text not null check(message_key ~ '^[a-f0-9]{64}$'),
 chat_key text not null,
 buyer_org_id uuid not null references public.organizations(id) on delete restrict,
 payload_fingerprint text not null check(payload_fingerprint ~ '^[a-f0-9]{64}$'),
 kind text not null check(kind in ('text','image','document','audio','voice','opt_out')),
 crypto_key_id text not null default 'aes_2026_a'
  check(crypto_key_id ~ '^[a-z][a-z0-9_]{2,40}$' and crypto_key_id <> 'legacy_d029'),
 payload_ciphertext bytea,
 payload_nonce bytea,
 payload_tag bytea,
 source_unix bigint not null check(source_unix>0),
 status text not null check(status in ('pendiente_interpretacion','opt_out_registrado')),
 received_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,message_key),
 foreign key(channel_id,chat_key)
  references cotironda_private.whapi_buyer_contacts_d074(channel_id,chat_key)
  on delete restrict,
 check(
  (kind='opt_out' and status='opt_out_registrado' and
   payload_ciphertext is null and payload_nonce is null and payload_tag is null)
  or
  (kind<>'opt_out' and status='pendiente_interpretacion' and
   payload_ciphertext is not null and pg_catalog.octet_length(payload_ciphertext) between 1 and 8192
   and pg_catalog.octet_length(payload_nonce)=12
   and pg_catalog.octet_length(payload_tag)=16)
 )
);
create index whapi_buyer_inbox_pending_idx_d074
 on cotironda_private.whapi_buyer_inbox_d074(received_at)
 where status='pendiente_interpretacion';

create function cotironda_private.whapi_guard_buyer_contact_d074()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 if (new.channel_id,new.chat_key,new.buyer_org_id,new.verified_at,new.consented_at)
    is distinct from
    (old.channel_id,old.chat_key,old.buyer_org_id,old.verified_at,old.consented_at)
    or (old.opted_out_at is not null and
        new.opted_out_at is distinct from old.opted_out_at)
    or (old.opted_out_at is null and new.opted_out_at is null)
 then raise exception 'd074_contact_immutable_or_optout_reset' using errcode='42501';
 end if;
 return new;
end;$fn$;
create trigger whapi_buyer_contact_immutable_d074 before update
 on cotironda_private.whapi_buyer_contacts_d074
 for each row execute function cotironda_private.whapi_guard_buyer_contact_d074();

create trigger whapi_buyer_inbox_immutable_d074 before update or delete
 on cotironda_private.whapi_buyer_inbox_d074
 for each row execute function cotironda_private.whapi_inbox_immutable_v1();

alter table cotironda_private.whapi_buyer_contacts_d074 enable row level security;
alter table cotironda_private.whapi_buyer_inbox_d074 enable row level security;
revoke all on cotironda_private.whapi_buyer_contacts_d074,
 cotironda_private.whapi_buyer_inbox_d074
 from public,anon,authenticated,service_role,cotironda_app;
grant select,update(opted_out_at) on cotironda_private.whapi_buyer_contacts_d074
 to cotironda_whapi_inbox_writer;
grant select,insert on cotironda_private.whapi_buyer_inbox_d074
 to cotironda_whapi_inbox_writer;
create policy d074_contact_writer_read on cotironda_private.whapi_buyer_contacts_d074
 for select to cotironda_whapi_inbox_writer using(true);
create policy d074_contact_writer_optout on cotironda_private.whapi_buyer_contacts_d074
 for update to cotironda_whapi_inbox_writer using(true) with check(true);
create policy d074_inbox_writer_read on cotironda_private.whapi_buyer_inbox_d074
 for select to cotironda_whapi_inbox_writer using(true);
create policy d074_inbox_writer_insert on cotironda_private.whapi_buyer_inbox_d074
 for insert to cotironda_whapi_inbox_writer with check(true);

-- Both enrollment paths share an advisory lock and disallow a single
-- verified channel/chat from becoming both supplier AND buyer.
-- There is intentionally NO public/gateway enrollment function in D074.
create function cotironda_private.whapi_no_dual_role_d074()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
 perform pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('whapi-role:'||new.channel_id||':'||new.chat_key,0));
 if tg_table_name='whapi_buyer_contacts_d074' then
  if not exists(select 1 from public.organizations o where o.id=new.buyer_org_id
    and o.organization_type in ('buyer','both'))
  then raise exception 'd074_buyer_org_invalid' using errcode='42501';end if;
  if exists(select 1 from cotironda_private.whapi_contacts_v1
    where channel_id=new.channel_id and chat_key=new.chat_key)
  then raise exception 'd074_dual_role_denied' using errcode='23505';end if;
 else
  if exists(select 1 from cotironda_private.whapi_buyer_contacts_d074
    where channel_id=new.channel_id and chat_key=new.chat_key)
  then raise exception 'd074_dual_role_denied' using errcode='23505';end if;
 end if;
 return new;
end;$fn$;
create trigger whapi_buyer_contact_no_dual_d074 before insert
 on cotironda_private.whapi_buyer_contacts_d074
 for each row execute function cotironda_private.whapi_no_dual_role_d074();
create trigger whapi_supplier_contact_no_dual_d074 before insert
 on cotironda_private.whapi_contacts_v1
 for each row execute function cotironda_private.whapi_no_dual_role_d074();

-- Only the existing NOLOGIN/EXECUTE-only Whapi gateway may call these.
create function cotironda_private.whapi_resolve_buyer_d074(
 p_channel text,p_chat_key text
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare v_contact cotironda_private.whapi_buyer_contacts_d074%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
   or p_chat_key is null or p_chat_key !~ '^[a-f0-9]{64}$'
 then raise exception 'd074_lookup_invalid' using errcode='22023';end if;
 select * into v_contact from cotironda_private.whapi_buyer_contacts_d074
  where channel_id=p_channel and chat_key=p_chat_key
   and verified_at<=pg_catalog.clock_timestamp()
   and consented_at<=pg_catalog.clock_timestamp()
   and opted_out_at is null;
 if not found then return null;end if;
 if exists(select 1 from cotironda_private.whapi_contacts_v1
   where channel_id=p_channel and chat_key=p_chat_key)
 then return null;end if;
 return pg_catalog.jsonb_build_object('buyerOrgId',v_contact.buyer_org_id::text,
  'consentimientoContactoVigente',true,'chatHabilitado',true);
end;$fn$;

create function cotironda_private.whapi_record_buyer_d074(
 p_channel text,p_chat_key text,p_message_key text,p_fingerprint text,
 p_kind text,p_cipher bytea,p_nonce bytea,p_tag bytea,
 p_source_unix bigint,p_key_id text
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_contact cotironda_private.whapi_buyer_contacts_d074%rowtype;
 v_prev cotironda_private.whapi_buyer_inbox_d074%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
   or p_chat_key is null or p_chat_key !~ '^[a-f0-9]{64}$'
   or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
   or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
   or p_kind is null or p_kind not in ('text','image','document','audio','voice')
   or p_cipher is null or pg_catalog.octet_length(p_cipher) not between 1 and 8192
   or pg_catalog.octet_length(p_nonce) is distinct from 12
   or pg_catalog.octet_length(p_tag) is distinct from 16
   or p_source_unix is null or p_source_unix<1
   or p_key_id is null or p_key_id !~ '^[a-z][a-z0-9_]{2,40}$'
   or p_key_id='legacy_d029'
 then raise exception 'd074_payload_invalid' using errcode='22023';end if;
 select * into v_contact from cotironda_private.whapi_buyer_contacts_d074
  where channel_id=p_channel and chat_key=p_chat_key for update;
 if not found or v_contact.verified_at>pg_catalog.clock_timestamp()
 then raise exception 'd074_contact_not_verified' using errcode='42501';end if;
 if exists(select 1 from cotironda_private.whapi_contacts_v1
   where channel_id=p_channel and chat_key=p_chat_key)
 then raise exception 'd074_dual_role_denied' using errcode='42501';end if;
 select * into v_prev from cotironda_private.whapi_buyer_inbox_d074
  where channel_id=p_channel and message_key=p_message_key;
 if found then
  if v_prev.chat_key<>p_chat_key or v_prev.payload_fingerprint<>p_fingerprint
    or v_prev.buyer_org_id<>v_contact.buyer_org_id or v_prev.kind<>p_kind
  then raise exception 'd074_event_collision' using errcode='23505';end if;
  return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',true);
 end if;
 if v_contact.opted_out_at is not null or
   v_contact.consented_at>pg_catalog.clock_timestamp()
 then raise exception 'd074_contact_revoked' using errcode='42501';end if;
 insert into cotironda_private.whapi_buyer_inbox_d074
 (channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
  crypto_key_id,payload_ciphertext,payload_nonce,payload_tag,source_unix,status)
 values(p_channel,p_message_key,p_chat_key,v_contact.buyer_org_id,p_fingerprint,
  p_kind,p_key_id,p_cipher,p_nonce,p_tag,p_source_unix,'pendiente_interpretacion');
 return pg_catalog.jsonb_build_object('estado','entrada_persistida','repetido',false);
end;$fn$;

create function cotironda_private.whapi_buyer_optout_d074(
 p_channel text,p_chat_key text,p_message_key text,p_fingerprint text,
 p_source_unix bigint
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_contact cotironda_private.whapi_buyer_contacts_d074%rowtype;
 v_prev cotironda_private.whapi_buyer_inbox_d074%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
   or p_chat_key is null or p_chat_key !~ '^[a-f0-9]{64}$'
   or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
   or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$'
   or p_source_unix is null or p_source_unix<1
 then raise exception 'd074_optout_invalid' using errcode='22023';end if;
 select * into v_contact from cotironda_private.whapi_buyer_contacts_d074
  where channel_id=p_channel and chat_key=p_chat_key for update;
 if not found or v_contact.verified_at>pg_catalog.clock_timestamp()
 then raise exception 'd074_contact_not_verified' using errcode='42501';end if;
 select * into v_prev from cotironda_private.whapi_buyer_inbox_d074
  where channel_id=p_channel and message_key=p_message_key;
 if found then
  if v_prev.chat_key<>p_chat_key or v_prev.payload_fingerprint<>p_fingerprint
   or v_prev.kind<>'opt_out' or v_prev.buyer_org_id<>v_contact.buyer_org_id
  then raise exception 'd074_event_collision' using errcode='23505';end if;
  return pg_catalog.jsonb_build_object('estado','baja_registrada','repetido',true);
 end if;
 if v_contact.opted_out_at is null then
  update cotironda_private.whapi_buyer_contacts_d074
   set opted_out_at=pg_catalog.clock_timestamp()
   where channel_id=p_channel and chat_key=p_chat_key;
 end if;
 insert into cotironda_private.whapi_buyer_inbox_d074
 (channel_id,message_key,chat_key,buyer_org_id,payload_fingerprint,kind,
  crypto_key_id,source_unix,status)
 values(p_channel,p_message_key,p_chat_key,v_contact.buyer_org_id,p_fingerprint,
  'opt_out','aes_2026_a',p_source_unix,'opt_out_registrado');
 return pg_catalog.jsonb_build_object('estado','baja_registrada','repetido',false);
end;$fn$;

-- SECURITY DEFINER rights are always those of the low-privilege writer.
grant create on schema cotironda_private to cotironda_whapi_inbox_writer;
grant cotironda_whapi_inbox_writer to postgres with set true,inherit false;
alter function cotironda_private.whapi_no_dual_role_d074()
 owner to cotironda_whapi_inbox_writer;
alter function cotironda_private.whapi_resolve_buyer_d074(text,text)
 owner to cotironda_whapi_inbox_writer;
alter function cotironda_private.whapi_record_buyer_d074(
 text,text,text,text,text,bytea,bytea,bytea,bigint,text)
 owner to cotironda_whapi_inbox_writer;
alter function cotironda_private.whapi_buyer_optout_d074(
 text,text,text,text,bigint)
 owner to cotironda_whapi_inbox_writer;
revoke cotironda_whapi_inbox_writer from postgres;
revoke create on schema cotironda_private from cotironda_whapi_inbox_writer;

revoke all on function cotironda_private.whapi_no_dual_role_d074(),
 cotironda_private.whapi_resolve_buyer_d074(text,text),
 cotironda_private.whapi_record_buyer_d074(
  text,text,text,text,text,bytea,bytea,bytea,bigint,text),
 cotironda_private.whapi_buyer_optout_d074(text,text,text,text,bigint)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_resolve_buyer_d074(text,text),
 cotironda_private.whapi_record_buyer_d074(
  text,text,text,text,text,bytea,bytea,bytea,bigint,text),
 cotironda_private.whapi_buyer_optout_d074(text,text,text,text,bigint)
 to cotironda_whapi_gateway;
