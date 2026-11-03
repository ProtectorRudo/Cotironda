-- MVP-095 / isolated Supabase PILOTO only. No public file access.
do $gate$begin
 if to_regclass('cotironda_piloto_privado.whapi_inbox') is null
 or to_regclass('storage.buckets') is null then
  raise exception 'mvp095_wrong_project' using errcode='42501';
 end if;
end;$gate$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('cotironda-piloto-originals','cotironda-piloto-originals',false,
  3145728,array['application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv','text/plain'])
 on conflict(id) do nothing;
do $check$begin
 if not exists(select 1 from storage.buckets where id='cotironda-piloto-originals'
   and public=false and file_size_limit<=3145728) then
  raise exception 'mvp095_bucket_not_private' using errcode='42501';end if;
end;$check$;

-- Private enablement gate, operator-controlled without additional user secrets.
alter table cotironda_piloto_privado.integration_flags
 add column media_archive_enabled_mvp095 boolean not null default false;
create function public.cotironda_piloto_media_enabled_mvp095()
returns boolean language sql stable security definer set search_path='' as $fn$
 select exists(select 1 from cotironda_piloto_privado.integration_flags
  where only_row and whatsapp_inbound_enabled and media_archive_enabled_mvp095);
$fn$;
revoke all on function public.cotironda_piloto_media_enabled_mvp095()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_media_enabled_mvp095()
 to service_role;

create table cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text primary key references cotironda_piloto_privado.whapi_inbox(message_hmac),
 chat_hmac text not null check(chat_hmac ~ '^[a-f0-9]{64}$'),
 participant_key text not null references cotironda_piloto_privado.participants(key),
 request_id uuid references cotironda_piloto_privado.requests(id),
 kind text not null check(kind in ('image','document')),
 mime text not null check(length(mime) between 4 and 130),
 media_id_sha256 text not null check(media_id_sha256 ~ '^[a-f0-9]{64}$'),
 state text not null default 'leased'
  check(state in ('leased','stored','uncertain')),
 reserved_at timestamptz not null default clock_timestamp(),
 finished_at timestamptz,
 size_bytes integer check(size_bytes is null or size_bytes between 1 and 3145728),
 content_sha256 text check(content_sha256 is null or content_sha256 ~ '^[a-f0-9]{64}$'),
 storage_path text check(storage_path is null or storage_path ~ '^media/[a-f0-9]{64}$'),
 ai_reserved_at timestamptz,
 review_state text not null default 'unread'
  check(review_state in ('unread','review_required','suggested_only')),
 proposal jsonb,
 check((state='stored')=
  (size_bytes is not null and content_sha256 is not null and storage_path is not null))
);
alter table cotironda_piloto_privado.media_archive_mvp095 enable row level security;
revoke all on cotironda_piloto_privado.media_archive_mvp095
 from public,anon,authenticated,service_role;
create index media_archive_mvp095_quota
 on cotironda_piloto_privado.media_archive_mvp095(chat_hmac,reserved_at);

