-- MVP131: isolated PostgreSQL17 schema and sample data, NEVER pilot data.
create schema cotironda_piloto_privado;
create role anon;
create role authenticated;
create role service_role;
create table cotironda_piloto_privado.integration_flags
 (only_row boolean primary key,whatsapp_inbound_enabled boolean not null);
create table cotironda_piloto_privado.operational_caps_mvp097
 (only_row boolean primary key,max_document_ai_per_24h integer not null);
create table cotironda_piloto_privado.participants
 (key text primary key,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz);
create table cotironda_piloto_privado.media_archive_mvp095
 (message_hmac text primary key,participant_key text,chat_hmac text,request_id uuid,
 state text,review_state text,proposal jsonb,
 content_sha256 text,storage_path text,ai_reserved_at timestamptz,
 size_bytes integer,mime text);
create table cotironda_piloto_privado.document_ai_diagnostics_mvp127
 (message_hmac text,state text,attempt_count integer,next_retry_at timestamptz,
 last_attempt_at timestamptz,updated_at timestamptz);
create table cotironda_piloto_privado.invitations
 (request_id uuid,supplier_key text,state text);
create table cotironda_piloto_privado.requests
 (id uuid primary key,state text,closes_at timestamptz);
insert into cotironda_piloto_privado.integration_flags values(true,true);
insert into cotironda_piloto_privado.operational_caps_mvp097 values(true,100);
insert into cotironda_piloto_privado.participants
 values('provider_test',repeat('a',64),'supplier',clock_timestamp(),null);
insert into cotironda_piloto_privado.requests
 values('11111111-1111-1111-1111-111111111111','prepared',clock_timestamp()+interval '1 day');
insert into cotironda_piloto_privado.invitations
 values('11111111-1111-1111-1111-111111111111','provider_test','prepared');
insert into cotironda_piloto_privado.media_archive_mvp095
 values(repeat('c',64),'provider_test',repeat('a',64),
 '11111111-1111-1111-1111-111111111111','stored','review_required',null,
 repeat('b',64),'media/'||repeat('c',64),clock_timestamp()-interval '10 minutes',
 12725,'application/pdf');
\i supabase/piloto/mvp131_system_document_trigger.sql
do $test$
declare v jsonb;
begin
 if has_function_privilege('anon',
    'public.cotironda_piloto_system_document_trigger_mvp131()','EXECUTE')
  or has_function_privilege('authenticated',
    'public.cotironda_piloto_system_document_trigger_mvp131()','EXECUTE')
  or not has_function_privilege('service_role',
    'public.cotironda_piloto_system_document_trigger_mvp131()','EXECUTE')
 then raise exception 'MVP131 privilege gate failed';end if;
 v:=public.cotironda_piloto_system_document_trigger_mvp131();
 if v->>'state'<>'candidate' or v->>'trigger_chat_hmac'<>repeat('a',64)
 then raise exception 'MVP131 valid candidate missing';end if;
 update cotironda_piloto_privado.participants
  set opted_out_at=clock_timestamp() where key='provider_test';
 v:=public.cotironda_piloto_system_document_trigger_mvp131();
 if v->>'state'<>'none' then raise exception 'MVP131 opted-out candidate leak';end if;
 update cotironda_piloto_privado.participants
  set opted_out_at=null where key='provider_test';
 update cotironda_piloto_privado.requests
  set closes_at=clock_timestamp()-interval '1 minute';
 v:=public.cotironda_piloto_system_document_trigger_mvp131();
 if v->>'state'<>'none' then raise exception 'MVP131 expired invitation leak';end if;
 update cotironda_piloto_privado.requests
  set closes_at=clock_timestamp()+interval '1 day';
 update cotironda_piloto_privado.media_archive_mvp095
  set storage_path='media/wrong';
 v:=public.cotironda_piloto_system_document_trigger_mvp131();
 if v->>'state'<>'none' then raise exception 'MVP131 storage path mismatch';end if;
 update cotironda_piloto_privado.media_archive_mvp095
  set storage_path='media/'||repeat('c',64);
 update cotironda_piloto_privado.operational_caps_mvp097
  set max_document_ai_per_24h=1;
 v:=public.cotironda_piloto_system_document_trigger_mvp131();
 if v->>'state'<>'quota' then raise exception 'MVP131 daily cap not enforced';end if;
end;$test$;
set role service_role;
select (public.cotironda_piloto_system_document_trigger_mvp131()->>'state')='quota'
 as service_only_checked;
reset role;
