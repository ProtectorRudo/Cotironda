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
create table cotironda_piloto_privado.anonymous_supplier_docs_mvp107(
 message_hmac text primary key
);
create table cotironda_piloto_privado.supplier_evidence_mvp138(
 message_hmac text primary key,state text
);
create function
 cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(p text)
returns boolean language sql immutable as $fn$
 select p ~ '^Cemento CPC$'
$fn$;
\i supabase/piloto/mvp347_verified_economic_revision_publication.sql

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
from (values('a'),('b'),('c')) as v(x);
insert into cotironda_piloto_privado.supplier_media_quotes_mvp098(
 message_hmac,request_id,supplier_key,source_sha256,line_count,state)
select message_hmac,request_id,participant_key,content_sha256,1,
 'awaiting_fidelity_check'
from cotironda_piloto_privado.media_archive_mvp095;

do $smoke$
declare
 candidate jsonb;bad_candidate jsonb;outcome jsonb;
begin
 select jsonb_set(proposal,'{lines,0,unit_price}',
  to_jsonb('$75,00'::text)) into candidate
 from cotironda_piloto_privado.media_archive_mvp095
 where message_hmac=repeat('a',64);
 outcome:=public.cotironda_piloto_publish_revision_mvp347(
  repeat('a',64),repeat('f',64));
 if outcome->>'state'<>'not_permitted'
 then raise exception 'unverified candidate was publishable';end if;

 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('a',64),repeat('f',64),candidate);
 if outcome->>'state'<>'candidate_stored'
 then raise exception 'candidate not stored: %',outcome;end if;
 outcome:=public.cotironda_piloto_publish_revision_mvp347(
  repeat('a',64),repeat('f',64));
 if outcome->>'state'<>'published_anonymous'
 then raise exception 'failed to publish valid revision: %',outcome;end if;
 outcome:=public.cotironda_piloto_publish_revision_mvp347(
  repeat('a',64),repeat('f',64));
 if outcome->>'state'<>'already_published'
 then raise exception 'idempotence failed: %',outcome;end if;
 if (select count(*) from
  cotironda_piloto_privado.anonymous_supplier_revisions_mvp347)<>1
 then raise exception 'not exactly one anonymous offer';end if;
 if (select position('Precio unitario informado: $75,00' in public_text)
  from cotironda_piloto_privado.anonymous_supplier_revisions_mvp347
  where message_hmac=repeat('a',64))=0
 then raise exception 'corrected price not visible';end if;
 if (select proposal->'lines'->0->>'unit_price'
  from cotironda_piloto_privado.media_archive_mvp095
  where message_hmac=repeat('a',64))<>'$100,00'
 then raise exception 'original mutated';end if;
 if (select candidate_sha256 from
  cotironda_piloto_privado.anonymous_supplier_revisions_mvp347
  where message_hmac=repeat('a',64))<>
   encode(sha256(convert_to(candidate::text,'UTF8')),'hex')
 then raise exception 'candidate digest altered';end if;

 -- The private candidate can exist, but personally identifying notes
 -- must never reach an anonymous buyer projection.
 bad_candidate:=jsonb_set(candidate,'{requested_delivery_note}',
  to_jsonb('WhatsApp: 2211234567'::text));
 outcome:=public.cotironda_piloto_store_revision_candidate_mvp346(
  repeat('b',64),repeat('f',64),bad_candidate);
 if outcome->>'state'<>'candidate_stored'
 then raise exception 'setup unsafe candidate: %',outcome;end if;
 outcome:=public.cotironda_piloto_publish_revision_mvp347(
  repeat('b',64),repeat('f',64));
 if outcome->>'state'<>'privacy_or_quality_review'
 then raise exception 'PII published: %',outcome;end if;

 -- Even if private candidate storage is corrupted, publishing must
 -- re-evaluate arithmetic independently.
 insert into cotironda_piloto_privado.supplier_revision_candidates_mvp346(
  message_hmac,request_id,supplier_key,source_sha256,
  original_proposal,candidate_proposal)
 select message_hmac,request_id,participant_key,content_sha256,
  proposal,
  jsonb_set(candidate,'{lines,0,unit_price}',to_jsonb('$74,00'::text))
 from cotironda_piloto_privado.media_archive_mvp095
 where message_hmac=repeat('c',64);
 outcome:=public.cotironda_piloto_publish_revision_mvp347(
  repeat('c',64),repeat('f',64));
 if outcome->>'state'<>'invalid'
 then raise exception 'corrupt candidate price published: %',outcome;end if;

 if has_function_privilege('anon',
   'public.cotironda_piloto_publish_revision_mvp347(text,text)','EXECUTE')
 or has_function_privilege('authenticated',
   'public.cotironda_piloto_publish_revision_mvp347(text,text)','EXECUTE')
 then raise exception 'publication exposed to public roles';end if;
 if has_table_privilege('anon',
   'cotironda_piloto_privado.anonymous_supplier_revisions_mvp347','SELECT')
 then raise exception 'anonymous revision table leaked';end if;
end;$smoke$;
rollback;
select to_regnamespace('cotironda_piloto_privado') is null as rolled_back;
