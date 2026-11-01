-- D051 / Issue #205: private, read-only SQL for D050 confirmation broker.
-- PostgreSQL 17 disposable CI ONLY. No Supabase DEV or Whapi deployment.
-- The calls return ONLY encrypted inbox fields or a HMAC-bound accepted ack.
-- NO phone, raw WhatsApp IDs, plaintext, credentials or message URLs.
create role cotironda_confirmation_reader_d051 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_confirmation_reader_d051;
grant select on cotironda_private.whapi_inbox_v1,
  cotironda_private.whapi_reply_jobs_d047,
  cotironda_private.whapi_offer_sources_d048
 to cotironda_confirmation_reader_d051;
create policy d051_inbox_read on cotironda_private.whapi_inbox_v1
 for select to cotironda_confirmation_reader_d051 using(true);
create policy d051_reply_read on cotironda_private.whapi_reply_jobs_d047
 for select to cotironda_confirmation_reader_d051 using(true);
create policy d051_source_read on cotironda_private.whapi_offer_sources_d048
 for select to cotironda_confirmation_reader_d051 using(true);

-- A single transport message ID must not be reused for multiple accepted
-- jobs in one channel. Reject duplicate ACKs instead of picking arbitrary job.
create unique index whapi_confirm_ack_unique_d051
 on cotironda_private.whapi_reply_jobs_d047(channel_id,transport_ack_key)
 where status='accepted_by_transport';

create function cotironda_private.whapi_confirm_load_inbox_d051(
 p_channel text,p_message_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare m cotironda_private.whapi_inbox_v1%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
   or p_message_key is null or p_message_key !~ '^[a-f0-9]{64}$'
 then raise exception 'd051_invalid_input' using errcode='22023';end if;
 select * into m from cotironda_private.whapi_inbox_v1
  where channel_id=p_channel and message_key=p_message_key;
 if not found or m.kind<>'text' or m.round_id is null
 then return null;end if;
 return pg_catalog.jsonb_build_object(
  'channel',m.channel_id,'chatKey',m.chat_key,'messageKey',m.message_key,
  'supplierOrgId',m.supplier_org_id,'roundId',m.round_id,
  'kind',m.kind,'sourceUnix',m.source_unix,'cryptoKeyId',m.crypto_key_id,
  'fingerprint',m.payload_fingerprint,
  'cipherHex',pg_catalog.encode(m.payload_ciphertext,'hex'),
  'nonceHex',pg_catalog.encode(m.payload_nonce,'hex'),
  'tagHex',pg_catalog.encode(m.payload_tag,'hex'));
end;$fn$;

create function cotironda_private.whapi_confirm_find_ack_d051(
 p_channel text,p_ack_hmac text)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare
 j cotironda_private.whapi_reply_jobs_d047%rowtype;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
    or p_ack_hmac is null or p_ack_hmac !~ '^[a-f0-9]{64}$'
 then raise exception 'd051_invalid_input' using errcode='22023';end if;
 select * into j from cotironda_private.whapi_reply_jobs_d047 job
  where job.channel_id=p_channel and job.transport_ack_key=p_ack_hmac
    and job.status='accepted_by_transport' and job.accepted_at is not null
    and exists(
      select 1 from cotironda_private.whapi_offer_sources_d048 source
       where source.channel_id=job.channel_id
         and source.message_key=job.message_key
         and source.round_id=job.round_id
         and source.supplier_org_id=job.supplier_org_id
         and source.revision=job.revision
    );
 if not found then return null;end if;
 return pg_catalog.jsonb_build_object(
  'jobId',j.job_id,'roundId',j.round_id,
  'supplierOrgId',j.supplier_org_id,'channel',j.channel_id,
  'chatKey',j.chat_key,'originMessageKey',j.message_key,
  'revision',j.revision,'transportAckHmac',j.transport_ack_key,
  'estado','accepted_by_transport');
end;$fn$;

-- Definer role cannot log in or bypass RLS. Only existing D049 gateway
-- can EXECUTE and it has NO direct SELECT privilege on these tables.
grant create on schema cotironda_private to cotironda_confirmation_reader_d051;
grant cotironda_confirmation_reader_d051 to postgres with set true,inherit false;
alter function cotironda_private.whapi_confirm_load_inbox_d051(text,text)
 owner to cotironda_confirmation_reader_d051;
alter function cotironda_private.whapi_confirm_find_ack_d051(text,text)
 owner to cotironda_confirmation_reader_d051;
revoke cotironda_confirmation_reader_d051 from postgres;
revoke create on schema cotironda_private from cotironda_confirmation_reader_d051;
revoke all on function
 cotironda_private.whapi_confirm_load_inbox_d051(text,text),
 cotironda_private.whapi_confirm_find_ack_d051(text,text)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_confirm_load_inbox_d051(text,text),
 cotironda_private.whapi_confirm_find_ack_d051(text,text)
 to cotironda_confirm_gateway;
-- No SQL login is created or connected to these functions by D051.
