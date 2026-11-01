-- MVP-064 / D093 — bind the FULL ENCRYPTED ORIGINAL WhatsApp source to a
-- supplier quote version. PostgreSQL17 CI ONLY, not historical Supabase DEV.
-- D028 retains EXACT original plaintext via AES-GCM authenticated ciphertext.
-- D093 does NOT store a second plaintext copy, a phone or an AI summary.
create role cotironda_original_writer_d093 nologin noinherit nobypassrls;
create role cotironda_original_gateway_d093 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_original_writer_d093,cotironda_original_gateway_d093;
grant select on cotironda_private.whapi_inbox_v1,
 cotironda_private.whapi_received_offers_d059
 to cotironda_original_writer_d093;
create policy d093_inbox_read on cotironda_private.whapi_inbox_v1
 for select to cotironda_original_writer_d093 using(true);
create policy d093_receipt_read on cotironda_private.whapi_received_offers_d059
 for select to cotironda_original_writer_d093 using(true);
grant execute on function
 cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)
 to cotironda_original_writer_d093;

create table cotironda_private.whapi_original_bindings_d093(
 channel_id text not null,
 message_key text not null,
 round_id uuid not null,
 supplier_org_id uuid not null,
 offer_version integer not null check(offer_version between 1 and 100000),
 source_text_sha256 text not null check(source_text_sha256 ~ '^[a-f0-9]{64}$'),
 encrypted_source_sha256 text not null check(encrypted_source_sha256 ~ '^[a-f0-9]{64}$'),
 source_bytes integer not null check(source_bytes between 1 and 8192),
 source_lines integer not null check(source_lines between 1 and 160),
 total_status text not null check(total_status in
  ('explicitamente_verificado','no_detectado','ambiguo_no_verificado')),
 total_source_line integer check(total_source_line between 1 and 160),
 total_literal_sha256 text check(total_literal_sha256 ~ '^[a-f0-9]{64}$'),
 bound_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,message_key),
 unique(round_id,supplier_org_id,offer_version),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_received_offers_d059(channel_id,message_key)
  on delete restrict,
 foreign key(round_id,supplier_org_id,offer_version)
  references cotironda_private.offer_versions_v1(round_id,supplier_org_id,version)
  on delete restrict,
 check(
  (total_status='explicitamente_verificado' and
   total_source_line is not null and total_source_line<=source_lines and
   total_literal_sha256 is not null)
  or
  (total_status<>'explicitamente_verificado' and
   total_source_line is null and total_literal_sha256 is null)
 )
);
alter table cotironda_private.whapi_original_bindings_d093 enable row level security;
revoke all on cotironda_private.whapi_original_bindings_d093
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_original_bindings_d093
 to cotironda_original_writer_d093;
create policy d093_binding_read on cotironda_private.whapi_original_bindings_d093
 for select to cotironda_original_writer_d093 using(true);
create policy d093_binding_insert on cotironda_private.whapi_original_bindings_d093
 for insert to cotironda_original_writer_d093 with check(true);
create trigger d093_immutable_binding before update or delete
 on cotironda_private.whapi_original_bindings_d093
 for each row execute function cotironda_private.reject_immutable_quote_v1();

