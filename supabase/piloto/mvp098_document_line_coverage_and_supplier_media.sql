-- MVP-098: private, idempotent per-line route plan, rooted in archived
-- document and its AI proposal. Suggestions NEVER initiate invitations.
create table cotironda_piloto_privado.document_lines_mvp098(
 message_hmac text not null references cotironda_piloto_privado.media_archive_mvp095(message_hmac),
 line_no smallint not null check(line_no between 1 and 25),
 description_literal text not null check(length(description_literal) between 2 and 250),
 quantity_literal text,
 unit_literal text,
 evidence_literal text not null check(length(evidence_literal) between 1 and 200),
 classified_family text,
 blocker text not null check(blocker in(
  'missing_quantity','missing_unit',
  'ambiguous_family','unsupported_family','needs_source_verification')),
 planned_at timestamptz not null default clock_timestamp(),
 primary key(message_hmac,line_no)
);
alter table cotironda_piloto_privado.document_lines_mvp098 enable row level security;
revoke all on cotironda_piloto_privado.document_lines_mvp098
 from public,anon,authenticated,service_role;
create index document_lines_mvp098_blocker_idx
 on cotironda_piloto_privado.document_lines_mvp098(message_hmac,blocker);

-- Classify only concrete commodity families with conservative literal rules.
-- Product specification is preserved exactly, never completed by a model.
create function cotironda_piloto_privado.family_preview_mvp098(p_description text)
returns text language plpgsql immutable set search_path='' as $fn$
declare d text;
begin
 d:=lower(btrim(p_description));
 if d ~ '(cemento)' and d !~ '(adhesivo|contacto|blanco|refractario|pintura)'
 then return 'cemento_gris_obra';end if;
 if d ~ '^(arena[[:space:]]+fina|arena[[:space:]]+zarandeada)'
 then return 'arena_fina';end if;
 if d ~ '^(arena[[:space:]]+gruesa)'
 then return 'arena_gruesa';end if;
 if d ~ '(huecos?[[:space:]]+del[[:space:]]+12|ladrillos?[[:space:]]+huecos?)'
 then return 'ladrillo_hueco';end if;
 if d ~ '(hidrófugo|hidrofugo|ceresita)'
 then return 'hidrofugo';end if;
 return null;
end;$fn$;
revoke all on function cotironda_piloto_privado.family_preview_mvp098(text)
 from public,anon,authenticated,service_role;

