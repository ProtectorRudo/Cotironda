-- MVP134 PILOTO ONLY: immutable, private *diagnostic* for old quote drafts.
-- It NEVER changes offer_versions, supplier reading checks or quote prices.
create table if not exists cotironda_piloto_privado.supplier_reconciliation_mvp134(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text not null check(state in ('source_candidate','needs_review')),
 reason text not null check(reason in (
  'covered','unresolved_questions','unsupported_format','invalid_source',
  'unsupported_layout','unresolved','unsafe_contact','line_not_found',
  'line_order_mismatch','field_not_on_source','uncovered_money',
  'uncovered_number','uncovered_terms','total_not_found','invalid_proposal',
  'source_mismatch','source_unavailable')),
 question_count smallint not null check(question_count between 0 and 15),
 model_line_count smallint not null check(model_line_count between 1 and 25),
 recorded_at timestamptz not null default clock_timestamp(),
 check (state <> 'source_candidate' or (reason='covered' and question_count=0))
);
alter table cotironda_piloto_privado.supplier_reconciliation_mvp134
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_reconciliation_mvp134
 from public,anon,authenticated,service_role;
-- Reuse the existing immutable diagnostics trigger, not a mutable approval.
create trigger supplier_reconciliation_immutable_mvp134
 before update or delete
 on cotironda_piloto_privado.supplier_reconciliation_mvp134
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

create or replace function public.cotironda_piloto_next_reconciliation_mvp134()
returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare a record;
begin
 select m.message_hmac,m.content_sha256,m.size_bytes,m.proposal,q.line_count
 into a
 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.content_sha256=q.source_sha256
  and m.request_id=q.request_id and m.participant_key=q.supplier_key
 join cotironda_piloto_privado.supplier_reading_checks_mvp102 c
  on c.message_hmac=q.message_hmac and c.source_sha256=q.source_sha256
 join cotironda_piloto_privado.participants p
  on p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.requests r
  on r.id=i.request_id
 where q.state='awaiting_fidelity_check' and c.state='needs_source_review'
  and m.state='stored' and m.review_state='suggested_only'
  and m.mime='application/pdf'
  and m.storage_path='media/'||m.message_hmac
  and m.content_sha256 ~ '^[a-f0-9]{64}$'
  and m.size_bytes between 120 and 8388608
  and jsonb_typeof(m.proposal)='object'
  and m.proposal->>'kind'='supplier_quote'
  and jsonb_typeof(m.proposal->'lines')='array'
  and jsonb_array_length(m.proposal->'lines')=q.line_count
  and q.line_count between 1 and 25
  and p.participant_role='supplier'
  and p.consent_at is not null and p.opted_out_at is null
  and i.state='prepared' and r.state='prepared'
  and r.closes_at>clock_timestamp()
  and not exists(select 1 from
   cotironda_piloto_privado.supplier_reconciliation_mvp134 x
   where x.message_hmac=m.message_hmac)
 order by q.received_at,m.message_hmac
 limit 1;
 if not found then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate',
  'message_hmac',a.message_hmac,'source_sha256',a.content_sha256,
  'size_bytes',a.size_bytes,'line_count',a.line_count,
  'proposal',a.proposal);
end;$fn$;
revoke all on function public.cotironda_piloto_next_reconciliation_mvp134()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_next_reconciliation_mvp134()
 to service_role;

create or replace function public.cotironda_piloto_record_reconciliation_mvp134(
 p_message_hmac text,p_source_sha256 text,p_state text,p_reason text,
 p_question_count integer,p_line_count integer
) returns jsonb language plpgsql volatile security definer set search_path='' as $fn$
declare v_count integer;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
 or p_state not in ('source_candidate','needs_review')
 or p_reason not in (
  'covered','unresolved_questions','unsupported_format','invalid_source',
  'unsupported_layout','unresolved','unsafe_contact','line_not_found',
  'line_order_mismatch','field_not_on_source','uncovered_money',
  'uncovered_number','uncovered_terms','total_not_found','invalid_proposal',
  'source_mismatch','source_unavailable')
 or p_question_count is null or p_question_count not between 0 and 15
 or p_line_count is null or p_line_count not between 1 and 25
 or (p_state='source_candidate' and
   (p_reason<>'covered' or p_question_count<>0))
 or (p_reason='covered' and p_state<>'source_candidate')
 then return jsonb_build_object('state','invalid');end if;

 insert into cotironda_piloto_privado.supplier_reconciliation_mvp134(
  message_hmac,source_sha256,state,reason,question_count,model_line_count)
 select m.message_hmac,m.content_sha256,p_state,p_reason,
  p_question_count,p_line_count
 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.content_sha256=q.source_sha256
  and m.participant_key=q.supplier_key and m.request_id=q.request_id
 join cotironda_piloto_privado.supplier_reading_checks_mvp102 c
  on c.message_hmac=q.message_hmac and c.source_sha256=q.source_sha256
 join cotironda_piloto_privado.participants p
  on p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.requests r
  on r.id=i.request_id
 where m.message_hmac=p_message_hmac
  and m.content_sha256=p_source_sha256
  and m.state='stored' and m.review_state='suggested_only'
  and m.mime='application/pdf'
  and q.line_count=p_line_count
  and q.state='awaiting_fidelity_check'
  and c.state='needs_source_review'
  and jsonb_typeof(m.proposal->'unanswered')='array'
  and jsonb_array_length(m.proposal->'unanswered')=p_question_count
  and p.participant_role='supplier' and p.consent_at is not null
  and p.opted_out_at is null and i.state='prepared'
  and r.state='prepared' and r.closes_at>clock_timestamp()
 on conflict(message_hmac) do nothing;
 get diagnostics v_count=row_count;
 if v_count=1 then return jsonb_build_object('state','recorded',
  'source_verified',false,'ranking_allowed',false);end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_reconciliation_mvp134
   where message_hmac=p_message_hmac and source_sha256=p_source_sha256)
 then return jsonb_build_object('state','already_recorded',
  'source_verified',false,'ranking_allowed',false);end if;
 return jsonb_build_object('state','not_permitted',
  'source_verified',false,'ranking_allowed',false);
end;$fn$;
revoke all on function public.cotironda_piloto_record_reconciliation_mvp134(
 text,text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_reconciliation_mvp134(
 text,text,text,text,integer,integer) to service_role;
