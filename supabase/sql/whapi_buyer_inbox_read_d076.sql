-- MVP-044 / D076 — authenticated READ of encrypted buyer Whapi inbox.
-- ONLY PostgreSQL17 disposable CI. D074 must already be installed.
-- No plain messages, phones, recipients, data API RPCs, cron or WhatsApp.
create role cotironda_buyer_reader_d076 nologin noinherit nobypassrls;
create role cotironda_buyer_gateway_d076 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_buyer_reader_d076,cotironda_buyer_gateway_d076;
grant select on cotironda_private.whapi_buyer_inbox_d074,
 cotironda_private.whapi_buyer_contacts_d074,
 cotironda_private.whapi_contacts_v1 to cotironda_buyer_reader_d076;

create policy d076_read_buyer_inbox on cotironda_private.whapi_buyer_inbox_d074
 for select to cotironda_buyer_reader_d076 using(true);
create policy d076_read_buyer_contact on cotironda_private.whapi_buyer_contacts_d074
 for select to cotironda_buyer_reader_d076 using(true);
create policy d076_read_supplier_contact on cotironda_private.whapi_contacts_v1
 for select to cotironda_buyer_reader_d076 using(true);

create function cotironda_private.whapi_buyer_read_d076(
 p_channel text,p_message text
) returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare
 m cotironda_private.whapi_buyer_inbox_d074%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_message is null or p_message !~ '^[a-f0-9]{64}$'
 then raise exception 'd076_read_identity_invalid' using errcode='22023';end if;
 select * into m from cotironda_private.whapi_buyer_inbox_d074
  where channel_id=p_channel and message_key=p_message;
 if not found or m.status<>'pendiente_interpretacion' or m.kind='opt_out'
 then return null;end if;

 -- The permission check is CURRENT, not based only on the inbound-time
 -- consent. If a buyer opted out, refuse decryption for any older message.
 if not exists(
  select 1 from cotironda_private.whapi_buyer_contacts_d074 c
   where c.channel_id=m.channel_id and c.chat_key=m.chat_key
    and c.buyer_org_id=m.buyer_org_id
    and c.verified_at<=pg_catalog.clock_timestamp()
    and c.consented_at<=pg_catalog.clock_timestamp()
    and c.opted_out_at is null
 ) then return null;end if;
 if exists(select 1 from cotironda_private.whapi_contacts_v1 sc
  where sc.channel_id=m.channel_id and sc.chat_key=m.chat_key)
 then return null;end if;

 if m.payload_ciphertext is null
  or pg_catalog.octet_length(m.payload_ciphertext) not between 1 and 8192
  or pg_catalog.octet_length(m.payload_nonce)<>12
  or pg_catalog.octet_length(m.payload_tag)<>16
 then return null;end if;

 -- Never return a chat ID, phone or the plaintext buyer's order.
 -- The worker MUST still verify AES-GCM AAD with buyerOrgId and source.
 return pg_catalog.jsonb_build_object(
  'channel',m.channel_id,'messageKey',m.message_key,'chatKey',m.chat_key,
  'buyerOrgId',m.buyer_org_id::text,'kind',m.kind,
  'sourceUnix',m.source_unix,'cryptoKeyId',m.crypto_key_id,
  'fingerprint',m.payload_fingerprint,
  'cipherHex',pg_catalog.encode(m.payload_ciphertext,'hex'),
  'nonceHex',pg_catalog.encode(m.payload_nonce,'hex'),
  'tagHex',pg_catalog.encode(m.payload_tag,'hex')
 );
end;$fn$;

grant create on schema cotironda_private to cotironda_buyer_reader_d076;
grant cotironda_buyer_reader_d076 to postgres with set true,inherit false;
alter function cotironda_private.whapi_buyer_read_d076(text,text)
 owner to cotironda_buyer_reader_d076;
revoke cotironda_buyer_reader_d076 from postgres;
revoke create on schema cotironda_private from cotironda_buyer_reader_d076;

revoke all on function cotironda_private.whapi_buyer_read_d076(text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_buyer_read_d076(text,text)
 to cotironda_buyer_gateway_d076;
comment on function cotironda_private.whapi_buyer_read_d076(text,text) is
 'D076 server-only encrypted buyer event, current consent and identity, no public API. CI until DEV backup+restore #175.';
