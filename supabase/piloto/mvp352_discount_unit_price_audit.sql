-- MVP352 (DEVELOPMENT ONLY): source-backed explicit unit discount
-- Never install with "Luz verde". Preserves original source, ledger and ACL.
-- Pin exactly the function active on the authorized pilot.
DO $guard$
BEGIN
 IF md5(pg_get_functiondef(
   'public.cotironda_piloto_audit_supplier_amounts_mvp103(text)'::regprocedure
  ))<>'7f5112a2146650f43e6cba2857663c68' THEN
   RAISE EXCEPTION 'mvp352_mvp103_baseline_drift';END IF;
 IF has_function_privilege('anon',
   'public.cotironda_piloto_audit_supplier_amounts_mvp103(text)','EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_audit_supplier_amounts_mvp103(text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp352_mvp103_public_exposure';END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_audit_supplier_amounts_mvp103(
 p_message_hmac text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record; l record; v_count integer; cents bigint; unit_cents bigint;
 qty numeric;total bigint;sum_ bigint:=0;reason text:='balanced';
 state_ text;problem smallint:=null;observed bigint:=null;
 discount_parts text[];discount_percent numeric;effective_unit_cents numeric;
 expected_line_cents numeric;
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
   -- A source-explicit percent suffix is a condition on the priced item,
   -- never a separate positive discount credit. Keep literal mirror intact.
   discount_parts:=regexp_match(coalesce(l.description_literal,''),
    '^([^;]{3,250});[[:space:]]*(dscto[.]?|dcto[.]?|dto[.]?|descuento|bonif[.]?|bonificaci[oó]n)[[:space:]]*:?[[:space:]]*([0-9]{1,3}([.,][0-9]{1,3})?)[[:space:]]*%[[:space:]]*
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
    IF discount_parts IS NULL THEN
     -- Existing exact multiplication remains unchanged when no discount.
     IF unit_cents::numeric*qty<>cents THEN
      reason:='line_multiplication_mismatch';problem:=l.line_no;exit;
     END IF;
    ELSE
     discount_percent:=replace(discount_parts[3],',','.')::numeric;
     IF discount_percent<0 OR discount_percent>100 OR unit_cents<=0 OR cents<0 THEN
      reason:='line_multiplication_mismatch';problem:=l.line_no;exit;
     END IF;
     -- Discount unit LIST price, round it to CENTS, then multiply the
     -- quantity and round the extended amount. No floating arithmetic.
     effective_unit_cents:=round(unit_cents::numeric*
      (100-discount_percent)/100,0);
     expected_line_cents:=round(effective_unit_cents*qty,0);
     IF expected_line_cents<>cents THEN
      reason:='line_multiplication_mismatch';problem:=l.line_no;exit;
     END IF;
    END IF;
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
end;$fn$;,'i');
   IF discount_parts IS NULL AND
      l.description_literal ~* '(descuento|bonificaci[oó]n|rebaja)'
      AND cents>=0 THEN
     reason:='discount_sign_inconsistent';problem:=l.line_no;exit;
   END IF;
   IF discount_parts IS NOT NULL AND l.unit_price_literal IS NULL THEN
     reason:='ambiguous_line_amount';problem:=l.line_no;exit;
   END IF;
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