-- Operates only AFTER the signed webhook has recorded an authenticated
-- image/document. No arbitrary media ID, external URL or file bytes via SQL.
create function public.cotironda_piloto_reserve_media_mvp095(
 p_message_hmac text,p_chat_hmac text,p_media_id_sha256 text,p_mime text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_key text;v_kind text;v_role text;v_request uuid;n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$'
   or p_chat_hmac !~ '^[a-f0-9]{64}$'
   or p_media_id_sha256 !~ '^[a-f0-9]{64}$'
   or p_mime not in ('application/pdf','image/jpeg','image/png','image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'text/csv','text/plain')
 then return false;end if;
 if not exists(select 1 from cotironda_piloto_privado.integration_flags
     where only_row and whatsapp_inbound_enabled)then return false;end if;
 select m.participant_key,m.kind,p.participant_role into v_key,v_kind,v_role
 from cotironda_piloto_privado.whapi_inbox m
 join cotironda_piloto_privado.participants p on
   p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.chat_hmac=p_chat_hmac
   and m.kind in('image','document') and m.processing_state='needs_review'
   and m.received_at>clock_timestamp()-interval '10 minutes'
   and p.consent_at is not null and p.opted_out_at is null
   and p.participant_role in ('buyer','supplier')
 for update of m;
 if v_key is null then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
   where key=v_key and chat_hmac=p_chat_hmac for update;
 if (select count(*) from cotironda_piloto_privado.media_archive_mvp095
    where chat_hmac=p_chat_hmac
      and reserved_at>=clock_timestamp()-interval '24 hours')>=8
 then return false;end if;
 if v_role='supplier' then
   select count(*),min(i.request_id::text)::uuid into n,v_request
   from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.supplier_key=v_key and i.state='prepared'
    and r.state='prepared' and r.closes_at>clock_timestamp();
   if n<>1 then v_request:=null;end if;
 end if;
 insert into cotironda_piloto_privado.media_archive_mvp095(
  message_hmac,chat_hmac,participant_key,request_id,kind,mime,media_id_sha256)
 values(p_message_hmac,p_chat_hmac,v_key,v_request,v_kind,p_mime,p_media_id_sha256)
 on conflict do nothing;
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_media_mvp095(text,text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_media_mvp095(text,text,text,text)
 to service_role;

create function public.cotironda_piloto_finish_media_mvp095(
 p_message_hmac text,p_state text,p_size integer default null,
 p_sha text default null
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or p_state not in('stored','uncertain')
 then return false;end if;
 if p_state='stored' and (p_size is null or p_size not between 1 and 3145728
  or p_sha !~ '^[a-f0-9]{64}$')then return false;end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set state=p_state,finished_at=clock_timestamp(),
   size_bytes=case when p_state='stored' then p_size else null end,
   content_sha256=case when p_state='stored' then p_sha else null end,
   storage_path=case when p_state='stored' then 'media/'||p_message_hmac else null end,
   review_state='review_required'
 where message_hmac=p_message_hmac and state='leased';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_finish_media_mvp095(text,text,integer,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_media_mvp095(text,text,integer,text)
 to service_role;

create function public.cotironda_piloto_note_media_proposal_mvp095(
 p_message_hmac text,p_proposal jsonb
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or
  jsonb_typeof(p_proposal)<>'object' or
  length(p_proposal::text)>10000 or
  p_proposal->>'status'<>'review_required'
 then return false;end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set proposal=p_proposal,review_state='suggested_only'
 where message_hmac=p_message_hmac and state='stored'
   and review_state='review_required';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_note_media_proposal_mvp095(text,jsonb)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_note_media_proposal_mvp095(text,jsonb)
 to service_role;

-- At most 2 paid multimodal attempts per enrolled participant in 24 h.
-- Reserve AFTER original bytes are safely stored; no replay on unknown result.
create function public.cotironda_piloto_reserve_document_ai_mvp095(
 p_message_hmac text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare v_key text;v_chat text;n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then return false;end if;
 select a.participant_key,a.chat_hmac into v_key,v_chat
 from cotironda_piloto_privado.media_archive_mvp095 a
 join cotironda_piloto_privado.participants p
   on p.key=a.participant_key and p.chat_hmac=a.chat_hmac
 where a.message_hmac=p_message_hmac and a.state='stored'
   and a.review_state='review_required' and a.ai_reserved_at is null
   and p.consent_at is not null and p.opted_out_at is null;
 if v_key is null then return false;end if;
 perform 1 from cotironda_piloto_privado.participants
   where key=v_key and chat_hmac=v_chat for update;
 select count(*) into n from cotironda_piloto_privado.media_archive_mvp095
 where chat_hmac=v_chat and ai_reserved_at>=clock_timestamp()-interval '24 hours';
 if n>=2 then return false;end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set ai_reserved_at=clock_timestamp()
 where message_hmac=p_message_hmac and ai_reserved_at is null
   and state='stored' and review_state='review_required';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_reserve_document_ai_mvp095(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_reserve_document_ai_mvp095(text)
 to service_role;
