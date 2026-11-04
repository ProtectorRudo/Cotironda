-- MVP141 PILOTO: append-only v4 of original-byte verifier. No DDL changes,
-- never overwrites versions 1, 2 or 3; rollback restores MVP140 RPC.
create or replace function public.cotironda_piloto_next_supplier_evidence_mvp138()
returns jsonb language plpgsql security definer volatile set search_path='' as $fn$
declare job record;
begin
 select q.message_hmac,q.source_sha256,q.line_count,m.mime,m.size_bytes,
        m.proposal
 into job from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
 on m.message_hmac=q.message_hmac and m.content_sha256=q.source_sha256
  and m.participant_key=q.supplier_key and m.request_id=q.request_id
 join cotironda_piloto_privado.participants p on
  p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i on
  i.supplier_key=q.supplier_key and i.request_id=q.request_id
 join cotironda_piloto_privado.requests r on r.id=q.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where q.state='awaiting_fidelity_check' and m.state='stored'
 and m.review_state='suggested_only'
 and m.proposal->>'kind'='supplier_quote'
 and m.storage_path='media/'||q.message_hmac
 and q.source_sha256 ~ '^[a-f0-9]{64}$'
 and q.line_count between 1 and 25
 and m.size_bytes between 120 and 8388608
 and m.mime in ('application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','text/csv')
 and p.participant_role='supplier' and p.consent_at is not null
 and p.opted_out_at is null and buyer.participant_role='buyer'
 and buyer.consent_at is not null and buyer.opted_out_at is null
 and r.state='prepared' and r.closes_at>clock_timestamp()
 and i.state='prepared'
 and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 e
  where e.message_hmac=q.message_hmac and e.verifier_version=4)
 order by q.received_at,q.message_hmac limit 1;
 if not found then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate','message_hmac',job.message_hmac,
 'source_sha256',job.source_sha256,'mime',job.mime,'size_bytes',job.size_bytes,
 'line_count',job.line_count,'proposal',job.proposal);
end;$fn$;
revoke all on function public.cotironda_piloto_next_supplier_evidence_mvp138()
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_next_supplier_evidence_mvp138()
 to service_role;

create or replace function public.cotironda_piloto_record_supplier_evidence_mvp138(
 p_message_hmac text,p_source_sha256 text,p_state text,p_reason text,
 p_line_count integer)
returns jsonb language plpgsql security definer volatile set search_path='' as $fn$
declare quote_ record;lines record; cnt int;sum_ bigint:=0;v bigint;
 total_ bigint;note_ text;presentation text;body text;
