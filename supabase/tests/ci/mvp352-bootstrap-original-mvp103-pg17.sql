-- MVP352: TEST ONLY. Existing lightweight cumulative fixture already has
-- baseline tables, but omits legacy MVP103 functions.
-- Restore original unmodified function sources before applying the pinned
-- replacement SQL. Never apply this file to the Supabase pilot.
-- The cumulative recovery fixture carries a minimal supplier quote shape;
-- its sole missing real MVP098 field is restored only inside ROLLBACK.
ALTER TABLE cotironda_piloto_privado.supplier_media_quotes_mvp098
 ADD COLUMN IF NOT EXISTS declared_total_literal text;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.parse_amount_cents_mvp103(
 p_literal text
) returns bigint language plpgsql immutable set search_path='' as $fn$
declare v text; norm text; sign_ bigint:=1; whole text; frac text;
begin
 if p_literal is null or length(p_literal)>60 or
    btrim(p_literal) !~ '^[-]?[$][[:space:]]*[0-9][0-9.,]*$'
 then return null;end if;
 v:=regexp_replace(btrim(p_literal),'[$[:space:]]','','g');
 if left(v,1)='-' then sign_:=-1;v:=substring(v from 2);end if;
 -- A single grouping separator without decimals is ambiguous: $ 7.000
 -- must not become 7000 or 7 on guesswork.
 if v ~ '^(0|[1-9][0-9]{0,8})([.,][0-9]{1,2})?$' then
   norm:=replace(v,',','.');
 elsif v ~ '^[1-9][0-9]{0,2}(\.[0-9]{3})+,[0-9]{1,2}$' then
   norm:=replace(replace(v,'.',''),',','.');
 elsif v ~ '^[1-9][0-9]{0,2}(,[0-9]{3})+\.[0-9]{1,2}$' then
   norm:=replace(v,',','');
 else return null;end if;
 whole:=split_part(norm,'.',1);frac:=split_part(norm,'.',2);
 if length(whole)>9 or whole::numeric>999999999 then return null;end if;
 return sign_ * (whole::bigint * 100 +
   coalesce(nullif(rpad(frac,2,'0'),''),'00')::bigint);
end;$fn$;
revoke all on function cotironda_piloto_privado.parse_amount_cents_mvp103(text)
 from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_audit_supplier_amounts_mvp103(
 p_message_hmac text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record; l record; v_count integer; cents bigint; unit_cents bigint;
 qty numeric;total bigint;sum_ bigint:=0;reason text:='balanced';
 state_ text;problem smallint:=null;observed bigint:=null;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid');end if;
 select q.message_hmac,q.line_count,q.declared_total_literal,q.source_sha256
 into a from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m on
  m.message_hmac=q.message_hmac and m.request_id=q.request_id and
  m.participant_key=q.supplier_key and m.content_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_reading_checks_mvp102 c on
  c.message_hmac=q.message_hmac and c.source_sha256=q.source_sha256
 join cotironda_piloto_privado.participants p on
  p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 where q.message_hmac=p_message_hmac
  and q.state='awaiting_fidelity_check'
  and m.state='stored' and m.review_state='suggested_only'
  and m.proposal->>'kind'='supplier_quote'
  and c.state='model_readings_match'
  and p.participant_role='supplier' and p.consent_at is not null
  and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.request_id=q.request_id and i.supplier_key=q.supplier_key
    and i.state='prepared' and r.state='prepared'
    and r.closes_at>clock_timestamp())
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_amount_checks_mvp103
    where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_checked');end if;
 select count(*) into v_count from
  cotironda_piloto_privado.supplier_quote_lines_mvp101
  where message_hmac=p_message_hmac;
 total:=cotironda_piloto_privado.parse_amount_cents_mvp103(
  a.declared_total_literal);
 if v_count<>a.line_count then reason:='missing_mirror';
 elsif total is null then reason:='ambiguous_total';
 else
  for l in select * from cotironda_piloto_privado.supplier_quote_lines_mvp101
   where message_hmac=p_message_hmac order by line_no
  loop
   if l.line_total_literal is null or length(btrim(l.line_total_literal))=0 then
     reason:='missing_line_amount';problem:=l.line_no;exit;
   end if;
   cents:=cotironda_piloto_privado.parse_amount_cents_mvp103(
    l.line_total_literal);
   if cents is null then
     reason:='ambiguous_line_amount';problem:=l.line_no;exit;
   end if;
   if l.description_literal ~* '(descuento|bonificaci[oó]n|rebaja)'
      and cents>=0 then
     reason:='discount_sign_inconsistent';problem:=l.line_no;exit;
   end if;
   if l.unit_price_literal is not null then
    unit_cents:=cotironda_piloto_privado.parse_amount_cents_mvp103(
     l.unit_price_literal);
    if unit_cents is null then
      reason:='ambiguous_line_amount';problem:=l.line_no;exit;
    end if;
    if l.quantity_literal is null or
     l.quantity_literal !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$' then
      reason:='invalid_quantity';problem:=l.line_no;exit;
    end if;
    qty:=replace(l.quantity_literal,',','.')::numeric;
    if qty<=0 or qty>1000000 then
      reason:='invalid_quantity';problem:=l.line_no;exit;
    end if;
    if (unit_cents::numeric*qty)<>cents then
      reason:='line_multiplication_mismatch';problem:=l.line_no;exit;
    end if;
   end if;
   sum_:=sum_+cents;
  end loop;
  if reason='balanced' then
   observed:=sum_;
   if sum_<>total then reason:='total_mismatch';end if;
  end if;
 end if;
 state_:=case when reason='balanced' then 'balanced'
  when reason in ('total_mismatch','line_multiplication_mismatch',
   'discount_sign_inconsistent') then 'difference'
  else 'needs_review' end;
 insert into cotironda_piloto_privado.supplier_amount_checks_mvp103(
  message_hmac,source_sha256,line_count,state,reason_code,
  first_problem_line,observed_sum_cents,declared_total_cents)
 values(p_message_hmac,a.source_sha256,a.line_count,state_,reason,
  problem,observed,total);
 return jsonb_build_object('state',state_,'reason',reason,
  'line_no',problem,'source_verified',false,'ranking_allowed',false);
end;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_audit_supplier_amounts_mvp103(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_audit_supplier_amounts_mvp103(text)
 TO service_role;

-- The cumulative MVP291 CI fixture models the MVP102 table, not its RPC.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_compare_supplier_readings_mvp102(
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
REVOKE ALL ON FUNCTION public.cotironda_piloto_compare_supplier_readings_mvp102(text,jsonb)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_compare_supplier_readings_mvp102(text,jsonb)
 TO service_role;
