-- MVP-106: independent inspection of original downloaded TXT/CSV bytes.
-- This ledger describes *coverage of source text*, NOT a verified price,
-- safe public projection, ranking, winner or supplier-contact authorization.
create table cotironda_piloto_privado.supplier_source_checks_mvp106(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 model_line_count smallint not null check(model_line_count between 1 and 25),
 state text not null check(state in
  ('source_text_covered','needs_source_review')),
 reason text not null check(reason in
  ('covered','unsupported_format','invalid_source','unsupported_layout',
  'unresolved','unsafe_contact','line_not_found','line_order_mismatch',
  'field_not_on_source','uncovered_money','uncovered_number',
  'total_not_found')),
 checked_at timestamptz not null default clock_timestamp(),
 check((state='source_text_covered')=(reason='covered'))
);
alter table cotironda_piloto_privado.supplier_source_checks_mvp106
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_source_checks_mvp106
 from public,anon,authenticated,service_role;
create trigger supplier_source_checks_immutable_mvp106
 before update or delete on
 cotironda_piloto_privado.supplier_source_checks_mvp106
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

create function public.cotironda_piloto_record_supplier_source_check_mvp106(
 p_message_hmac text,p_source_sha256 text,p_state text,
 p_reason text,p_line_count integer
) returns jsonb language plpgsql security definer
set search_path='' as $fn$
declare row_ record;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
 or p_state not in('source_text_covered','needs_source_review')
 or p_reason not in
  ('covered','unsupported_format','invalid_source','unsupported_layout',
   'unresolved','unsafe_contact','line_not_found','line_order_mismatch',
   'field_not_on_source','uncovered_money','uncovered_number',
   'total_not_found')
 or (p_state='source_text_covered') is distinct from(p_reason='covered')
 or p_line_count not between 1 and 25
 then return jsonb_build_object('state','invalid');end if;

 select q.message_hmac,q.source_sha256,q.line_count,m.mime
 into row_
 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.content_sha256=q.source_sha256
  and m.request_id=q.request_id and m.participant_key=q.supplier_key
 join cotironda_piloto_privado.supplier_reading_checks_mvp102 c
  on c.message_hmac=q.message_hmac and c.source_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  on amounts.message_hmac=q.message_hmac
  and amounts.source_sha256=q.source_sha256
 join cotironda_piloto_privado.participants p
  on p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 where q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and c.state='model_readings_match'
  and m.state='stored' and m.review_state='suggested_only'
  and m.proposal->>'kind'='supplier_quote'
  and p.participant_role='supplier' and p.consent_at is not null
  and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=q.request_id and i.supplier_key=q.supplier_key
      and i.state='prepared' and r.state='prepared'
      and r.closes_at>clock_timestamp())
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if row_.source_sha256<>p_source_sha256 or row_.line_count<>p_line_count
 then return jsonb_build_object('state','source_mismatch');end if;
 if p_state='source_text_covered' and row_.mime not in('text/plain','text/csv')
 then return jsonb_build_object('state','unsupported_format');end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_source_checks_mvp106
  where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_checked');end if;
 insert into cotironda_piloto_privado.supplier_source_checks_mvp106(
  message_hmac,source_sha256,model_line_count,state,reason)
 values(p_message_hmac,p_source_sha256,p_line_count,p_state,p_reason);
 return jsonb_build_object('state',p_state,'reason',p_reason,
  'source_verified',false,'publication_allowed',false,
  'ranking_allowed',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_record_supplier_source_check_mvp106(
  text,text,text,text,integer)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_record_supplier_source_check_mvp106(
  text,text,text,text,integer)
 to service_role;
