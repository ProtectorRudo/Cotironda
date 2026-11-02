-- MVP-108: closed-round coverage finalists, NEVER a price ranking.
-- Initial La Plata pilot: only two source-covered, validated textual quotes.
-- Two complete alternatives can be identified without pretending a cheapest
-- offer or equating totals with different coverage/IVA/payment conditions.
create table cotironda_piloto_privado.finalist_coverage_plans_mvp108(
 request_id uuid primary key references cotironda_piloto_privado.requests(id),
 state text not null check(state in
  ('two_complete_alternatives','one_complete_alternative',
   'no_complete_alternatives','more_than_two_undifferentiated')),
 candidate_count smallint not null check(candidate_count between 0 and 2),
 supplier_keys text[] not null,
 checked_at timestamptz not null default clock_timestamp(),
 check(array_length(supplier_keys,1) is null or
   array_length(supplier_keys,1)=candidate_count),
 check((state='two_complete_alternatives')=(candidate_count=2)),
 check((state='one_complete_alternative')=(candidate_count=1)),
 check((state in('no_complete_alternatives',
  'more_than_two_undifferentiated'))=(candidate_count=0))
);
alter table cotironda_piloto_privado.finalist_coverage_plans_mvp108
 enable row level security;
revoke all on cotironda_piloto_privado.finalist_coverage_plans_mvp108
 from public,anon,authenticated,service_role;
create trigger finalist_coverage_immutable_mvp108
 before update or delete on
 cotironda_piloto_privado.finalist_coverage_plans_mvp108
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

create function public.cotironda_piloto_plan_coverage_finalists_mvp108(
 p_request uuid
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record;q record;matches_count integer;req_count integer;
 distinct_req integer;distinct_line integer;
 picked text[]:=array[]::text[]; n integer:=0;result_state text;
begin
 if p_request is null then return jsonb_build_object('state','invalid');end if;
 select r.id,r.state,r.closes_at,r.buyer_key,r.delivery_city into r
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.participants buyer
  on buyer.key=r.buyer_key and buyer.participant_role='buyer'
  and buyer.consent_at is not null and buyer.opted_out_at is null
 where r.id=p_request and r.buyer_key='arquitecto'
  and r.delivery_city='La Plata'
 for update of r;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from
  cotironda_piloto_privado.finalist_coverage_plans_mvp108
  where request_id=p_request)
 then return jsonb_build_object('state','already_planned');end if;
 if r.state<>'closed' or r.closes_at>clock_timestamp()
 then return jsonb_build_object('state','deadline_pending');end if;
 select count(*) into req_count from
  cotironda_piloto_privado.request_lines req where req.request_id=p_request;
 if req_count not between 1 and 8
 then return jsonb_build_object('state','invalid_request');end if;

 -- Newer quotes that have NOT passed source validation must invalidate
 -- older otherwise eligible quotations. A text correction also invalidates
 -- an earlier documentary projection for the same supplier.
 for q in
  select d.message_hmac,d.supplier_key,d.request_id
  from cotironda_piloto_privado.anonymous_supplier_docs_mvp107 d
  join cotironda_piloto_privado.supplier_media_quotes_mvp098 media
   on media.message_hmac=d.message_hmac
    and media.source_sha256=d.source_sha256
    and media.request_id=p_request
    and media.received_at<=r.closes_at
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
      and newer.received_at<=r.closes_at
      and (newer.received_at,newer.message_hmac)>
          (media.received_at,media.message_hmac))
   and not exists(select 1
    from cotironda_piloto_privado.offer_versions newer_text
    where newer_text.request_id=p_request
     and newer_text.supplier_key=d.supplier_key
     and newer_text.created_at<=r.closes_at
     and newer_text.created_at>=media.received_at)
  order by d.supplier_key
 loop
  -- EXACT material + specification, quantity and unit. No brand/pack
  -- inference, no splitting, no fabricated equivalence. Every buyer line
  -- must map ONE-TO-ONE to a supplier source line with an actual amount.
  select count(*),count(distinct req.line_no),
    count(distinct l.line_no)
  into matches_count,distinct_req,distinct_line
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
  if matches_count=req_count and distinct_req=req_count
    and distinct_line=req_count then
   n:=n+1;picked:=array_append(picked,q.supplier_key);
  end if;
 end loop;
 if n>2 then
  result_state:='more_than_two_undifferentiated';
  picked:=array[]::text[];n:=0;
 elsif n=2 then result_state:='two_complete_alternatives';
 elsif n=1 then result_state:='one_complete_alternative';
 else result_state:='no_complete_alternatives';end if;
 insert into cotironda_piloto_privado.finalist_coverage_plans_mvp108(
   request_id,state,candidate_count,supplier_keys)
 values(p_request,result_state,n,picked);
 return jsonb_build_object(
  'state',result_state,'candidate_count',n,
  'price_ranked',false,'contacts_revealed',false,
  'messages_sent',false,'purchase_awarded',false);
end;$fn$;
revoke all on function
 public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_plan_coverage_finalists_mvp108(uuid)
 to service_role;
