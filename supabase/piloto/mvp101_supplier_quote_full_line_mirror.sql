-- MVP-101, PILOTO ONLY. A receipt is not a verified economic offer.
-- Store the full AI transcription line-by-line, including unrequested extras,
-- atomically with its supplier-media receipt. Original binary stays private.
create table cotironda_piloto_privado.supplier_quote_lines_mvp101(
 message_hmac text not null references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 line_no smallint not null check(line_no between 1 and 25),
 description_literal text not null
  check(length(description_literal) between 2 and 250),
 quantity_literal text check(length(quantity_literal)<=50),
 unit_literal text check(length(unit_literal)<=70),
 unit_price_literal text check(length(unit_price_literal)<=100),
 line_total_literal text check(length(line_total_literal)<=120),
 evidence_literal text not null check(length(evidence_literal)<=200),
 ambiguity_literal text check(length(ambiguity_literal)<=150),
 primary key(message_hmac,line_no)
);
alter table cotironda_piloto_privado.supplier_quote_lines_mvp101
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_quote_lines_mvp101
 from public,anon,authenticated,service_role;

-- Only the privileged ingest routine may insert. Never replace a transcription:
-- a corrected supplier document must arrive as a *new* Whapi HMAC/version.
create function cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
returns trigger language plpgsql set search_path='' as $fn$
begin
 raise exception 'supplier_quote_transcription_immutable_mvp101'
  using errcode='23514';
end;$fn$;
revoke all on function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
 from public,anon,authenticated,service_role;
create trigger supplier_quote_lines_immutable_mvp101
 before update or delete on cotironda_piloto_privado.supplier_quote_lines_mvp101
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Keep exactly the same owner, permission, consent and active-invitation gates
-- as MVP-098; add atomic full-line snapshot, never economic authorization.
create or replace function public.cotironda_piloto_record_supplier_media_mvp098(
 p_message_hmac text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record;nr integer;line_entry record;v jsonb;written integer;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid');end if;
 select m.* into a from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p on p.key=m.participant_key
  and p.chat_hmac=m.chat_hmac and p.participant_role='supplier'
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.request_id is not null and m.review_state='suggested_only'
  and m.proposal->>'kind'='supplier_quote'
  and p.consent_at is not null and p.opted_out_at is null
  and exists(select 1 from cotironda_piloto_privado.invitations i
   join cotironda_piloto_privado.requests r on r.id=i.request_id
   where i.supplier_key=m.participant_key and i.request_id=m.request_id
    and i.state='prepared' and r.state='prepared'
    and r.closes_at>clock_timestamp())
 for update of m;
 if not found then return jsonb_build_object('state','not_eligible');end if;
 if jsonb_typeof(a.proposal->'lines') is distinct from 'array'
 then return jsonb_build_object('state','invalid_lines');end if;
 nr:=jsonb_array_length(a.proposal->'lines');
 if nr not between 1 and 25 then
  return jsonb_build_object('state','invalid_line_count');end if;

 -- Validate every line BEFORE creating the header. Missing optional fields
 -- are allowed; fabricated numeric types, blank labels and broken provenance
 -- must not be silently transformed into a quote.
 for line_entry in
  select x.value as item,x.ordinality as n
  from jsonb_array_elements(a.proposal->'lines') with ordinality
   as x(value,ordinality)
 loop
  v:=line_entry.item;
  if jsonb_typeof(v) is distinct from 'object'
   or jsonb_typeof(v->'original_description') is distinct from 'string'
   or length(v->>'original_description') not between 2 and 250
   or jsonb_typeof(v->'evidence_location') is distinct from 'string'
   or length(v->>'evidence_location')>200
   or coalesce(jsonb_typeof(v->'quantity'),'null') not in ('string','null')
   or coalesce(jsonb_typeof(v->'unit'),'null') not in ('string','null')
   or coalesce(jsonb_typeof(v->'unit_price'),'null') not in ('string','null')
   or coalesce(jsonb_typeof(v->'line_total'),'null') not in ('string','null')
   or coalesce(jsonb_typeof(v->'ambiguity'),'null') not in ('string','null')
   or length(v->>'quantity')>50 or length(v->>'unit')>70
   or length(v->>'unit_price')>100 or length(v->>'line_total')>120
   or length(v->>'ambiguity')>150
  then return jsonb_build_object('state','invalid_source_line',
    'line_no',line_entry.n);end if;
 end loop;

 insert into cotironda_piloto_privado.supplier_media_quotes_mvp098(
  message_hmac,request_id,supplier_key,source_sha256,line_count,
  declared_total_literal)
 values(p_message_hmac,a.request_id,a.participant_key,a.content_sha256,nr,
  a.proposal->>'total_declared') on conflict do nothing;
 if not found then
  return jsonb_build_object('state','duplicate',
    'line_mirror_complete',(
       select count(*)=nr from cotironda_piloto_privado.supplier_quote_lines_mvp101
       where message_hmac=p_message_hmac));
 end if;
 insert into cotironda_piloto_privado.supplier_quote_lines_mvp101(
  message_hmac,line_no,description_literal,quantity_literal,unit_literal,
  unit_price_literal,line_total_literal,evidence_literal,ambiguity_literal)
 select p_message_hmac,x.ordinality,(x.value->>'original_description'),
        x.value->>'quantity',x.value->>'unit',x.value->>'unit_price',
        x.value->>'line_total',x.value->>'evidence_location',
        x.value->>'ambiguity'
 from jsonb_array_elements(a.proposal->'lines') with ordinality
  as x(value,ordinality);
 get diagnostics written=row_count;
 if written<>nr then
  raise exception 'supplier_quote_line_count_mismatch_mvp101'
   using errcode='23514';
 end if;
 return jsonb_build_object('state','stored_unverified','lines',nr,
  'mirror_lines',written,'source_verified',false,'ranking_allowed',false);
end;$fn$;
revoke all on function public.cotironda_piloto_record_supplier_media_mvp098(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_supplier_media_mvp098(text)
 to service_role;

-- No backfill of previous receipts is claimed. Historical files remain
-- unverified until an explicit, separately audited recovery is implemented.
