-- MVP-010 / Issue #233. SOLELY PostgreSQL17 disposable CI, NOT a Supabase migration.
-- Preserve the price actually QUOTED in the encrypted inbox, independently
-- of whether IVA was included, excluded, or not mentioned.
-- One inbound supplier message -> one D059 offer version + immutable price
-- evidence records, in the SAME DB transaction, never a second "Confirmo".
create role cotironda_price_writer_d060 nologin noinherit nobypassrls;
create role cotironda_price_gateway_d060 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to
 cotironda_price_writer_d060,cotironda_price_gateway_d060;
grant execute on function
 cotironda_private.whapi_receive_quote_d059(text,text,integer,jsonb)
 to cotironda_price_writer_d060;

create table cotironda_private.whapi_price_sources_d060(
 channel_id text not null,
 message_key text not null,
 round_id uuid not null,
 supplier_org_id uuid not null,
 offer_version integer not null,
 evidence_sha256 text not null check(evidence_sha256 ~ '^[0-9a-f]{64}$'),
 stored_at timestamptz not null default pg_catalog.clock_timestamp(),
 primary key(channel_id,message_key),
 unique(round_id,supplier_org_id,offer_version),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_received_offers_d059(channel_id,message_key)
  on delete restrict,
 foreign key(round_id,supplier_org_id,offer_version)
  references cotironda_private.offer_versions_v1(round_id,supplier_org_id,version)
  on delete restrict
);
create table cotironda_private.whapi_price_lines_d060(
 channel_id text not null,
 message_key text not null,
 line_no integer not null check(line_no between 1 and 8),
 quoted_unit_price numeric(18,2),
 vat_basis text not null check(vat_basis in
  ('incluido','no_incluido','no_informado','contradictorio')),
 source_line_no integer check(source_line_no between 1 and 160),
 source_sha256 text check(source_sha256 ~ '^[0-9a-f]{64}$'),
 primary key(channel_id,message_key,line_no),
 foreign key(channel_id,message_key)
  references cotironda_private.whapi_price_sources_d060(channel_id,message_key)
  on delete restrict,
 check((quoted_unit_price is null and source_line_no is null and source_sha256 is null)
   or (quoted_unit_price>=0 and source_line_no is not null and source_sha256 is not null))
);
alter table cotironda_private.whapi_price_sources_d060 enable row level security;
alter table cotironda_private.whapi_price_lines_d060 enable row level security;
revoke all on cotironda_private.whapi_price_sources_d060,
 cotironda_private.whapi_price_lines_d060
 from public,anon,authenticated,service_role,cotironda_app;
grant select,insert on cotironda_private.whapi_price_sources_d060,
 cotironda_private.whapi_price_lines_d060 to cotironda_price_writer_d060;
create policy d060_source_read on cotironda_private.whapi_price_sources_d060
 for select to cotironda_price_writer_d060 using(true);
create policy d060_source_insert on cotironda_private.whapi_price_sources_d060
 for insert to cotironda_price_writer_d060 with check(true);
create policy d060_line_read on cotironda_private.whapi_price_lines_d060
 for select to cotironda_price_writer_d060 using(true);
create policy d060_line_insert on cotironda_private.whapi_price_lines_d060
 for insert to cotironda_price_writer_d060 with check(true);
create trigger d060_source_immutable before update or delete
 on cotironda_private.whapi_price_sources_d060
 for each row execute function cotironda_private.reject_immutable_quote_v1();
create trigger d060_line_immutable before update or delete
 on cotironda_private.whapi_price_lines_d060
 for each row execute function cotironda_private.reject_immutable_quote_v1();

create function cotironda_private.whapi_receive_with_prices_d060(
 p_channel text,p_message_key text,p_expected_revision integer,
 p_offer jsonb,p_prices jsonb
) returns jsonb
language plpgsql volatile security definer set search_path='' as $fn$
declare
 v_row jsonb;
 v_price jsonb;
 v_offer_line jsonb;
 v_sha text;
 v_prior cotironda_private.whapi_price_sources_d060%rowtype;
 v_r cotironda_private.whapi_received_offers_d059%rowtype;
 v_result jsonb;
 v_no integer;
 v_vat text;
 v_orig numeric(18,2);
 v_net numeric(18,2);
 v_rate numeric;
 v_seen integer[]:=array[]::integer[];