begin
 if p_message_hmac is null or p_message_hmac !~ '^[a-f0-9]{64}$'
 or p_source_sha256 is null or p_source_sha256 !~ '^[a-f0-9]{64}$'
 or p_line_count not between 1 and 25 or
 not (p_state='verified' and p_reason='covered' or
  p_state='needs_source_review' and p_reason in
   ('invalid_input','unreadable','missing_line','missing_amount',
   'missing_total','uncovered_note','extra_charge','ambiguous'))
 then return jsonb_build_object('state','invalid');end if;
 select q.message_hmac,q.request_id,q.supplier_key,q.source_sha256,
  q.line_count,q.declared_total_literal,m.proposal
 into quote_ from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
 on m.message_hmac=q.message_hmac and m.content_sha256=q.source_sha256
  and m.participant_key=q.supplier_key and m.request_id=q.request_id
 join cotironda_piloto_privado.participants p on
  p.key=q.supplier_key and p.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.invitations i on
  i.supplier_key=q.supplier_key and i.request_id=q.request_id
 join cotironda_piloto_privado.requests r on r.id=q.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where q.message_hmac=p_message_hmac and q.source_sha256=p_source_sha256
 and q.line_count=p_line_count and q.state='awaiting_fidelity_check'
 and m.state='stored' and m.review_state='suggested_only'
 and m.proposal->>'kind'='supplier_quote'
 and m.storage_path='media/'||q.message_hmac
 and p.participant_role='supplier' and p.consent_at is not null
 and p.opted_out_at is null and buyer.participant_role='buyer'
 and buyer.consent_at is not null and buyer.opted_out_at is null
 and r.state='prepared' and r.closes_at>clock_timestamp()
 and i.state='prepared'
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 e
  where e.message_hmac=p_message_hmac and e.verifier_version=4)
 then return jsonb_build_object('state','already_checked');end if;
 select count(*) into cnt from cotironda_piloto_privado.supplier_quote_lines_mvp101
 where message_hmac=p_message_hmac;
 if cnt<>p_line_count then return jsonb_build_object('state','mirror_incomplete');end if;
 if p_state='verified' then
  total_:=cotironda_piloto_privado.price_cents_mvp138(quote_.declared_total_literal);
  if total_ is null then p_state:='needs_source_review';p_reason:='amounts_unparseable';end if;
  if p_state='verified' then
   for lines in select * from cotironda_piloto_privado.supplier_quote_lines_mvp101
    where message_hmac=p_message_hmac order by line_no loop
    v:=cotironda_piloto_privado.price_cents_mvp138(lines.line_total_literal);
    if v is null or
      lines.description_literal is null or lines.unit_price_literal is null
      or length(lines.description_literal)>250 then
      p_state:='needs_source_review';p_reason:='amounts_unparseable';exit;
    end if;
    sum_:=sum_+v;
   end loop;
  end if;
  if p_state='verified' then
   select string_agg(
    l.line_no||'. '||l.description_literal||
     E'\nCantidad: '||coalesce(l.quantity_literal,'No informada')||
     case when l.unit_literal is null then '' else ' '||l.unit_literal end||
     E'\nPrecio unitario informado: '||l.unit_price_literal||
     E'\nImporte declarado por el proveedor: '||l.line_total_literal,
     E'\n\n' order by l.line_no)
   into body
   from cotironda_piloto_privado.supplier_quote_lines_mvp101 l
   where l.message_hmac=p_message_hmac;
   note_:=nullif(quote_.proposal->>'requested_delivery_note','');
   presentation:='COTIRONDA · Presupuesto anónimo'||E'\n\n'||body||
    E'\n\nTOTAL DECLARADO POR EL PROVEEDOR: '||quote_.declared_total_literal||
    case when sum_<>total_ then
     E'\nDiferencia entre total declarado y suma de renglones: verificar condiciones comerciales.'
     else '' end||
    case when note_ is null then '' else
     E'\n\nACLARACIONES DEL PROVEEDOR\n'||note_ end||
    E'\n\nIVA, moneda, disponibilidad y flete: consultar las aclaraciones expresas; lo ausente se considera no informado.'||
    E'\nEsta es una cotización recibida, no un ranking de ofertas equivalentes.';
   if length(presentation)>12000 or
     presentation ~* '(https?://|www[.]|wa[.]me|@[[:alnum:]_]|cuit|cuil|whatsapp|tel[eé]fono|direcci[oó]n|domicilio|contacto|[0-9]{8,})'
   then p_state:='needs_source_review';p_reason:='privacy_blocked';presentation:=null;
   end if;
  end if;
 end if;
 insert into cotironda_piloto_privado.supplier_evidence_mvp138(
 message_hmac,verifier_version,request_id,supplier_key,source_sha256,
 line_count,state,reason,sum_line_cents,declared_total_cents,public_text)
 values(p_message_hmac,4,quote_.request_id,quote_.supplier_key,quote_.source_sha256,
  p_line_count,p_state,p_reason,
  case when p_state='verified' then sum_ else null end,
  case when p_state='verified' then total_ else null end,
  case when p_state='verified' then presentation else null end);
 return jsonb_build_object('state',p_state,'reason',p_reason,
 'ranking_allowed',false,'source_reviewed',p_state='verified',
 'published_anonymous',p_state='verified');
end;$fn$;
revoke all on function public.cotironda_piloto_record_supplier_evidence_mvp138(text,text,text,text,integer)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_record_supplier_evidence_mvp138(text,text,text,text,integer)
 to service_role;


