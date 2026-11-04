-- MVP159. PILOTO ONLY. Merge legacy source projections and verified
-- PDF evidence versions 2..9 into the SAME strict, one-to-one coverage logic.
-- Economic comparison not enabled; never infer BIG BAG equals cubic meters.
-- Finalist activation remains OFF and historical rounds are excluded.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_plan_coverage_finalists_mvp108(p_request uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare req_ record;q record;matches_count integer;req_count integer;
 distinct_req integer;distinct_line integer;
 matched_req integer[];cover_a integer[];cover_b integer[];
 picked text[]:=array[]::text[]; n integer:=0;result_state text;
begin
 if p_request is null then return jsonb_build_object('state','invalid');end if;
 select rq.id,rq.state,rq.closes_at,rq.buyer_key,rq.delivery_city into req_
 from cotironda_piloto_privado.requests rq
 join cotironda_piloto_privado.participants buyer
  on buyer.key=rq.buyer_key and buyer.participant_role='buyer'
  and buyer.consent_at is not null and buyer.opted_out_at is null
 where rq.id=p_request and rq.buyer_key='arquitecto'
  and rq.delivery_city='La Plata'
 for update of rq;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from
  cotironda_piloto_privado.finalist_coverage_plans_mvp108
  where request_id=p_request)
 then return jsonb_build_object('state','already_planned');end if;
 if req_.state<>'closed' or req_.closes_at>clock_timestamp()
 then return jsonb_build_object('state','deadline_pending');end if;
 select count(*) into req_count from
  cotironda_piloto_privado.request_lines req where req.request_id=p_request;
 if req_count not between 1 and 25
 then return jsonb_build_object('state','invalid_request');end if;

 -- Newer quotes that have NOT passed source validation must invalidate
 -- older otherwise eligible quotations. A text correction also invalidates
 -- an earlier documentary projection for the same supplier.
 for q in
  -- Old audited projections and the new source-backed PDF projections
  -- share the same verified eligibility. UNION prevents double selection.
  select d.message_hmac,d.supplier_key,d.request_id
  from (
   select old.message_hmac,old.supplier_key,old.request_id,
     old.source_sha256
   from cotironda_piloto_privado.anonymous_supplier_docs_mvp107 old
   where not exists(
     select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 any_e
     where any_e.message_hmac=old.message_hmac
   )
   union
   select ev.message_hmac,ev.supplier_key,ev.request_id,
     ev.source_sha256
   from cotironda_piloto_privado.supplier_evidence_mvp138 ev
   where ev.state='verified' and ev.reason='covered'
     and ev.public_text is not null and ev.verifier_version between 2 and 9
     and ev.ranking_allowed=false and ev.sum_line_cents=ev.declared_total_cents
     and not exists(
       select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 later
       where later.message_hmac=ev.message_hmac
         and later.verifier_version>ev.verifier_version
     )
  ) d
  join cotironda_piloto_privado.supplier_media_quotes_mvp098 media
   on media.message_hmac=d.message_hmac
    and media.source_sha256=d.source_sha256
    and media.request_id=p_request
    and media.received_at<=req_.closes_at
  join cotironda_piloto_privado.invitations i
   on i.request_id=p_request and i.supplier_key=d.supplier_key
  join cotironda_piloto_privado.participants supplier
   on supplier.key=d.supplier_key
    and supplier.participant_role='supplier'
    and supplier.consent_at is not null and supplier.opted_out_at is null
  where d.request_id=p_request
   and d.supplier_key in ('corralon_ailin','corralon_nahuel')
   and not exists(select 1
    from cotironda_piloto_privado.supplier_media_quotes_mvp098 newer
    where newer.request_id=p_request and newer.supplier_key=d.supplier_key
      and newer.received_at<=req_.closes_at
      and (newer.received_at,newer.message_hmac)>
          (media.received_at,media.message_hmac))
   and not exists(select 1
    from cotironda_piloto_privado.offer_versions newer_text
    where newer_text.request_id=p_request
     and newer_text.supplier_key=d.supplier_key
     and newer_text.created_at<=req_.closes_at
     and newer_text.created_at>=media.received_at)
  order by d.supplier_key
 loop
  -- EXACT material + specification, quantity and unit. No brand/pack
  -- inference, no splitting, no fabricated equivalence. Every buyer line
  -- must map ONE-TO-ONE to a supplier source line with an actual amount.
  select count(*),count(distinct req.line_no),
    count(distinct l.line_no),array_agg(distinct req.line_no order by req.line_no)
  into matches_count,distinct_req,distinct_line,matched_req
  from cotironda_piloto_privado.request_lines req
  join cotironda_piloto_privado.supplier_quote_lines_mvp101 l
    on l.message_hmac=q.message_hmac
   and lower(btrim(l.description_literal))=
      lower(btrim(req.original_description))
   and cotironda_piloto_privado.unit_code_mvp099(
      l.unit_literal)=req.unit
   and l.quantity_literal ~ '^[0-9]{1,6}([.,][0-9]{1,3})?$'
   and replace(l.quantity_literal,',','.')::numeric=req.quantity
   and cotironda_piloto_privado.parse_amount_cents_mvp103(
      l.line_total_literal) is not null
   and cotironda_piloto_privado.family_preview_mvp098(
      l.description_literal)=req.family_code
  where req.request_id=p_request;
  -- Do not retain ambiguous mappings or unverified partial quantities.
  -- Each valid supplier line must match exactly ONE requested line.
  if matches_count>0 and matches_count=distinct_req
    and matches_count=distinct_line then
   if q.supplier_key='corralon_ailin' then cover_a:=matched_req;
   elsif q.supplier_key='corralon_nahuel' then cover_b:=matched_req;
   end if;
   if matches_count=req_count then
    n:=n+1;picked:=array_append(picked,q.supplier_key);
   end if;
  end if;
 end loop;
 -- A pair of individually PARTIAL supplier offers can collectively cover
 -- the entire basket (no split quantity and no inferred product equivalent).
 -- This is COVERAGE, never a claim of the lowest comparable total.
 if n=0 and coalesce(cardinality(cover_a),0)>0
     and coalesce(cardinality(cover_b),0)>0
     and cardinality(cover_a)<req_count
     and cardinality(cover_b)<req_count
     and (select count(distinct line_no) from
          unnest(cover_a||cover_b) as all_rows(line_no))=req_count
 then
   n:=2;picked:=array['corralon_ailin','corralon_nahuel'];
   result_state:='two_supplier_combination';
 end if;
 if n>2 then
  result_state:='more_than_two_undifferentiated';
  picked:=array[]::text[];n:=0;
 elsif n=2 then result_state:=coalesce(result_state,'two_complete_alternatives');
 elsif n=1 then result_state:='one_complete_alternative';
 else result_state:='no_complete_alternatives';end if;
 insert into cotironda_piloto_privado.finalist_coverage_plans_mvp108(
   request_id,state,candidate_count,supplier_keys)
 values(p_request,result_state,n,picked);
 return jsonb_build_object(
  'state',result_state,'candidate_count',n,
  'joint_supplier_coverage',result_state='two_supplier_combination',
  'price_ranked',false,'contacts_revealed',false,
  'messages_sent',false,'purchase_awarded',false);
end;$function$
revoke all on function public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)
 to service_role;