begin
 if pg_catalog.jsonb_typeof(p_offer) is distinct from 'object'
  or pg_catalog.jsonb_typeof(p_offer->'lines_snapshot') is distinct from 'array'
  or pg_catalog.jsonb_typeof(p_prices) is distinct from 'array'
  or pg_catalog.jsonb_array_length(p_prices)<1
  or pg_catalog.jsonb_array_length(p_prices)>8
  or pg_catalog.jsonb_array_length(p_prices)<>
     pg_catalog.jsonb_array_length(p_offer->'lines_snapshot')
 then raise exception 'd060_invalid_price_input' using errcode='22023'; end if;

 -- Input MUST have exactly one price-disclosure item for every quote line.
 -- Reject mixed IDs and inconsistent IVA instead of silently summing tax.
 for v_price in select value from pg_catalog.jsonb_array_elements(p_prices)
 loop
  if pg_catalog.jsonb_typeof(v_price) is distinct from 'object'
   or (select count(*) from pg_catalog.jsonb_object_keys(v_price))<>5
   or not (v_price ?& array[
     'line_no','quoted_unit_price','vat_basis','source_line_no','source_sha256'])
   or pg_catalog.jsonb_typeof(v_price->'line_no')<>'number'
   or (v_price->>'line_no') !~ '^[1-8]$'
   or pg_catalog.jsonb_typeof(v_price->'quoted_unit_price') not in ('string','null')
   or (pg_catalog.jsonb_typeof(v_price->'quoted_unit_price')='string'
       and (v_price->>'quoted_unit_price') !~
         '^(0|[1-9][0-9]{0,8})(\.[0-9]{1,2})?$')
   or pg_catalog.jsonb_typeof(v_price->'vat_basis')<>'string'
   or v_price->>'vat_basis' not in
     ('incluido','no_incluido','no_informado','contradictorio')
   or pg_catalog.jsonb_typeof(v_price->'source_line_no') not in ('number','null')
   or (pg_catalog.jsonb_typeof(v_price->'source_line_no')='number'
     and (v_price->>'source_line_no') !~ '^(?:[1-9]|[1-9][0-9]|1[0-5][0-9]|160)$')
   or pg_catalog.jsonb_typeof(v_price->'source_sha256') not in ('string','null')
   or (pg_catalog.jsonb_typeof(v_price->'source_sha256')='string'
      and (v_price->>'source_sha256') !~ '^[0-9a-f]{64}$')
  then raise exception 'd060_invalid_price_input' using errcode='22023';end if;
  v_no:=(v_price->>'line_no')::integer;
  if v_no=any(v_seen) then
   raise exception 'd060_duplicate_line' using errcode='22023';end if;
  v_seen:=pg_catalog.array_append(v_seen,v_no);
  select l.value into v_offer_line
    from pg_catalog.jsonb_array_elements(p_offer->'lines_snapshot') l(value)
    where l.value->>'line_no'=v_no::text;
  if not found then raise exception 'd060_line_not_in_quote' using errcode='22023';end if;
  v_vat:=v_price->>'vat_basis';
  if v_price->>'quoted_unit_price' is null then
   if v_price->>'source_line_no' is not null
    or v_price->>'source_sha256' is not null
    or v_offer_line->>'net_unit_price' is not null
   then raise exception 'd060_unverified_price' using errcode='22023';end if;
  else
   if v_price->>'source_line_no' is null
    or v_price->>'source_sha256' is null
   then raise exception 'd060_missing_evidence' using errcode='22023';end if;
   v_orig:=(v_price->>'quoted_unit_price')::numeric(18,2);
   if v_vat in ('no_informado','contradictorio') then
     if v_offer_line->>'net_unit_price' is not null
       or v_offer_line->>'vat_rate' is not null
     then raise exception 'd060_tax_assumed' using errcode='22023';end if;
   elsif v_vat='no_incluido' then
     if v_offer_line->>'net_unit_price' is distinct from
        v_price->>'quoted_unit_price'
     then raise exception 'd060_net_amount_mismatch' using errcode='22023';end if;
   else -- IVA included: when net is available, the quoted gross must recompute.
     if v_offer_line->>'net_unit_price' is not null then
       if v_offer_line->>'vat_rate' is null then
         raise exception 'd060_tax_rate_missing' using errcode='22023';end if;
       v_net:=(v_offer_line->>'net_unit_price')::numeric(18,2);
       v_rate:=(v_offer_line->>'vat_rate')::numeric;
       if pg_catalog.round(v_net*(1+v_rate/100),2)<>v_orig then
        raise exception 'd060_double_tax_or_rounding' using errcode='22023';end if;
     elsif v_offer_line->>'vat_rate' is not null then
       raise exception 'd060_tax_without_net' using errcode='22023';
     end if;
   end if;
  end if;
 end loop;
 -- This is in the same transaction as draft+version+source receipt D059.
 v_sha:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    p_prices::text,'UTF8')),'hex');
 v_result:=cotironda_private.whapi_receive_quote_d059(
   p_channel,p_message_key,p_expected_revision,p_offer);
 select * into v_r from cotironda_private.whapi_received_offers_d059
  where channel_id=p_channel and message_key=p_message_key;
 if not found then raise exception 'd060_source_receipt_missing' using errcode='40001';end if;
 select * into v_prior from cotironda_private.whapi_price_sources_d060
  where channel_id=p_channel and message_key=p_message_key;
 if found then
  if v_prior.round_id<>v_r.round_id
   or v_prior.supplier_org_id<>v_r.supplier_org_id
   or v_prior.offer_version<>v_r.version
   or v_prior.evidence_sha256<>v_sha
  then raise exception 'd060_evidence_replay_conflict' using errcode='23505';end if;
  return v_result||pg_catalog.jsonb_build_object('prices_preserved',true);
 end if;
 if v_result->>'repeated'<>'false' then
  raise exception 'd060_existing_version_missing_prices' using errcode='23505';end if;
 insert into cotironda_private.whapi_price_sources_d060
  (channel_id,message_key,round_id,supplier_org_id,offer_version,evidence_sha256)
 values(p_channel,p_message_key,v_r.round_id,v_r.supplier_org_id,v_r.version,v_sha);
 insert into cotironda_private.whapi_price_lines_d060
  (channel_id,message_key,line_no,quoted_unit_price,vat_basis,
   source_line_no,source_sha256)
 select p_channel,p_message_key,(q.value->>'line_no')::integer,
   (q.value->>'quoted_unit_price')::numeric(18,2),q.value->>'vat_basis',
   (q.value->>'source_line_no')::integer,q.value->>'source_sha256'
 from pg_catalog.jsonb_array_elements(p_prices) q(value);
 return v_result||pg_catalog.jsonb_build_object('prices_preserved',true);
