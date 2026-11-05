-- MVP201 · DEVELOPMENT ONLY · DO NOT APPLY to cotironda-piloto without Publicalo.
-- Server-side audit of an authorized original-file HTTP response preparation.
-- Never stores WhatsApp contact, supplier identity, HMAC, JWT or storage path.
-- Requires prospective MVP178 policy + MVP191 identity + MVP192 V9 catalog.
create table if not exists cotironda_piloto_privado.original_download_audit_mvp201(
 id bigint generated always as identity primary key,
 request_id uuid not null,
 document_id uuid not null,
 buyer_auth_user_id uuid not null,
 buyer_auth_session_id uuid not null,
 buyer_key text not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 size_bytes integer not null check(size_bytes between 1 and 8388608),
 event_type text not null default 'http_response_prepared'
   check(event_type='http_response_prepared'),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.original_download_audit_mvp201
 enable row level security;
revoke all on table cotironda_piloto_privado.original_download_audit_mvp201
 from public,anon,authenticated,service_role;
create index if not exists original_download_audit_mvp201_round_time_idx
 on cotironda_piloto_privado.original_download_audit_mvp201
 (request_id,recorded_at desc);

-- Only the server's private service_role can invoke this function.
-- Revalidates every relevant permission by querying MVP192 in this SAME
-- transaction before inserting the audit event. No browser-provided identity.
create or replace function public.cotironda_piloto_record_original_download_mvp201(
 p_request_id uuid,
 p_auth_user_id uuid,
 p_auth_session_id uuid,
 p_document_id uuid,
 p_source_sha256 text,
 p_byte_count integer
) returns boolean
language plpgsql volatile security definer
set search_path='' as $fn$
declare
 v_doc jsonb;
 v_file jsonb;
 v_buyer_key text;
begin
 if p_request_id is null or p_auth_user_id is null
    or p_auth_session_id is null or p_document_id is null
    or p_source_sha256 is null
    or p_source_sha256 !~ '^[a-f0-9]{64}$'
    or p_byte_count is null or p_byte_count not between 1 and 8388608
 then return false;end if;

 v_doc:=public.cotironda_piloto_originals_private_mvp192(
  p_request_id,p_auth_user_id,p_auth_session_id,p_document_id
 );
 if v_doc is null or v_doc->>'state'<>'authorized_original'
    or v_doc->>'documentoId'<>p_document_id::text then return false;end if;
 v_file:=v_doc->'autorizacion'->'archivo';
 v_buyer_key:=v_doc->'autorizacion'->'ronda'->>'empresaId';
 if v_file is null
    or v_file->>'sha256'<>p_source_sha256
    or (v_file->>'bytes')::integer<>p_byte_count
    or v_buyer_key is null
    or v_buyer_key !~ '^[a-z0-9_-]{3,100}$'
 then return false;end if;

 insert into cotironda_piloto_privado.original_download_audit_mvp201(
  request_id,document_id,buyer_auth_user_id,buyer_auth_session_id,
  buyer_key,source_sha256,size_bytes
 )values(
  p_request_id,p_document_id,p_auth_user_id,p_auth_session_id,
  v_buyer_key,p_source_sha256,p_byte_count
 );
 return true;
exception when others then
 -- Fail closed: an audit outage must NEVER permit bytes to leave the server.
 return false;
end;
$fn$;

revoke all on function
 public.cotironda_piloto_record_original_download_mvp201(
 uuid,uuid,uuid,uuid,text,integer)
 from public,anon,authenticated,service_role;
grant execute on function
 public.cotironda_piloto_record_original_download_mvp201(
 uuid,uuid,uuid,uuid,text,integer)
 to service_role;