create function public.cotironda_piloto_plan_document_mvp098(p_message_hmac text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record;one_line record;nr int:=0;total_lines int:=0;
        f text;why text;rawqty text;rawunit text;literal text;ev text;city text;
begin
 if p_message_hmac !~ '^[a-f0-9]{64}$' then
  return jsonb_build_object('state','invalid');end if;
 select m.message_hmac,m.chat_hmac,m.participant_key,m.proposal,
 m.delivery_city_confirmed,m.state,m.review_state
 into a
 from cotironda_piloto_privado.media_archive_mvp095 m
 join cotironda_piloto_privado.participants p on
  p.key=m.participant_key and p.chat_hmac=m.chat_hmac
 where m.message_hmac=p_message_hmac and m.state='stored'
  and m.review_state='suggested_only' and m.request_id is null
  and m.proposal->>'kind'='buyer_request'
  and jsonb_typeof(m.proposal->'lines')='array'
  and p.participant_role='buyer' and p.consent_at is not null
  and p.opted_out_at is null
 for update of m;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 city:=coalesce(a.delivery_city_confirmed,a.proposal->>'delivery_city');
 total_lines:=jsonb_array_length(a.proposal->'lines');
 if total_lines not between 1 and 25 then
  return jsonb_build_object('state','unsupported_line_count');end if;
 if exists(select 1 from cotironda_piloto_privado.document_lines_mvp098
   where message_hmac=p_message_hmac) then
  return jsonb_build_object('state','already_planned');end if;
 for one_line in select x.value as item,x.ordinality as n
  from jsonb_array_elements(a.proposal->'lines') with ordinality as x(value,ordinality)
 loop
  literal:=one_line.item->>'original_description';
  ev:=one_line.item->>'evidence_location';
  rawqty:=one_line.item->>'quantity';
  rawunit:=one_line.item->>'unit';
  if literal is null or length(literal) not between 2 and 250 or
     ev is null or length(ev) not between 1 and 200
  then raise exception 'mvp098_source_line_invalid' using errcode='22023';end if;
  f:=cotironda_piloto_privado.family_preview_mvp098(literal);
  why:=case
   when rawqty is null or rawqty !~ '^[0-9]{1,6}([,][0-9]{1,3})?$'
      or replace(rawqty,',','.')::numeric<=0 then 'missing_quantity'
   when rawunit is null or length(btrim(rawunit))=0 then 'missing_unit'
   when lower(btrim(literal)) ~ '^arena$' then 'ambiguous_family'
   when f is null then 'unsupported_family'
   else 'needs_source_verification' end;
  -- A missing unit is not silently interpreted as bags/m3/units, and
  -- a generic arena is NOT silently designated fine or coarse.
  insert into cotironda_piloto_privado.document_lines_mvp098(
   message_hmac,line_no,description_literal,quantity_literal,unit_literal,
   evidence_literal,classified_family,blocker)
  values(p_message_hmac,one_line.n,literal,rawqty,rawunit,ev,f,why);
  nr:=nr+1;
 end loop;
 return jsonb_build_object('state','planned_private','lines',nr,
  'dispatch_performed',false,'invitations_created',0);
end;$fn$;
revoke all on function public.cotironda_piloto_plan_document_mvp098(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_plan_document_mvp098(text)
 to service_role;

-- Cover each product and each business independently; never compare totals
-- of partial offers. Catalogue entries are only declarations until confirmed.
create function public.cotironda_piloto_document_coverage_mvp098(p_message_hmac text)
returns jsonb language sql stable security definer set search_path='' as $fn$
 select coalesce(jsonb_agg(jsonb_build_object(
  'line_no',l.line_no,
  'description',l.description_literal,
  'quantity',l.quantity_literal,
  'unit',l.unit_literal,
  'family',l.classified_family,
  'blocker',l.blocker,
  'delivery_city_known',exists(
   select 1 from cotironda_piloto_privado.media_archive_mvp095 m
   where m.message_hmac=l.message_hmac
     and length(btrim(coalesce(m.delivery_city_confirmed,
        m.proposal->>'delivery_city','')))>=3
  ),
  'source_verified',false,
  'suppliers',coalesce((
     select jsonb_agg(jsonb_build_object(
       'supplier',p.key,
       'catalogue_confirmed',p.catalogue_confirmed_at is not null
     ) order by p.key)
     from cotironda_piloto_privado.media_archive_mvp095 m
     join cotironda_piloto_privado.participants p
      on lower(btrim(p.delivery_city))=lower(btrim(coalesce(
       m.delivery_city_confirmed,m.proposal->>'delivery_city')))
      and p.participant_role='supplier' and p.consent_at is not null
      and p.opted_out_at is null and p.chat_hmac is not null
     where m.message_hmac=l.message_hmac
      and exists(select 1 from cotironda_piloto_privado.catalogue_lines c
         where c.participant_key=p.key
          and c.family_code=l.classified_family
          and c.recognition_state='curated_family')
    ),'[]'::jsonb)
 ) order by l.line_no),'[]'::jsonb)
 from cotironda_piloto_privado.document_lines_mvp098 l
 where l.message_hmac=p_message_hmac
 and p_message_hmac ~ '^[a-f0-9]{64}$';
$fn$;
revoke all on function public.cotironda_piloto_document_coverage_mvp098(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_document_coverage_mvp098(text)
 to service_role;

-- Archive supplier quotes whose original is safely stored; no verified price
-- claims until all items/extra charges are corroborated against the original.
create table cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text primary key references cotironda_piloto_privado.media_archive_mvp095(message_hmac),
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 supplier_key text not null references cotironda_piloto_privado.participants(key),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text not null default 'awaiting_fidelity_check'
  check(state='awaiting_fidelity_check'),
 line_count smallint not null check(line_count between 1 and 25),
 declared_total_literal text,
 received_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.supplier_media_quotes_mvp098 enable row level security;
revoke all on cotironda_piloto_privado.supplier_media_quotes_mvp098
 from public,anon,authenticated,service_role;

create function public.cotironda_piloto_record_supplier_media_mvp098(p_message_hmac text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a record;nr integer;
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
 nr:=jsonb_array_length(a.proposal->'lines');
 if nr not between 1 and 25 then
  return jsonb_build_object('state','invalid_line_count');end if;
 insert into cotironda_piloto_privado.supplier_media_quotes_mvp098(
  message_hmac,request_id,supplier_key,source_sha256,line_count,
  declared_total_literal)
 values(p_message_hmac,a.request_id,a.participant_key,a.content_sha256,nr,
  a.proposal->>'total_declared') on conflict do nothing;
 if not found then return jsonb_build_object('state','duplicate');end if;
 return jsonb_build_object('state','stored_unverified','lines',nr);
end;$fn$;
revoke all on function public.cotironda_piloto_record_supplier_media_mvp098(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_supplier_media_mvp098(text)
 to service_role;
