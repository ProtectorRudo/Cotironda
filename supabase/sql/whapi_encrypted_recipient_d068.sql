-- MVP-019 D068: encrypted, server-only Whapi recipient vault.
-- PostgreSQL17 DISPOSABLE CI ONLY. No DEV migration; no external sends.
-- The original D028 HMAC is NOT reversible; a broker must securely seal the
-- real recipient when the verified contact is first registered.
create role cotironda_recipient_owner_d068 nologin noinherit nobypassrls;
create role cotironda_recipient_gateway_d068 nologin noinherit nobypassrls;
grant usage on schema cotironda_private
 to cotironda_recipient_owner_d068,cotironda_recipient_gateway_d068;

create table cotironda_private.whapi_recipient_vault_d068(
 channel_id text not null,
 chat_key text not null check(chat_key ~ '^[0-9a-f]{64}$'),
 supplier_org_id uuid not null,
 crypto_key_id text not null check(crypto_key_id ~ '^[a-z][a-z0-9_]{2,40}$'),
 nonce bytea not null check(octet_length(nonce)=12),
 cipher bytea not null check(octet_length(cipher) between 20 and 70),
 tag bytea not null check(octet_length(tag)=16),
 registered_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,chat_key),
 foreign key(channel_id,chat_key)
  references cotironda_private.whapi_contacts_v1(channel_id,chat_key)
  on delete restrict
);
create index d068_vault_supplier_idx
 on cotironda_private.whapi_recipient_vault_d068(supplier_org_id,channel_id);
alter table cotironda_private.whapi_recipient_vault_d068 enable row level security;
revoke all on cotironda_private.whapi_recipient_vault_d068
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_recipient_vault_d068
 to cotironda_recipient_owner_d068;
grant select on cotironda_private.whapi_contacts_v1
 to cotironda_recipient_owner_d068;
grant execute on function cotironda_private.preview_invitation_packet_d066(uuid,uuid,text)
 to cotironda_recipient_owner_d068;
create policy d068_vault_read on cotironda_private.whapi_recipient_vault_d068
 for select to cotironda_recipient_owner_d068 using(true);
create policy d068_vault_insert on cotironda_private.whapi_recipient_vault_d068
 for insert to cotironda_recipient_owner_d068 with check(true);
create policy d068_contact_read on cotironda_private.whapi_contacts_v1
 for select to cotironda_recipient_owner_d068 using(true);
create function cotironda_private.reject_recipient_mutation_d068()
returns trigger language plpgsql security invoker set search_path='' as $fn$
begin
 raise exception 'd068_recipient_vault_immutable' using errcode='42501';
end;$fn$;
create trigger d068_vault_immutable before update or delete
 on cotironda_private.whapi_recipient_vault_d068
 for each row execute function cotironda_private.reject_recipient_mutation_d068();

create function cotironda_private.whapi_store_recipient_d068(
 p_channel text,p_chat text,p_supplier uuid,p_key_id text,
 p_nonce bytea,p_cipher bytea,p_tag bytea
) returns jsonb
language plpgsql volatile security definer set search_path='' as $fn$
declare v_old cotironda_private.whapi_recipient_vault_d068%rowtype;
 v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_chat is null or p_chat !~ '^[a-f0-9]{64}$'
  or p_supplier is null or p_key_id is null
  or p_key_id !~ '^[a-z][a-z0-9_]{2,40}$'
  or p_nonce is null or octet_length(p_nonce)<>12
  or p_cipher is null or octet_length(p_cipher) not between 20 and 70
  or p_tag is null or octet_length(p_tag)<>16
 then raise exception 'd068_invalid_input' using errcode='22023';end if;
 -- Check actual verified/consented supplier binding, never rely on client.
 if not exists(select 1 from cotironda_private.whapi_contacts_v1 c
   where c.channel_id=p_channel and c.chat_key=p_chat
   and c.supplier_org_id=p_supplier
   and c.verified_at<=v_now and c.consented_at<=v_now
   and c.opted_out_at is null)
 then raise exception 'd068_contact_not_authorized' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(
   pg_catalog.hashtextextended(p_channel||':'||p_chat,0));
 select * into v_old from cotironda_private.whapi_recipient_vault_d068
  where channel_id=p_channel and chat_key=p_chat;
 if found then
   if v_old.supplier_org_id<>p_supplier or v_old.crypto_key_id<>p_key_id
   then raise exception 'd068_recipient_conflict' using errcode='23505';end if;
   -- Never overwrite an existing identity with a different ciphertext.
   -- The broker verifies HMAC -> plaintext before attempting to save.
   return pg_catalog.jsonb_build_object('state','already_saved');
 end if;
 insert into cotironda_private.whapi_recipient_vault_d068
  (channel_id,chat_key,supplier_org_id,crypto_key_id,nonce,cipher,tag)
  values(p_channel,p_chat,p_supplier,p_key_id,p_nonce,p_cipher,p_tag);
 return pg_catalog.jsonb_build_object('state','saved');
