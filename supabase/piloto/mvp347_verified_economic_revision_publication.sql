-- MVP347 — PILOTO ONLY, DEVELOPMENT CANDIDATE.
-- Only a PRIVATE, SHA-linked, independently source-covered MVP346 revision
-- may become a new anonymous document. No overwrite of the first reading,
-- legacy MVP101/102/103/106, rank, contacts, invites, or original source.
create table cotironda_piloto_privado.anonymous_supplier_revisions_mvp347(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_revision_candidates_mvp346(message_hmac),
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 supplier_key text not null references cotironda_piloto_privado.participants(key),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 candidate_sha256 text not null check(candidate_sha256 ~ '^[a-f0-9]{64}$'),
 verifier_version smallint not null check(verifier_version=1),
 public_text text not null check(length(public_text) between 20 and 12000),
 published_at timestamptz not null default clock_timestamp(),
 unique(message_hmac,request_id,supplier_key)
);
alter table cotironda_piloto_privado.anonymous_supplier_revisions_mvp347
 enable row level security;
revoke all on cotironda_piloto_privado.anonymous_supplier_revisions_mvp347
 from public,anon,authenticated,service_role;
create trigger supplier_revision_publication_immutable_mvp347
 before update or delete on
 cotironda_piloto_privado.anonymous_supplier_revisions_mvp347
 for each row execute function
 cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Service role must already have verified the original PDF against SHA,