end;$fn$;

grant select on cotironda_private.whapi_received_offers_d059
 to cotironda_price_writer_d060;
create policy d060_d059_receipt_read on cotironda_private.whapi_received_offers_d059
 for select to cotironda_price_writer_d060 using(true);

grant create on schema cotironda_private to cotironda_price_writer_d060;
grant cotironda_price_writer_d060 to postgres with set true,inherit false;
alter function cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)
 owner to cotironda_price_writer_d060;
revoke cotironda_price_writer_d060 from postgres;
revoke create on schema cotironda_private from cotironda_price_writer_d060;
revoke all on function
 cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function
 cotironda_private.whapi_receive_with_prices_d060(text,text,integer,jsonb,jsonb)
 to cotironda_price_gateway_d060;

-- Read path: current buyer may see ANONYMOUS supplier labels, quoted price,
-- IVA status, but NO identities, phone, source excerpt, or economic "total".
-- Reuse D025's session-checked buyer scope exactly.
grant select on cotironda_private.whapi_price_sources_d060,
 cotironda_private.whapi_price_lines_d060,
 cotironda_private.round_invites_v1,
 cotironda_private.offer_versions_v1
 to cotironda_rounds_reader;
create policy d060_buyer_source_read on cotironda_private.whapi_price_sources_d060
 for select to cotironda_rounds_reader using(true);
