-- MVP138 / PILOTO ONLY. Minimal replacement for redundant, immutable source
-- gates. One independently verified proof per original+verifier revision.
-- Private original files and previous MVP102/103/106 ledgers stay untouched.
create table cotironda_piloto_privado.supplier_evidence_mvp138(
 message_hmac text not null references cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 verifier_version smallint not null default 1 check(verifier_version=1),
 request_id uuid not null references cotironda_piloto_privado.requests(id),
 supplier_key text not null references cotironda_piloto_privado.participants(key),
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 line_count smallint not null check(line_count between 1 and 25),
 state text not null check(state in ('verified','needs_source_review')),
 reason text not null check(reason in(
  'covered','invalid_input','unreadable','missing_line','missing_amount',
  'missing_total','uncovered_note','extra_charge','ambiguous',
  'amounts_unparseable','privacy_blocked')),
 sum_line_cents bigint,
 declared_total_cents bigint,
 public_text text check(length(public_text) between 20 and 12000),
 ranking_allowed boolean not null default false check(not ranking_allowed),
 checked_at timestamptz not null default clock_timestamp(),
 primary key(message_hmac,verifier_version),
 check((state='verified')=(reason='covered')),
 check((state='verified')=(public_text is not null)),
 check(state='needs_source_review' or (sum_line_cents is not null and declared_total_cents is not null))
);
alter table cotironda_piloto_privado.supplier_evidence_mvp138 enable row level security;
revoke all on cotironda_piloto_privado.supplier_evidence_mvp138
 from public,anon,authenticated,service_role;
create trigger supplier_evidence_immutable_mvp138
 before update or delete on cotironda_piloto_privado.supplier_evidence_mvp138
 for each row execute function cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

create or replace function cotironda_piloto_privado.price_cents_mvp138(p text)
returns bigint language plpgsql immutable set search_path='' as $fn$
declare v text;amount numeric;
begin
 if p is null or length(p)>64 then return null;end if;
 v:=btrim(p);
 v:=regexp_replace(v,'^[$][[:space:]]*','');
 if v ~ '^(0|[1-9][0-9]{0,8})$' then amount:=v::numeric;
 elsif v ~ '^[1-9][0-9]{0,2}(\.[0-9]{3})+,[0-9]{2}$'
 then amount:=replace(replace(v,'.',''),',','.')::numeric;
 elsif v ~ '^(0|[1-9][0-9]{0,8}),[0-9]{2}$'
 then amount:=replace(v,',','.')::numeric;
 else return null;end if;
 if amount>999999999 or amount<0 then return null;end if;
 return (amount*100)::bigint;
exception when others then return null;
end;$fn$;
revoke all on function cotironda_piloto_privado.price_cents_mvp138(text)
 from public,anon,authenticated,service_role;

-- Only the preexisting, authenticated scheduled worker can select a candidate.
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
  where e.message_hmac=q.message_hmac and e.verifier_version=1)
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
declare q record;lines record; cnt int;sum_ bigint:=0;v bigint;
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
 into q from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
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
  where e.message_hmac=p_message_hmac and e.verifier_version=1)
 then return jsonb_build_object('state','already_checked');end if;
 select count(*) into cnt from cotironda_piloto_privado.supplier_quote_lines_mvp101
 where message_hmac=p_message_hmac;
 if cnt<>p_line_count then return jsonb_build_object('state','mirror_incomplete');end if;
 if p_state='verified' then
  total_:=cotironda_piloto_privado.price_cents_mvp138(q.declared_total_literal);
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
   note_:=nullif(q.proposal->>'requested_delivery_note','');
   presentation:='COTIRONDA · Presupuesto anónimo'||E'\n\n'||body||
    E'\n\nTOTAL DECLARADO POR EL PROVEEDOR: '||q.declared_total_literal||
    case when sum_<>total_ then
     E'\nDiferencia entre total declarado y suma de renglones: verificar condiciones comerciales.'
     else '' end||
    case when note_ is null then '' else
     E'\n\nACLARACIONES DEL PROVEEDOR\n'||note_ end||
    E'\n\nIVA, moneda, stock o flete no informados expresamente: consultar las condiciones originales.'||
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
 values(p_message_hmac,1,q.request_id,q.supplier_key,q.source_sha256,
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