-- exact commercial text and all money-bearing rows through the source
-- parser. This RPC independently verifies the persisted candidate's values
-- and permissions, then publishes it (or nothing) in one transaction.
create function public.cotironda_piloto_publish_revision_mvp347(
 p_message_hmac text,p_source_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare r record; l jsonb; i integer; count_ integer;
 subtotal bigint;unit_cents bigint;qty numeric;
 sum_ bigint:=0;declared bigint;
 text_ text:='';note_ text;candidate jsonb;digest_ text;bad text;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
   or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','invalid');end if;
 select c.message_hmac,c.request_id,c.supplier_key,c.source_sha256,
   c.candidate_proposal,c.original_proposal,q.line_count
 into r
 from cotironda_piloto_privado.supplier_revision_candidates_mvp346 c
 join cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  on q.message_hmac=c.message_hmac and q.request_id=c.request_id
   and q.supplier_key=c.supplier_key and q.source_sha256=c.source_sha256
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=c.message_hmac and m.request_id=c.request_id
   and m.participant_key=c.supplier_key and
   m.content_sha256=c.source_sha256
 join cotironda_piloto_privado.requests round_
  on round_.id=c.request_id
 join cotironda_piloto_privado.participants buyer
  on buyer.key=round_.buyer_key and buyer.participant_role='buyer'
 join cotironda_piloto_privado.participants supplier
  on supplier.key=c.supplier_key and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations invite
  on invite.request_id=c.request_id and invite.supplier_key=c.supplier_key
 where c.message_hmac=p_message_hmac
  and c.state='private_candidate'
  and c.source_sha256=p_source_sha256
  and q.state='awaiting_fidelity_check'
  and m.state='stored' and m.review_state='suggested_only'
  and m.mime='application/pdf'
  and m.proposal=c.original_proposal
  and m.proposal->>'kind'='supplier_quote'
  and round_.state='prepared' and round_.closes_at>clock_timestamp()
  and invite.state='prepared'
  and buyer.consent_at is not null and buyer.opted_out_at is null
  and supplier.participant_role='supplier' and supplier.consent_at is not null
  and supplier.opted_out_at is null
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.anonymous_supplier_revisions_mvp347
  where message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_published');end if;
 -- Independent publication routes must never expose conflicting versions.
 if exists(select 1 from cotironda_piloto_privado.anonymous_supplier_docs_mvp107
  where message_hmac=p_message_hmac)
  or exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138
  where message_hmac=p_message_hmac and state='verified')
 then return jsonb_build_object('state','already_verified_elsewhere');end if;
 candidate:=r.candidate_proposal;
 if candidate->>'kind' is distinct from 'supplier_quote'
  or candidate->>'status' is distinct from 'review_required'
  or candidate->'unanswered' is distinct from '[]'::jsonb
  or jsonb_typeof(candidate->'lines') is distinct from 'array'
  or jsonb_typeof(candidate->'total_declared') is distinct from 'string'
  or candidate->>'delivery_city' is distinct from
    r.original_proposal->>'delivery_city'
 then return jsonb_build_object('state','invalid');end if;
 count_:=jsonb_array_length(candidate->'lines');
 if count_<>r.line_count or count_ not between 1 and 25
 then return jsonb_build_object('state','invalid');end if;
 declared:=cotironda_piloto_privado.parse_amount_cents_mvp103(
  candidate->>'total_declared');
 if declared is null then return jsonb_build_object('state','invalid');end if;
 text_:='COTIRONDA · Presupuesto anónimo' || E'\n\n';
 for i in 0..count_-1 loop
  l:=candidate->'lines'->i;
  if jsonb_typeof(l) is distinct from 'object'
   or jsonb_typeof(l->'original_description') is distinct from 'string'
   or length(l->>'original_description') not between 2 and 250
   or not cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(
    l->>'original_description')
   or l->>'original_description' is distinct from
    r.original_proposal->'lines'->i->>'original_description'
   or l->>'quantity' is distinct from
    r.original_proposal->'lines'->i->>'quantity'
   or l->>'unit' is distinct from
    r.original_proposal->'lines'->i->>'unit'
   or coalesce(jsonb_typeof(l->'unit_price'),'missing') not in ('null','string')
   or coalesce(jsonb_typeof(l->'line_total'),'missing') not in ('string')
   or coalesce(jsonb_typeof(l->'ambiguity'),'missing') not in ('null','string')
   or nullif(btrim(coalesce(l->>'ambiguity','')),'') is not null
   or jsonb_typeof(l->'evidence_location') is distinct from 'string'
   or length(btrim(l->>'evidence_location'))=0
  then return jsonb_build_object('state','privacy_or_quality_review');end if;
  subtotal:=cotironda_piloto_privado.parse_amount_cents_mvp103(l->>'line_total');
  if subtotal is null then return jsonb_build_object('state','invalid');end if;
  if l->>'unit_price' is not null then
   unit_cents:=cotironda_piloto_privado.parse_amount_cents_mvp103(l->>'unit_price');
   if unit_cents is null or l->>'quantity' is null
    or l->>'quantity' !~ '^[0-9]{1,6}([.,][0-9]{1,3})?$'
   then return jsonb_build_object('state','invalid');end if;
   qty:=replace(l->>'quantity',',','.')::numeric;
   if qty<=0 or qty>1000000 or unit_cents::numeric*qty<>subtotal
   then return jsonb_build_object('state','invalid');end if;
  end if;
  if l->>'original_description' ~* '(descuento|bonificaci[oó]n|rebaja)'
   and subtotal>=0
  then return jsonb_build_object('state','invalid');end if;
  sum_:=sum_+subtotal;
  text_:=text_||(i+1)::text||'. '||(l->>'original_description')||
   case when l->>'quantity' is null then ''
    else E'\nCantidad: '||(l->>'quantity') end||
   case when l->>'unit' is null then ''
    else ' '||(l->>'unit') end||
   case when l->>'unit_price' is null then ''
    else E'\nPrecio unitario informado: '||(l->>'unit_price') end||
   E'\nImporte: '||(l->>'line_total')||E'\n\n';
 end loop;
 if sum_<>declared then return jsonb_build_object('state','invalid');end if;
 note_:=nullif(btrim(candidate->>'requested_delivery_note'),'');
 if length(coalesce(note_,''))>4096
 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 text_:=text_||'TOTAL DECLARADO: '||(candidate->>'total_declared')||
  case when note_ is null then '' else
   E'\n\nACLARACIONES DEL PROVEEDOR\n'||note_ end;
 if length(text_) not between 20 and 12000 or
  text_ ~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|tel[eé]fono|whatsapp|direcci[oó]n|domicilio|contacto|raz[oó]n social|[[:alnum:]_.%+-]+@[[:alnum:].-]+|[0-9]{8,})'
  or text_ ~ '[<>]'
  or replace(text_,E'\n','') ~ '[[:cntrl:]]'
 then return jsonb_build_object('state','privacy_or_quality_review');end if;
 digest_:=encode(sha256(convert_to(candidate::text,'UTF8')),'hex');
 insert into cotironda_piloto_privado.anonymous_supplier_revisions_mvp347(
  message_hmac,request_id,supplier_key,source_sha256,
  candidate_sha256,verifier_version,public_text)
 values(p_message_hmac,r.request_id,r.supplier_key,r.source_sha256,
  digest_,1,text_);
 return jsonb_build_object('state','published_anonymous',
  'ranking_allowed',false,'contact_revealed',false,
  'source_verified',true,'lines',count_);
end;$fn$;
revoke all on function
 public.cotironda_piloto_publish_revision_mvp347(text,text)
 from public,anon,authenticated;
grant execute on function
 public.cotironda_piloto_publish_revision_mvp347(text,text) to service_role;