end;$fn$;

create function cotironda_private.whapi_read_recipient_packet_d068(
 p_round uuid,p_supplier uuid,p_channel text,p_chat text
) returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare v_packet jsonb;v_vault cotironda_private.whapi_recipient_vault_d068%rowtype;
 v_active integer;v_now timestamptz:=pg_catalog.clock_timestamp();
begin
 if p_round is null or p_supplier is null or p_channel is null
  or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_chat is null or p_chat !~ '^[a-f0-9]{64}$'
 then raise exception 'd068_invalid_identity' using errcode='22023';end if;
 -- D066 revalidates round/line scope, commercial categories, delivery zone,
 -- verified consent on the exact channel and opt-out status.
 v_packet:=cotironda_private.preview_invitation_packet_d066(
   p_round,p_supplier,p_channel);
 if v_packet is null then return null;end if;
 select count(*) into v_active from cotironda_private.whapi_contacts_v1 c
 where c.channel_id=p_channel and c.supplier_org_id=p_supplier
  and c.verified_at<=v_now and c.consented_at<=v_now and c.opted_out_at is null;
 if v_active<>1 then return null;end if;
 select * into v_vault from cotironda_private.whapi_recipient_vault_d068 v
  where v.channel_id=p_channel and v.chat_key=p_chat
   and v.supplier_org_id=p_supplier;
 if not found then return null;end if;
 if not exists(select 1 from cotironda_private.whapi_contacts_v1 c
    where c.channel_id=p_channel and c.chat_key=p_chat
      and c.supplier_org_id=p_supplier and c.verified_at<=v_now
      and c.consented_at<=v_now and c.opted_out_at is null)
 then return null;end if;
 return pg_catalog.jsonb_build_object(
  'packet',v_packet,'chatKey',v_vault.chat_key,
  'cryptoKeyId',v_vault.crypto_key_id,
  'nonceHex',pg_catalog.encode(v_vault.nonce,'hex'),
  'cipherHex',pg_catalog.encode(v_vault.cipher,'hex'),
  'tagHex',pg_catalog.encode(v_vault.tag,'hex'));
end;$fn$;
grant create on schema cotironda_private to cotironda_recipient_owner_d068;
grant cotironda_recipient_owner_d068 to postgres with set true,inherit false;
alter function cotironda_private.whapi_store_recipient_d068(
 text,text,uuid,text,bytea,bytea,bytea) owner to cotironda_recipient_owner_d068;
alter function cotironda_private.whapi_read_recipient_packet_d068(
 uuid,uuid,text,text) owner to cotironda_recipient_owner_d068;
revoke cotironda_recipient_owner_d068 from postgres;
revoke create on schema cotironda_private from cotironda_recipient_owner_d068;
revoke all on function cotironda_private.whapi_store_recipient_d068(
 text,text,uuid,text,bytea,bytea,bytea)
 from public,anon,authenticated,service_role,cotironda_app;
revoke all on function cotironda_private.whapi_read_recipient_packet_d068(
 uuid,uuid,text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_store_recipient_d068(
 text,text,uuid,text,bytea,bytea,bytea) to cotironda_recipient_gateway_d068;
grant execute on function cotironda_private.whapi_read_recipient_packet_d068(
 uuid,uuid,text,text) to cotironda_recipient_gateway_d068;
comment on function cotironda_private.whapi_read_recipient_packet_d068(uuid,uuid,text,text)
 is 'SERVER-ONLY encrypted recipient + D066 scoped packet; no clear phone, NO outbound send';
