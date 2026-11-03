-- MVP127/PILOTO: explainable private document failures and bounded reread reservations.
-- Never store document bytes, quoted prices, contact info, prompts or raw errors.
create table if not exists cotironda_piloto_privado.document_ai_diagnostics_mvp127 (
 message_hmac text primary key references cotironda_piloto_privado.media_archive_mvp095(message_hmac) on delete cascade,
 state text not null default 'pending' check (state in ('pending','failed','draft_saved','review_required')),
 reason_code text not null default 'not_attempted' check (reason_code in (
  'not_attempted','ai_disabled','quota_blocked','api_credentials_missing',
  'api_unauthorized','api_rate_limited','api_rejected','api_server_error',
  'api_unavailable','api_timeout','response_incomplete','response_invalid',
  'response_too_large','schema_rejected','draft_persistence_failed',
  'source_review_required','internal_error'
 )),
 phase text not null default 'initial' check (phase in
   ('initial','primary','corroboration','storage','validation','review','retry')),
 attempt_count smallint not null default 0 check (attempt_count between 0 and 3),
 first_failure_at timestamptz,
 last_attempt_at timestamptz,
 next_retry_at timestamptz,
 updated_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.document_ai_diagnostics_mvp127 enable row level security;
revoke all on cotironda_piloto_privado.document_ai_diagnostics_mvp127
 from public,anon,authenticated;
create index if not exists document_ai_diagnostics_retry_mvp127
 on cotironda_piloto_privado.document_ai_diagnostics_mvp127(next_retry_at)
 where state='failed' and attempt_count<3;

create or replace function public.cotironda_piloto_note_document_failure_mvp127(
 p_message_hmac text,p_reason_code text,p_phase text)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_reason_code not in (
   'ai_disabled','quota_blocked','api_credentials_missing','api_unauthorized',
   'api_rate_limited','api_rejected','api_server_error','api_unavailable',
   'api_timeout','response_incomplete','response_invalid',
   'response_too_large','schema_rejected','draft_persistence_failed',
   'source_review_required','internal_error')
  or p_phase not in ('initial','primary','corroboration','storage','validation','review','retry')
 then return false;end if;
 if not exists(
  select 1 from cotironda_piloto_privado.media_archive_mvp095 a
  join cotironda_piloto_privado.participants p
   on p.key=a.participant_key and p.chat_hmac=a.chat_hmac
  where a.message_hmac=p_message_hmac and a.state='stored'
   and a.ai_reserved_at is not null
   and p.consent_at is not null and p.opted_out_at is null
 ) then return false;end if;
 insert into cotironda_piloto_privado.document_ai_diagnostics_mvp127(
   message_hmac,state,reason_code,phase,attempt_count,
   first_failure_at,last_attempt_at,next_retry_at)
 values(p_message_hmac,'failed',p_reason_code,p_phase,1,
  clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '3 minutes')
 on conflict(message_hmac) do update
 set state='failed',reason_code=excluded.reason_code,phase=excluded.phase,
  first_failure_at=coalesce(cotironda_piloto_privado.document_ai_diagnostics_mvp127.first_failure_at,clock_timestamp()),
  attempt_count=least(3,cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count+1),
  last_attempt_at=clock_timestamp(),
  next_retry_at=case
   when cotironda_piloto_privado.document_ai_diagnostics_mvp127.attempt_count>=3 then null
   else clock_timestamp()+interval '3 minutes' end,
  updated_at=clock_timestamp();
 get diagnostics n=row_count;
 return n=1;
end;$function$;
revoke all on function public.cotironda_piloto_note_document_failure_mvp127(text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_note_document_failure_mvp127(text,text,text)
 to service_role;

create or replace function public.cotironda_piloto_note_document_draft_mvp127(
 p_message_hmac text,p_needs_corrob boolean)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$' then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.media_archive_mvp095
  where message_hmac=p_message_hmac and state='stored'
  and review_state='suggested_only' and proposal is not null)
 then return false;end if;
 insert into cotironda_piloto_privado.document_ai_diagnostics_mvp127(
  message_hmac,state,reason_code,phase,attempt_count,last_attempt_at)
 values(p_message_hmac,case when p_needs_corrob then 'review_required' else 'draft_saved' end,
  case when p_needs_corrob then 'source_review_required' else 'not_attempted' end,
  'review',1,clock_timestamp())
 on conflict(message_hmac) do update
 set state=excluded.state,reason_code=excluded.reason_code,phase='review',
   next_retry_at=null,updated_at=clock_timestamp();
 get diagnostics n=row_count;
 return n=1;
end;$function$;
revoke all on function public.cotironda_piloto_note_document_draft_mvp127(text,boolean)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_note_document_draft_mvp127(text,boolean)
 to service_role;

-- For private, authenticated workers ONLY. SQL NEVER downloads media, calls
-- external APIs, sends WhatsApps, or returns document text/PII.
create or replace function public.cotironda_piloto_reserve_document_retry_mvp127(
 p_message_hmac text)
returns jsonb language plpgsql volatile security definer set search_path='' as $function$
declare a record; diag record;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 select m.message_hmac,m.kind,m.mime,m.content_sha256,m.size_bytes,
        m.request_id,p.participant_role
 into a
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.proposal is null and m.review_state='review_required'
  and m.ai_reserved_at is not null and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.size_bytes between 8 and 3145728
  and m.mime in ('application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv')
  and p.consent_at is not null and p.opted_out_at is null
  and (p.participant_role='buyer' or
   p.participant_role='supplier' and m.request_id is not null and
   exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=m.request_id and i.supplier_key=m.participant_key
    and r.state='prepared' and r.closes_at>clock_timestamp()))
 for update of m;
 if not found then return jsonb_build_object('state','not_eligible');end if;
 select * into diag from cotironda_piloto_privado.document_ai_diagnostics_mvp127
 where message_hmac=p_message_hmac and state='failed'
  and attempt_count<3 and next_retry_at <=clock_timestamp()
 for update;
 if not found then return jsonb_build_object('state','not_due');end if;
 update cotironda_piloto_privado.document_ai_diagnostics_mvp127
 set state='pending',phase='retry',next_retry_at=null,updated_at=clock_timestamp()
 where message_hmac=p_message_hmac and state='failed'
   and attempt_count<3 and next_retry_at<=clock_timestamp();
 if not found then return jsonb_build_object('state','already_reserved');end if;
 return jsonb_build_object('state','reserved','kind',a.kind,
  'mime',a.mime,'source_sha256',a.content_sha256,
  'size_bytes',a.size_bytes,'supplier_quote',a.participant_role='supplier');
end;$function$;
revoke all on function public.cotironda_piloto_reserve_document_retry_mvp127(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_document_retry_mvp127(text)
 to service_role;

-- A legitimate 25-line proposal may exceed the previous 10 KB JSON cap.
-- Every proposed line is still bounded/validated by Edge and downstream SQL.
create or replace function public.cotironda_piloto_note_media_proposal_mvp095(
 p_message_hmac text,p_proposal jsonb)
returns boolean language plpgsql volatile security definer set search_path='' as $function$
declare n integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or jsonb_typeof(p_proposal)<>'object'
 or length(p_proposal::text)>40000
 or p_proposal->>'status'<>'review_required'
 or jsonb_typeof(p_proposal->'lines')<>'array'
 or jsonb_array_length(p_proposal->'lines') not between 0 and 25
 then return false;end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set proposal=p_proposal,review_state='suggested_only'
 where message_hmac=p_message_hmac and state='stored'
 and review_state='review_required' and ai_reserved_at is not null
 and proposal is null;
 get diagnostics n=row_count;
 return n=1;
end;$function$;
revoke all on function public.cotironda_piloto_note_media_proposal_mvp095(text,jsonb)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_note_media_proposal_mvp095(text,jsonb)
 to service_role;