-- MVP-107: buyer sees reviewed text offers OR source-covered safe supplier docs,
-- only the latest version per business and without merchant contact details.
-- Existing HMAC+token+buyer consent gates remain identical to MVP-095.
-- No automatic projection from unverified supplier documents.
-- MVP095: no quote claims for unread supplier files.
create or replace function public.cotironda_piloto_tracking_status_mvp091(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rid uuid; status text; cutoff timestamptz;
        n integer; pending_files integer; approved jsonb; now_ timestamptz;
begin
 now_:=clock_timestamp();
 if p_token_hash !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('state','not_found');end if;
 select t.request_id,r.state,r.closes_at into rid,status,cutoff
 from cotironda_piloto_privado.buyer_tracking_mvp091 t
 join cotironda_piloto_privado.requests r on r.id=t.request_id
 join cotironda_piloto_privado.participants p on p.key=r.buyer_key
 where t.token_hash=p_token_hash and t.revoked_at is null
 and t.expires_at>now_ and p.participant_role='buyer'
 and p.consent_at is not null and p.opted_out_at is null;
 if rid is null then return jsonb_build_object('state','not_found');end if;
 select count(distinct s.supplier_key) into n
 from (
  select v.supplier_key from cotironda_piloto_privado.offer_versions v
    where v.request_id=rid and v.created_at<=cutoff
  union all
  select q.supplier_key
   from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
   where q.request_id=rid and q.received_at<=cutoff
 ) s
 join cotironda_piloto_privado.invitations i
  on i.request_id=rid and i.supplier_key=s.supplier_key;
 -- Count only private, archived supplier files for the same round.
 -- These are NOT verified quotes, so never include them in received_count.
 select count(distinct a.participant_key) into pending_files
 from cotironda_piloto_privado.media_archive_mvp095 a
 where a.request_id=rid and a.state='stored'
   and a.reserved_at<=cutoff
   and not exists (
     select 1 from cotironda_piloto_privado.anonymous_supplier_docs_mvp107 d
     where d.request_id=rid and d.supplier_key=a.participant_key
       and d.message_hmac=a.message_hmac
   )
   and not exists (
     select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 e
     where e.message_hmac=a.message_hmac and e.state='verified'
   )
   and not exists (
     select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=rid and v.supplier_key=a.participant_key
       and v.created_at<=cutoff
   );
 -- The projection is already operator-reviewed and deliberately lacks
 -- merchant identity/contact details. The presence of a raw supplier file or
 -- its model draft is NEVER enough to show contents to a buyer.
 -- Use only the LATEST supplier revision; a later unapproved quote hides
 -- the old projection until the new revision has been reviewed.
 with sources as (
  select v.supplier_key,v.source_message_hmac as hmac,v.created_at as created,
   'text'::text as kind,v.revision_no
  from cotironda_piloto_privado.offer_versions v
  where v.request_id=rid and v.created_at<=cutoff
  union all
  select q.supplier_key,q.message_hmac as hmac,q.received_at as created,
   'media'::text as kind,null::smallint as revision_no
  from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
  where q.request_id=rid and q.received_at<=cutoff
 ), latest as (
  select distinct on (supplier_key) * from sources
  order by supplier_key,created desc,hmac desc
 ), projections as (
  select s.supplier_key,a.public_text
  from latest s
  join cotironda_piloto_privado.anonymous_offers_mvp091 a
   on s.kind='text' and a.request_id=rid and
      a.supplier_key=s.supplier_key and a.revision_no=s.revision_no
  union all
  select s.supplier_key,d.public_text
  from latest s
  join cotironda_piloto_privado.anonymous_supplier_docs_mvp107 d
   on s.kind='media' and d.request_id=rid
    and d.supplier_key=s.supplier_key and d.message_hmac=s.hmac
    and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 e
      where e.message_hmac=s.hmac and e.state='verified')
  union all
  select s.supplier_key,e.public_text
  from latest s
  join lateral (
   select e.public_text
   from cotironda_piloto_privado.supplier_evidence_mvp138 e
   where e.request_id=rid and e.supplier_key=s.supplier_key
    and e.message_hmac=s.hmac and e.state='verified'
    and e.verifier_version between 2 and 4
   order by e.verifier_version desc limit 1
  ) e on s.kind='media'
 )
 select coalesce(jsonb_agg(
  jsonb_build_object('label','Presupuesto '||seq,'text',public_text)
  order by seq),'[]'::jsonb) into approved
 from (
   select public_text,row_number() over(
     order by md5(rid::text||supplier_key)) as seq
   from projections
   where public_text !~*
    '(https?://|wa[.]me/|[[:alnum:]_.%+-]+@[[:alnum:].-]+|whatsapp[[:space:]:]|tel[eé]fono[[:space:]:]|cuit|cuil|[0-9]{8,})'
 ) safe;
 -- Only consented buyer with token can access a reviewed, anonymous
 -- projection DURING the round. No rankings/contacts/winners are revealed.
 -- Cancellation always hides all supplier contents.
 if status='cancelled' then
  return jsonb_build_object('state','cancelled','received_count',n,
   'files_pending_review',pending_files,'deadline',cutoff,
   'can_open',false,'offers','[]'::jsonb);
 end if;
 return jsonb_build_object(
   'state',case when status='closed' and now_>=cutoff
     then 'closed' else 'waiting' end,
   'received_count',n,'files_pending_review',pending_files,
   'deadline',cutoff,'can_open',jsonb_array_length(approved)>0,
   'offers',approved);
end;$fn$;
revoke all on function public.cotironda_piloto_tracking_status_mvp091(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_tracking_status_mvp091(text)
 to service_role;


