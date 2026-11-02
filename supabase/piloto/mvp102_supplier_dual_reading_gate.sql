-- MVP-102: PILOTO ONLY. A strict agreement between two independent model
-- transcriptions is NOT source-level fidelity or an approved economic offer.
-- Original bytes stay sealed in private Storage and are identified by SHA256.
create table cotironda_piloto_privado.supplier_reading_checks_mvp102(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 line_count smallint not null check(line_count between 1 and 25),
 state text not null check(state in
  ('model_readings_match','needs_source_review')),
 reason_code text not null check(reason_code in
  ('matched','second_unavailable','second_invalid','kind_disagreement',
   'line_count_disagreement','total_disagreement','metadata_disagreement',
   'unanswered_questions','missing_first_mirror','line_disagreement',
   'evidence_missing','unresolved_ambiguity')),
 first_difference smallint check(first_difference between 1 and 25),
 checked_at timestamptz not null default clock_timestamp(),
 check((state='model_readings_match')=(reason_code='matched')),
 check((reason_code='line_disagreement' or reason_code='evidence_missing'
    or reason_code='unresolved_ambiguity') or first_difference is null)
);
alter table cotironda_piloto_privado.supplier_reading_checks_mvp102
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_reading_checks_mvp102
 from public,anon,authenticated,service_role;

-- Reuse MVP-101's immutability guard. A new WhatsApp file/HMAC is a new
-- version; never revise the finding of a previous reading.
create trigger supplier_reading_checks_immutable_mvp102
 before update or delete
 on cotironda_piloto_privado.supplier_reading_checks_mvp102
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

