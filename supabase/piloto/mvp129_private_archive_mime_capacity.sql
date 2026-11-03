-- MVP-129: Increase PRIVATE archival capacity for PDFs, Office and images.
-- Exact stored bytes still SHA-256 verified; no public bucket or new permissions.
do $guard$ begin
 if not exists(select 1 from storage.buckets
  where id='cotironda-piloto-originals' and public=false
  and file_size_limit=3145728)
 then raise exception 'private_archive_bucket_gate_changed';end if;
end;$guard$;

alter table cotironda_piloto_privado.media_archive_mvp095
 drop constraint media_archive_mvp095_size_bytes_check;
alter table cotironda_piloto_privado.media_archive_mvp095
 add constraint media_archive_mvp095_size_bytes_check
 check (size_bytes is null or size_bytes between 1 and 8388608);
update storage.buckets set file_size_limit=8388608
 where id='cotironda-piloto-originals' and public=false
 and file_size_limit=3145728;

create or replace function public.cotironda_piloto_finish_media_mvp095(
 p_message_hmac text,p_state text,p_size integer default null,p_sha text default null)
returns boolean language plpgsql security definer set search_path='' as $function$
declare n integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' or p_state not in('stored','uncertain')
 then return false;end if;
 if p_state='stored' and (p_size is null or p_size not between 1 and 8388608
  or p_sha !~ '^[a-f0-9]{64}$') then return false;end if;
 update cotironda_piloto_privado.media_archive_mvp095
 set state=p_state,finished_at=clock_timestamp(),
 size_bytes=case when p_state='stored' then p_size else null end,
 content_sha256=case when p_state='stored' then p_sha else null end,
 storage_path=case when p_state='stored' then 'media/'||p_message_hmac else null end,
 review_state='review_required'
 where message_hmac=p_message_hmac and state='leased';
 get diagnostics n=row_count;
 return n=1;
end;$function$;
revoke all on function public.cotironda_piloto_finish_media_mvp095(text,text,integer,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_media_mvp095(text,text,integer,text)
 to service_role;

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
  and m.size_bytes between 8 and 8388608
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
