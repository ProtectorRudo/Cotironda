-- MVP-050 / D084 — PRIVATE Whapi HTTPS gateway role, PostgreSQL17 CI ONLY.
-- Dependencies D028,D030,D032,D074. DO NOT apply to Supabase DEV (#175).
-- A NEVER-LOGIN permission group; never create/store passwords here.
-- The caller D083 always uses AES-GCM and the KEYED supplier path D032.
-- A future dedicated login can inherit only these six RPC privileges, not
-- buyer round creation, inbox readback, workers, tables or Auth APIs.
create role cotironda_whapi_http_gateway_d084
 nologin noinherit nobypassrls;
grant usage on schema cotironda_private
 to cotironda_whapi_http_gateway_d084;

grant execute on function
 cotironda_private.whapi_resolve_active_contact_v1(text,text),
 cotironda_private.whapi_inbox_record_keyed_v1(
  text,text,text,text,text,bytea,bytea,bytea,bigint,text),
 cotironda_private.whapi_record_optout_v1(
  text,text,text,text,bigint),
 cotironda_private.whapi_resolve_buyer_d074(text,text),
 cotironda_private.whapi_record_buyer_d074(
  text,text,text,text,text,bytea,bytea,bytea,bigint,text),
 cotironda_private.whapi_buyer_optout_d074(
  text,text,text,text,bigint)
 to cotironda_whapi_http_gateway_d084;

-- Deliberately do NOT grant:
-- D028 legacy supplier writer, D076 read, D077 location, D081 create round,
-- D082 queue, D061 supplier quote read, D070 Whapi send, or any table.
-- DO NOT grant membership in existing cotironda_whapi_gateway, which
-- includes the legacy writer beyond this HTTPS endpoint's requirements.
comment on role cotironda_whapi_http_gateway_d084 is
 'MVP050 CI ONLY: Whapi HTTPS Preview six EXECUTE RPC, no LOGIN, no SELECT, no service_role.';