-- Caller is a private worker which DECRYPTED and AES-GCM AUTHENTICATED
-- D028, then computed exact SHA256 of original UTF8, original line count,
-- and total literal hash. DB re-anchors that manifest to D028 ciphertext.
-- The DB cannot independently decrypt: without trusted worker, claims of
-- textual completeness are NOT certified. Never expose this RPC to clients.
create function cotironda_private.whapi_receive_with_original_d093(
 p_channel text,p_message text,p_expected_revision integer,
 p_offer jsonb,p_prices jsonb,p_manifest jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_inbox cotironda_private.whapi_inbox_v1%rowtype;
 v_receipt cotironda_private.whapi_received_offers_d059%rowtype;
 v_prior cotironda_private.whapi_original_bindings_d093%rowtype;
 v_result jsonb;
 v_cipher_digest text;
 v_text_digest text;
 v_bytes integer;
 v_lines integer;
 v_status text;
 v_total_line integer;
 v_total_hash text;
begin
 if p_channel is null or p_channel !~ '^[A-Za-z0-9_-]{4,64}$'
  or p_message is null or p_message !~ '^[a-f0-9]{64}$'
  or pg_catalog.jsonb_typeof(p_manifest) is distinct from 'object'
  or (select count(*) from pg_catalog.jsonb_object_keys(p_manifest))<>5
  or not (p_manifest ?& array['source_text_sha256','source_bytes',
      'source_lines','total_status','total_source'])
 then raise exception 'd093_invalid_manifest' using errcode='22023';end if;
 if pg_catalog.jsonb_typeof(p_manifest->'source_text_sha256')<>'string'
  or (p_manifest->>'source_text_sha256') !~ '^[a-f0-9]{64}$'
  or pg_catalog.jsonb_typeof(p_manifest->'source_bytes')<>'number'
  or (p_manifest->>'source_bytes') !~ '^[1-9][0-9]{0,3}$'
  or (p_manifest->>'source_bytes')::int>8192
  or pg_catalog.jsonb_typeof(p_manifest->'source_lines')<>'number'
  or (p_manifest->>'source_lines') !~ '^[1-9][0-9]{0,2}$'
  or (p_manifest->>'source_lines')::int>160
  or pg_catalog.jsonb_typeof(p_manifest->'total_status')<>'string'
  or p_manifest->>'total_status' not in
   ('explicitamente_verificado','no_detectado','ambiguo_no_verificado')
 then raise exception 'd093_invalid_manifest' using errcode='22023';end if;
 v_text_digest:=p_manifest->>'source_text_sha256';
 v_bytes:=(p_manifest->>'source_bytes')::int;
 v_lines:=(p_manifest->>'source_lines')::int;
 v_status:=p_manifest->>'total_status';
 if v_status='explicitamente_verificado' then
  if pg_catalog.jsonb_typeof(p_manifest->'total_source')<>'object'
   or (select count(*) from pg_catalog.jsonb_object_keys(
        p_manifest->'total_source'))<>2
   or not (p_manifest->'total_source' ?& array['line_no','literal_sha256'])
   or pg_catalog.jsonb_typeof(p_manifest->'total_source'->'line_no')<>'number'
   or (p_manifest->'total_source'->>'line_no') !~ '^[1-9][0-9]{0,2}$'
   or (p_manifest->'total_source'->>'line_no')::int>v_lines
   or pg_catalog.jsonb_typeof(p_manifest->'total_source'->'literal_sha256')<>'string'
   or (p_manifest->'total_source'->>'literal_sha256') !~ '^[a-f0-9]{64}$'
  then raise exception 'd093_invalid_total' using errcode='22023';end if;
  v_total_line:=(p_manifest->'total_source'->>'line_no')::int;
  v_total_hash:=p_manifest->'total_source'->>'literal_sha256';
 elsif pg_catalog.jsonb_typeof(p_manifest->'total_source') is distinct from 'null' then
  raise exception 'd093_total_not_supported' using errcode='22023';
 end if;
 select * into v_inbox from cotironda_private.whapi_inbox_v1
  where channel_id=p_channel and message_key=p_message;
 if not found or v_inbox.kind<>'text' or v_inbox.round_id is null then
  raise exception 'd093_no_encrypted_source' using errcode='42501';end if;
 v_cipher_digest:=pg_catalog.encode(pg_catalog.sha256(
   v_inbox.payload_ciphertext||v_inbox.payload_nonce||v_inbox.payload_tag),'hex');
 -- D060's existing logic authenticates identity, quote contents and
 -- version/consent; this same SQL statement is the atomic transaction.
 v_result:=cotironda_private.whapi_receive_with_prices_d060(
  p_channel,p_message,p_expected_revision,p_offer,p_prices);
 select * into v_receipt from cotironda_private.whapi_received_offers_d059
  where channel_id=p_channel and message_key=p_message;
 if not found or v_receipt.round_id<>v_inbox.round_id
  or v_receipt.supplier_org_id<>v_inbox.supplier_org_id
  or (v_result->>'version')::int<>v_receipt.version then
  raise exception 'd093_inbox_receipt_mismatch' using errcode='42501';end if;
 select * into v_prior from cotironda_private.whapi_original_bindings_d093
  where channel_id=p_channel and message_key=p_message;
 if found then
  if v_prior.round_id<>v_receipt.round_id
    or v_prior.supplier_org_id<>v_receipt.supplier_org_id
    or v_prior.offer_version<>v_receipt.version
    or v_prior.source_text_sha256<>v_text_digest
    or v_prior.encrypted_source_sha256<>v_cipher_digest
    or v_prior.source_bytes<>v_bytes
    or v_prior.source_lines<>v_lines
    or v_prior.total_status<>v_status
    or v_prior.total_source_line is distinct from v_total_line
    or v_prior.total_literal_sha256 is distinct from v_total_hash
  then raise exception 'd093_original_replay_conflict' using errcode='23505';end if;
  return v_result||pg_catalog.jsonb_build_object(
    'original_preserved',true,'original_encrypted',true);
 end if;
 if v_result->>'repeated'<>'false' then
  raise exception 'd093_missing_original_binding' using errcode='23505';end if;
 insert into cotironda_private.whapi_original_bindings_d093
 (channel_id,message_key,round_id,supplier_org_id,offer_version,
  source_text_sha256,encrypted_source_sha256,source_bytes,source_lines,
  total_status,total_source_line,total_literal_sha256)
 values(p_channel,p_message,v_receipt.round_id,v_receipt.supplier_org_id,
  v_receipt.version,v_text_digest,v_cipher_digest,v_bytes,v_lines,
  v_status,v_total_line,v_total_hash);
 return v_result||pg_catalog.jsonb_build_object(
  'original_preserved',true,'original_encrypted',true);
end;$fn$;
grant create on schema cotironda_private to cotironda_original_writer_d093;
grant cotironda_original_writer_d093 to postgres with set true,inherit false;
alter function cotironda_private.whapi_receive_with_original_d093(
 text,text,integer,jsonb,jsonb,jsonb) owner to cotironda_original_writer_d093;
revoke cotironda_original_writer_d093 from postgres;
revoke create on schema cotironda_private from cotironda_original_writer_d093;
revoke all on function cotironda_private.whapi_receive_with_original_d093(
 text,text,integer,jsonb,jsonb,jsonb)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.whapi_receive_with_original_d093(
 text,text,integer,jsonb,jsonb,jsonb)
 to cotironda_original_gateway_d093;