create function public.cotironda_piloto_compare_supplier_readings_mvp102(
 p_message_hmac text,p_second_proposal jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 a record; line_ record; v jsonb; n integer; observed integer;
 v_reason text:='matched';v_first smallint:=null; v_state text;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid');end if;
 -- Protect from replay, supplier impersonation, revocation and orphaned
 -- quotes. This RPC is service_role-only and does not return source fields.
 select q.message_hmac,q.line_count,q.declared_total_literal,
  q.source_sha256,m.proposal
 into a from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.content_sha256=q.source_sha256
  and m.request_id=q.request_id and m.participant_key=q.supplier_key
 join cotironda_piloto_privado.participants p
  on p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 where q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and m.state='stored' and m.review_state='suggested_only'
  and m.proposal->>'kind'='supplier_quote'
  and p.participant_role='supplier'
  and p.consent_at is not null and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.invitations i
    join cotironda_piloto_privado.requests r on r.id=i.request_id
    where i.request_id=q.request_id and i.supplier_key=q.supplier_key
      and i.state='prepared' and r.state='prepared'
      and r.closes_at>clock_timestamp())
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;

 if exists(select 1 from cotironda_piloto_privado.supplier_reading_checks_mvp102
  where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_checked');end if;

 if p_second_proposal is null then
  v_reason:='second_unavailable';
 elsif jsonb_typeof(p_second_proposal) is distinct from 'object'
  or length(p_second_proposal::text)>10000
  or jsonb_typeof(p_second_proposal->'lines') is distinct from 'array'
  or not (p_second_proposal ?& array[
      'kind','lines','total_declared','delivery_city',
      'requested_delivery_note','unanswered'])
  or coalesce(jsonb_typeof(p_second_proposal->'total_declared'),'missing')
    not in ('null','string')
  or coalesce(jsonb_typeof(p_second_proposal->'delivery_city'),'missing')
    not in ('null','string')
  or coalesce(jsonb_typeof(p_second_proposal->'requested_delivery_note'),'missing')
    not in ('null','string')
 then v_reason:='second_invalid';
 elsif p_second_proposal->>'kind' is distinct from 'supplier_quote'
 then v_reason:='kind_disagreement';
 elsif jsonb_array_length(p_second_proposal->'lines')<>a.line_count
 then v_reason:='line_count_disagreement';
 elsif p_second_proposal->>'total_declared' is distinct from
   a.declared_total_literal
 then v_reason:='total_disagreement';
 elsif p_second_proposal->>'delivery_city' is distinct from
    a.proposal->>'delivery_city'
  or p_second_proposal->>'requested_delivery_note' is distinct from
    a.proposal->>'requested_delivery_note'
 then v_reason:='metadata_disagreement';
 elsif jsonb_typeof(p_second_proposal->'unanswered') is distinct from 'array'
  or jsonb_typeof(a.proposal->'unanswered') is distinct from 'array'
  or jsonb_array_length(p_second_proposal->'unanswered')>0
  or jsonb_array_length(a.proposal->'unanswered')>0
 then v_reason:='unanswered_questions';
 end if;

 if v_reason='matched' then
  select count(*) into observed from
    cotironda_piloto_privado.supplier_quote_lines_mvp101
    where message_hmac=p_message_hmac;
  if observed<>a.line_count then
    v_reason:='missing_first_mirror';
  else
   for line_ in
    select * from cotironda_piloto_privado.supplier_quote_lines_mvp101
    where message_hmac=p_message_hmac order by line_no
   loop
    n:=line_.line_no-1;
    v:=p_second_proposal->'lines'->n;
    if jsonb_typeof(v) is distinct from 'object'
     or not (v ?& array[
       'original_description','quantity','unit','unit_price',
       'line_total','evidence_location','ambiguity'])
     or jsonb_typeof(v->'original_description') is distinct from 'string'
     or coalesce(jsonb_typeof(v->'quantity'),'null') not in ('null','string')
     or coalesce(jsonb_typeof(v->'unit'),'null') not in ('null','string')
     or coalesce(jsonb_typeof(v->'unit_price'),'null') not in ('null','string')
     or coalesce(jsonb_typeof(v->'line_total'),'null') not in ('null','string')
     or coalesce(jsonb_typeof(v->'ambiguity'),'null') not in ('null','string')
    then
     v_reason:='line_disagreement';v_first:=line_.line_no;exit;
    end if;
    -- Zero normalization, zero numeric computation: punctuation, separators,
    -- additional fees, minus signs and spelling must be preserved literally.
    if v->>'original_description' is distinct from line_.description_literal
      or v->>'quantity' is distinct from line_.quantity_literal
      or v->>'unit' is distinct from line_.unit_literal
      or v->>'unit_price' is distinct from line_.unit_price_literal
      or v->>'line_total' is distinct from line_.line_total_literal
    then
     v_reason:='line_disagreement';v_first:=line_.line_no;exit;
    end if;
    -- Evidence is independently written by each reading, not compared
    -- byte-for-byte. Empty evidence makes the case unresolved.
    if length(btrim(coalesce(v->>'evidence_location','')))=0
      or length(btrim(coalesce(line_.evidence_literal,'')))=0
    then
     v_reason:='evidence_missing';v_first:=line_.line_no;exit;
    end if;
    if coalesce(nullif(btrim(line_.ambiguity_literal),''),'')<>''
      or coalesce(nullif(btrim(v->>'ambiguity'),''),'')<>''
    then
     v_reason:='unresolved_ambiguity';v_first:=line_.line_no;exit;
    end if;
   end loop;
  end if;
 end if;

 v_state:=case when v_reason='matched' then 'model_readings_match'
  else 'needs_source_review' end;
 insert into cotironda_piloto_privado.supplier_reading_checks_mvp102(
  message_hmac,source_sha256,line_count,state,reason_code,first_difference)
 values(p_message_hmac,a.source_sha256,a.line_count,v_state,v_reason,v_first);
 return jsonb_build_object('state',v_state,'reason',v_reason,
  'line_no',v_first,'source_verified',false,'ranking_allowed',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_compare_supplier_readings_mvp102(text,jsonb)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_compare_supplier_readings_mvp102(text,jsonb)
 to service_role;
