-- MVP346 — offline PG17, all fixtures synthetic, NEVER production. All rolled back.
\set ON_ERROR_STOP on
begin;
do $roles$
begin
 if not exists(select 1 from pg_roles where rolname='anon') then
  create role anon nologin;end if;
 if not exists(select 1 from pg_roles where rolname='authenticated') then
  create role authenticated nologin;end if;
 if not exists(select 1 from pg_roles where rolname='service_role') then
  create role service_role nologin;end if;
end;$roles$;
create schema cotironda_piloto_privado;
create table cotironda_piloto_privado.participants(
 key text primary key,chat_hmac text,participant_role text,
 consent_at timestamptz,opted_out_at timestamptz
);
create table cotironda_piloto_privado.requests(
 id uuid primary key,state text,closes_at timestamptz
);
create table cotironda_piloto_privado.invitations(
 request_id uuid,supplier_key text,state text
);
create table cotironda_piloto_privado.media_archive_mvp095(
 message_hmac text primary key,chat_hmac text,participant_key text,
 request_id uuid,content_sha256 text,mime text,state text,
 review_state text,proposal jsonb
);
create table cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac text primary key,request_id uuid,supplier_key text,
 source_sha256 text,line_count smallint,state text
);
create function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101()
returns trigger language plpgsql as $fn$
begin
 raise exception 'immutable';end;$fn$;
create function
 cotironda_piloto_privado.parse_amount_cents_mvp103(p_literal text)
returns bigint language sql immutable as $fn$
 select case when p_literal ~ '^\$[0-9]+,[0-9]{2}$'
 then (split_part(substring(p_literal from 2),',',1)::bigint * 100
  + split_part(p_literal,',',2)::bigint) else null end
$fn$;
\i supabase/piloto/mvp346_supplier_economic_revision_private.sql

insert into cotironda_piloto_privado.participants(
 key,chat_hmac,participant_role,consent_at)
values('proveedor_sintetico',repeat('c',64),'supplier',now());
insert into cotironda_piloto_privado.requests(id,state,closes_at)
values('11111111-1111-4111-8111-111111111111','prepared',now()+interval '1 day');
insert into cotironda_piloto_privado.invitations(request_id,supplier_key,state)
values('11111111-1111-4111-8111-111111111111','proveedor_sintetico','prepared');
insert into cotironda_piloto_privado.media_archive_mvp095(
 message_hmac,chat_hmac,participant_key,request_id,content_sha256,
 mime,state,review_state,proposal)
select repeat(x,64),repeat('c',64),'proveedor_sintetico',
 '11111111-1111-4111-8111-111111111111',repeat('f',64),
 'application/pdf','stored','suggested_only',
 '{
   "kind":"supplier_quote","status":"review_required",
   "delivery_city":null,"requested_delivery_note":"Contado",
   "total_declared":"$150,00","unanswered":[],
   "lines":[{"original_description":"Cemento CPC",
    "quantity":"2","unit":null,"unit_price":"$100,00",
    "line_total":"$150,00","evidence_location":"p1","ambiguity":null}]
  }'::jsonb
from (values('a'),('b')) as v(x);
insert into cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac,request_id,supplier_key,source_sha256,line_count,state)
select message_hmac,request_id,participant_key,content_sha256,1,
 'awaiting_fidelity_check'
from cotironda_piloto_privado.media_archive_mvp095;

do $smoke$
declare
 candidate jsonb; outcome jsonb;
begin
 select jsonb_set(proposal,'{lines,0,unit_price}',
   to_jsonb('$75,00'::text)) into candidate
 from cotironda_piloto_privado.media_archive_mvp095
 where message_hmac=repeat('a',64);
 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('a',64),repeat('0',64),candidate);
 if outcome->>'state'<>'source_mismatch' then
  raise exception 'must reject wrong SHA: %',outcome;end if;
 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('b',64),repeat('f',64),
  jsonb_set(candidate,'{lines,0,quantity}',to_jsonb('3'::text)));
 if outcome->>'state'<>'material_scope_mismatch' then
  raise exception 'must reject invented quantity: %',outcome;end if;
 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('b',64),repeat('f',64),
  jsonb_set(candidate,'{lines,0,unit_price}',to_jsonb('$74,00'::text)));
 if outcome->>'state'<>'invalid' then
  raise exception 'must reject unbalanced price: %',outcome;end if;
 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('a',64),repeat('f',64),candidate);
 if outcome->>'state'<>'candidate_stored' then
  raise exception 'candidate insert: %',outcome;end if;
 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('a',64),repeat('f',64),candidate);
 if outcome->>'state'<>'candidate_already_stored' then
  raise exception 'idempotent insert: %',outcome;end if;
 if (select count(*) from
  cotironda_piloto_privado.supplier_revision_candidates_mvp346)<>1
 then raise exception 'duplicate candidates';end if;
 if (select proposal->'lines'->0->>'unit_price'
  from cotironda_piloto_privado.media_archive_mvp095
  where message_hmac=repeat('a',64))<>'$100,00'
 then raise exception 'original mutated';end if;
 if has_function_privilege('anon',
  'public.cotironda_piloto_store_revision_candidate_mvp346(text,text,jsonb)',
  'EXECUTE')
 then raise exception 'public execution exposed';end if;
 if has_table_privilege('authenticated',
  'cotironda_piloto_privado.supplier_revision_candidates_mvp346','SELECT')
 then raise exception 'private candidate table exposed';end if;
end;$smoke$;
rollback;
select to_regnamespace('cotironda_piloto_privado') is null as rolled_back;
