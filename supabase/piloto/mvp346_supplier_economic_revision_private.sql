-- MVP346: PILOTO ONLY. A corrected interpretation is a PRIVATE CANDIDATE.
-- It is NOT a replacement for the archived original, MVP101 line mirror,
-- MVP102 dual reading check, MVP103 arithmetic audit, MVP106 source audit,
-- anonymous publication or ranking. Never backfill or auto-publish.
create table cotironda_piloto_privado.supplier_revision_candidates_mvp346(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 supplier_key text not null references cotironda_piloto_privado.participants(key),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 original_proposal jsonb not null,
 candidate_proposal jsonb not null,
 state text not null default 'private_candidate'
  check(state='private_candidate'),
 recorded_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.supplier_revision_candidates_mvp346
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_revision_candidates_mvp346
 from public,anon,authenticated,service_role;
create trigger supplier_revision_candidates_immutable_mvp346
 before update or delete
 on cotironda_piloto_privado.supplier_revision_candidates_mvp346
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Only an authenticated internal service_role may CALL this entrypoint.
-- The worker has already SHA-checked the original PDF, checked its complete
-- economic source coverage with a separate PDF parser, and balanced money
-- in integer cents. SQL checks the economic arithmetic AGAIN for defense in
-- depth; it never trusts a client 'verified' flag and never publishes.
create function public.cotironda_piloto_store_revision_candidate_mvp346(
 p_message_hmac text,p_source_sha256 text,p_candidate jsonb
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare
 a record; original_line jsonb; candidate_line jsonb;
 line_count integer; i integer; changed boolean:=false;
 money bigint; unit_money bigint; quantity numeric;
 total bigint; sum_ bigint:=0; raw_quantity text;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
  or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
  or p_candidate is null or jsonb_typeof(p_candidate)<>'object'
  or length(p_candidate::text)>20000
 then return jsonb_build_object('state','invalid');end if;
 select q.message_hmac,q.request_id,q.supplier_key,q.source_sha256,
  q.line_count,m.proposal
 into a
 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
   and m.participant_key=q.supplier_key
   and m.content_sha256=q.source_sha256
 join cotironda_piloto_privado.participants p
  on p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.requests r
  on r.id=q.request_id
 where q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and m.mime='application/pdf'
  and m.state='stored' and m.review_state='suggested_only'
  and m.proposal->>'kind'='supplier_quote'
  and p.participant_role='supplier'
  and p.consent_at is not null and p.opted_out_at is null
  and i.state='prepared' and r.state='prepared'
  and r.closes_at>clock_timestamp()
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if a.source_sha256<>p_source_sha256
 then return jsonb_build_object('state','source_mismatch');end if;
 if exists(select 1 from
  cotironda_piloto_privado.supplier_revision_candidates_mvp346
  where message_hmac=p_message_hmac)
 then
  if exists(select 1 from
   cotironda_piloto_privado.supplier_revision_candidates_mvp346
   where message_hmac=p_message_hmac and
    source_sha256=p_source_sha256 and candidate_proposal=p_candidate)
  then return jsonb_build_object('state','candidate_already_stored');end if;
  return jsonb_build_object('state','candidate_conflict');
 end if;
 if p_candidate->>'kind'<>'supplier_quote'
  or p_candidate->>'status'<>'review_required'
  or jsonb_typeof(p_candidate->'lines')<>'array'
  or jsonb_typeof(p_candidate->'unanswered')<>'array'
  or p_candidate->'unanswered'<>'[]'::jsonb
  or jsonb_typeof(p_candidate->'total_declared')<>'string'
  or coalesce(jsonb_typeof(p_candidate->'requested_delivery_note'),'missing')
    not in ('string','null')
  or coalesce(jsonb_typeof(p_candidate->'delivery_city'),'missing')
    not in ('string','null')
  or p_candidate->>'delivery_city' is distinct from
    a.proposal->>'delivery_city'
 then return jsonb_build_object('state','invalid');end if;
 line_count:=jsonb_array_length(p_candidate->'lines');
 if line_count<>a.line_count or line_count not between 1 and 25
 then return jsonb_build_object('state','material_scope_mismatch');end if;
 total:=cotironda_piloto_privado.parse_amount_cents_mvp103(
  p_candidate->>'total_declared');
 if total is null then return jsonb_build_object('state','invalid');end if;
 for i in 0..line_count-1 loop
  original_line:=a.proposal->'lines'->i;
  candidate_line:=p_candidate->'lines'->i;
  if jsonb_typeof(original_line)<>'object' or
    jsonb_typeof(candidate_line)<>'object' or
    jsonb_typeof(candidate_line->'original_description')<>'string' or
    jsonb_typeof(candidate_line->'evidence_location')<>'string' or
    length(btrim(candidate_line->>'evidence_location'))=0 or
    length(candidate_line->>'evidence_location')>200 or
    length(candidate_line->>'original_description') not between 2 and 250 or
    coalesce(jsonb_typeof(candidate_line->'quantity'),'missing')
     not in ('null','string') or
    coalesce(jsonb_typeof(candidate_line->'unit'),'missing')
     not in ('null','string') or
    coalesce(jsonb_typeof(candidate_line->'unit_price'),'missing')
     not in ('null','string') or
    coalesce(jsonb_typeof(candidate_line->'line_total'),'missing')
     not in ('null','string') or
    coalesce(jsonb_typeof(candidate_line->'ambiguity'),'missing')
     not in ('null','string') or
    nullif(btrim(coalesce(candidate_line->>'ambiguity','')),'') is not null
  then return jsonb_build_object('state','invalid');end if;
  if candidate_line->>'original_description' is distinct from
      original_line->>'original_description'
    or candidate_line->>'quantity' is distinct from
      original_line->>'quantity'
    or candidate_line->>'unit' is distinct from
      original_line->>'unit'
  then return jsonb_build_object('state','material_scope_mismatch');end if;
  money:=cotironda_piloto_privado.parse_amount_cents_mvp103(
    candidate_line->>'line_total');
  if money is null then return jsonb_build_object('state','invalid');end if;
  if candidate_line->>'original_description' ~*
    '(descuento|bonificaci[oó]n|rebaja)' and money>=0
  then return jsonb_build_object('state','invalid');end if;
  if candidate_line->>'unit_price' is not null then
   unit_money:=cotironda_piloto_privado.parse_amount_cents_mvp103(
    candidate_line->>'unit_price');
   raw_quantity:=candidate_line->>'quantity';
   if unit_money is null or raw_quantity is null or
    raw_quantity !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$'
   then return jsonb_build_object('state','invalid');end if;
   quantity:=replace(raw_quantity,',','.')::numeric;
   if quantity<=0 or quantity>1000000 or
     unit_money::numeric*quantity<>money
   then return jsonb_build_object('state','invalid');end if;
  end if;
  sum_:=sum_+money;
  if candidate_line->>'unit_price' is distinct from
      original_line->>'unit_price'
   or candidate_line->>'line_total' is distinct from
      original_line->>'line_total'
  then changed:=true;end if;
 end loop;
 if sum_<>total then return jsonb_build_object('state','invalid');end if;
 if p_candidate->>'total_declared' is distinct from
    a.proposal->>'total_declared'
  or p_candidate->>'requested_delivery_note' is distinct from
    a.proposal->>'requested_delivery_note'
 then changed:=true;end if;
 if not changed then return jsonb_build_object('state','no_changes');end if;
 insert into cotironda_piloto_privado.supplier_revision_candidates_mvp346(
  message_hmac,request_id,supplier_key,source_sha256,
  original_proposal,candidate_proposal)
 values(p_message_hmac,a.request_id,a.supplier_key,p_source_sha256,
  a.proposal,p_candidate);
 return jsonb_build_object('state','candidate_stored',
  'source_verified',false,'publication_allowed',false,
  'ranking_allowed',false,'contact_revealed',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_store_revision_candidate_mvp346(text,text,jsonb)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_store_revision_candidate_mvp346(text,text,jsonb)
 to service_role;
