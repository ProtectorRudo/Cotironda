-- MVP136: recover a PRICE-BEARING supplier document labelled buyer_request by AI.
-- The ORIGINAL stored bytes, prices, quantities and notes never change.
-- Reclassification is private and never bypasses MVP102/103/106/107 gates.
create table cotironda_piloto_privado.supplier_role_corrections_mvp136(
 message_hmac text primary key references cotironda_piloto_privado.media_archive_mvp095(message_hmac),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 original_proposal jsonb not null,
 correction text not null default 'supplier_quote' check(correction='supplier_quote'),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.supplier_role_corrections_mvp136
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_role_corrections_mvp136
 from public,anon,authenticated,service_role;
create trigger supplier_role_corrections_immutable_mvp136
 before update or delete on cotironda_piloto_privado.supplier_role_corrections_mvp136
 for each row execute function cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Avoid implicit casts from untrusted model fields; no need to parse money
-- yet, since quote publication is not authorized by this classification.
create or replace function public.cotironda_piloto_next_supplier_role_mvp136()
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare job record;
begin
 select m.message_hmac,m.content_sha256,m.size_bytes,m.mime
 into job from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i
  on i.request_id=m.request_id and i.supplier_key=m.participant_key
 join cotironda_piloto_privado.requests r on r.id=m.request_id
 where m.state='stored' and m.review_state='suggested_only'
  and m.proposal->>'kind'='buyer_request'
  and jsonb_typeof(m.proposal->'lines')='array'
  and jsonb_array_length(m.proposal->'lines') between 1 and 25
  and m.proposal->>'total_declared' is not null
  and length(btrim(m.proposal->>'total_declared')) between 2 and 150
  and (select count(*) from jsonb_array_elements(m.proposal->'lines') e
   where length(btrim(coalesce(e->>'original_description',''))) between 2 and 250
     and length(btrim(coalesce(e->>'unit_price',''))) between 2 and 100
     and length(btrim(coalesce(e->>'line_total',''))) between 2 and 120
     and length(btrim(coalesce(e->>'evidence_location',''))) between 2 and 200
     and coalesce(e->>'ambiguity','')='')=
      jsonb_array_length(m.proposal->'lines')
  and m.storage_path='media/'||m.message_hmac
  and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.size_bytes between 120 and 8388608
  and m.mime in ('application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'text/plain','text/csv')
  and p.participant_role='supplier'
  and p.consent_at is not null and p.opted_out_at is null
  and i.state='prepared' and r.state='prepared'
  and r.closes_at>clock_timestamp()
  and not exists(select 1 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   where q.message_hmac=m.message_hmac)
  and not exists(select 1 from cotironda_piloto_privado.supplier_role_corrections_mvp136 a
   where a.message_hmac=m.message_hmac)
 order by m.reserved_at,m.message_hmac limit 1;
 if not found then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate',
  'message_hmac',job.message_hmac,'source_sha256',job.content_sha256,
  'mime',job.mime,'size_bytes',job.size_bytes);
end;$fn$;
revoke all on function public.cotironda_piloto_next_supplier_role_mvp136()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_next_supplier_role_mvp136()
 to service_role;

create or replace function public.cotironda_piloto_correct_supplier_role_mvp136(
 p_message_hmac text,p_source_sha256 text)
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare m_ record;line_count integer;receipt jsonb;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_role_corrections_mvp136
  where message_hmac=p_message_hmac and source_sha256=p_source_sha256)
 then return jsonb_build_object('state','already_corrected',
  'source_verified',false,'ranking_allowed',false);end if;
 select m.message_hmac,m.proposal,m.content_sha256 into m_
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p
  on p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i
  on i.request_id=m.request_id and i.supplier_key=m.participant_key
 join cotironda_piloto_privado.requests r on r.id=m.request_id
 where m.message_hmac=p_message_hmac
  and m.content_sha256=p_source_sha256
  and m.state='stored' and m.review_state='suggested_only'
  and m.storage_path='media/'||m.message_hmac
  and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.size_bytes between 120 and 8388608
  and m.mime in ('application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'text/plain','text/csv')
  and m.proposal->>'kind'='buyer_request'
  and jsonb_typeof(m.proposal->'lines')='array'
  and m.proposal->>'total_declared' is not null
  and length(btrim(m.proposal->>'total_declared')) between 2 and 150
  and p.participant_role='supplier'
  and p.consent_at is not null and p.opted_out_at is null
  and i.state='prepared' and r.state='prepared'
  and r.closes_at>clock_timestamp()
  and not exists(select 1 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   where q.message_hmac=m.message_hmac)
  and not exists(select 1 from cotironda_piloto_privado.supplier_role_corrections_mvp136 a
   where a.message_hmac=m.message_hmac)
 for update of m;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 line_count:=jsonb_array_length(m_.proposal->'lines');
 if line_count not between 1 and 25
 or (select count(*) from jsonb_array_elements(m_.proposal->'lines') e
   where length(btrim(coalesce(e->>'original_description',''))) between 2 and 250
     and length(btrim(coalesce(e->>'unit_price',''))) between 2 and 100
     and length(btrim(coalesce(e->>'line_total',''))) between 2 and 120
     and length(btrim(coalesce(e->>'evidence_location',''))) between 2 and 200
     and coalesce(e->>'ambiguity','')='')<>line_count
 then return jsonb_build_object('state','invalid_quote');end if;
 -- Both changes are in one transaction; failure rolls back everything.
 insert into cotironda_piloto_privado.supplier_role_corrections_mvp136(
  message_hmac,source_sha256,original_proposal)
 values(p_message_hmac,p_source_sha256,m_.proposal);
 update cotironda_piloto_privado.media_archive_mvp095
 set proposal=jsonb_set(m_.proposal,'{kind}','"supplier_quote"'::jsonb,false)
 where message_hmac=p_message_hmac and content_sha256=p_source_sha256;
 receipt:=public.cotironda_piloto_record_supplier_media_mvp098(p_message_hmac);
 if receipt->>'state'<>'stored_unverified'
 then raise exception 'mvp136_private_mirror_failed' using errcode='23514';end if;
 return jsonb_build_object('state','reclassified_private',
  'line_count',line_count,'source_verified',false,'ranking_allowed',false);
end;$fn$;
revoke all on function public.cotironda_piloto_correct_supplier_role_mvp136(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_correct_supplier_role_mvp136(text,text)
 to service_role;