create policy d060_buyer_line_read on cotironda_private.whapi_price_lines_d060
 for select to cotironda_rounds_reader using(true);
create policy d060_buyer_invites_read on cotironda_private.round_invites_v1
 for select to cotironda_rounds_reader using(true);
create policy d060_buyer_versions_read on cotironda_private.offer_versions_v1
 for select to cotironda_rounds_reader using(true);

create function cotironda_private.buyer_quoted_prices_d060(p_round uuid)
returns table (supplier_alias text,offer_version integer,line_no integer,
 quoted_unit_price text,vat_basis text,currency text,quoted_unit text,
 available_qty text,freight_gross text,payment_method text,lead_days integer)
language plpgsql stable security definer set search_path='' as $fn$
begin
 -- D025 returns no row for foreign rounds AND raises for invalid sessions.
 if not exists(select 1 from cotironda_private.buyer_round_overview_v1(p_round))
 then return;end if;
 return query
 with latest as (
  select s.round_id,s.supplier_org_id,max(s.offer_version) as ver
  from cotironda_private.whapi_price_sources_d060 s
  where s.round_id=p_round
  group by s.round_id,s.supplier_org_id
 )
 select inv.anon_id,s.offer_version,l.line_no,
    case when l.quoted_unit_price is null then null::text
      else pg_catalog.to_char(l.quoted_unit_price,'FM999999999999990.00') end,
    l.vat_basis,v.currency,
    line.value->>'unit',
    line.value->>'available_qty',
    case when v.freight_gross is null then null::text
      else pg_catalog.to_char(v.freight_gross,'FM999999999999990.00') end,
    v.payment_method,v.lead_days
 from latest x
 join cotironda_private.whapi_price_sources_d060 s
  on s.round_id=x.round_id and s.supplier_org_id=x.supplier_org_id
    and s.offer_version=x.ver
 join cotironda_private.whapi_price_lines_d060 l
  on l.channel_id=s.channel_id and l.message_key=s.message_key
 join cotironda_private.offer_versions_v1 v
  on v.round_id=s.round_id and v.supplier_org_id=s.supplier_org_id
    and v.version=s.offer_version
 join lateral pg_catalog.jsonb_array_elements(v.lines_snapshot) line(value)
  on line.value->>'line_no'=l.line_no::text
 join cotironda_private.round_invites_v1 inv
  on inv.round_id=s.round_id and inv.supplier_org_id=s.supplier_org_id
 order by inv.anon_id,l.line_no;
end;$fn$;
grant create on schema cotironda_private to cotironda_rounds_reader;
grant cotironda_rounds_reader to postgres with set true,inherit false;
alter function cotironda_private.buyer_quoted_prices_d060(uuid)
 owner to cotironda_rounds_reader;
revoke cotironda_rounds_reader from postgres;
revoke create on schema cotironda_private from cotironda_rounds_reader;
revoke all on function cotironda_private.buyer_quoted_prices_d060(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.buyer_quoted_prices_d060(uuid) to authenticated;
create function public.buyer_quoted_prices_d060(p_round uuid)
returns table (supplier_alias text,offer_version integer,line_no integer,
 quoted_unit_price text,vat_basis text,currency text,quoted_unit text,
 available_qty text,freight_gross text,payment_method text,lead_days integer)
language sql stable security invoker set search_path='' as $fn$
 select p.supplier_alias,p.offer_version,p.line_no,p.quoted_unit_price,p.vat_basis,
  p.currency,p.quoted_unit,p.available_qty,p.freight_gross,p.payment_method,p.lead_days
 from cotironda_private.buyer_quoted_prices_d060(p_round) p;
$fn$;
revoke all on function public.buyer_quoted_prices_d060(uuid)
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function public.buyer_quoted_prices_d060(uuid) to authenticated;
comment on function public.buyer_quoted_prices_d060(uuid) is
 'MVP-010 buyer session validated by D025, latest supplier quote price, currency/unit/qty and declared economic terms; NOT comparable final total.';
