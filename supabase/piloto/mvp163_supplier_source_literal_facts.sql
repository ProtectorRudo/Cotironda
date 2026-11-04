-- MVP163. PILOTO ONLY. Secondary immutable, non-commercial source facts.
-- Original PDF/XLSX bytes, original quote rows and v9 evidence unchanged.
-- This intentionally does NOT alter tracking, offer prices or finalistas.
create table if not exists cotironda_piloto_privado.supplier_source_facts_mvp163(
 message_hmac text primary key references
  cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac)
  on delete restrict,
 request_id uuid not null references cotironda_piloto_privado.requests(id)
  on delete restrict,
 supplier_key text not null references cotironda_piloto_privado.participants(key)
  on delete restrict,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text not null check(state in ('source_checked','unreadable')),
 facts jsonb not null check(jsonb_typeof(facts)='object'
  and length(facts::text)<=12000),
 reviewed_at timestamptz not null default clock_timestamp()
);
alter table cotironda_piloto_privado.supplier_source_facts_mvp163
 enable row level security;
revoke all on cotironda_piloto_privado.supplier_source_facts_mvp163
 from public,anon,authenticated,service_role;

create or replace function public.cotironda_piloto_next_source_facts_mvp163()
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare job record;
begin
 select q.message_hmac,q.source_sha256,q.line_count,
  m.mime,m.size_bytes,m.proposal
 into job
 from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
  and m.participant_key=q.supplier_key
  and m.content_sha256=q.source_sha256
 join cotironda_piloto_privado.supplier_evidence_mvp138 e
  on e.message_hmac=q.message_hmac and e.verifier_version=9
  and e.request_id=q.request_id and e.supplier_key=q.supplier_key
  and e.source_sha256=q.source_sha256 and e.state='verified'
 join cotironda_piloto_privado.invitations i
  on i.request_id=q.request_id and i.supplier_key=q.supplier_key
 join cotironda_piloto_privado.participants supplier
  on supplier.key=q.supplier_key and supplier.chat_hmac=m.chat_hmac
 join cotironda_piloto_privado.requests r on r.id=q.request_id
 join cotironda_piloto_privado.participants buyer on buyer.key=r.buyer_key
 where q.line_count between 1 and 25
 and q.received_at>=r.created_at and q.received_at<=r.closes_at
 and m.state='stored' and m.review_state='suggested_only'
 and m.storage_path='media/'||q.message_hmac
 and m.size_bytes between 120 and 8388608
 and m.mime in ('application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain','text/csv')
 and m.proposal->>'kind'='supplier_quote'
 and jsonb_typeof(m.proposal->'lines')='array'
 and jsonb_array_length(m.proposal->'lines')=q.line_count
 and supplier.participant_role='supplier'
 and supplier.consent_at is not null and supplier.opted_out_at is null
 and buyer.participant_role='buyer'
 and buyer.consent_at is not null and buyer.opted_out_at is null
 and r.state in ('prepared','closed')
 and i.state='prepared'
 and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 later
  where later.message_hmac=q.message_hmac and later.verifier_version>9)
 and not exists(select 1 from cotironda_piloto_privado.supplier_source_facts_mvp163 f
  where f.message_hmac=q.message_hmac)
 order by q.received_at,q.message_hmac limit 1;
 if not found then return jsonb_build_object('state','none');end if;
 return jsonb_build_object('state','candidate','message_hmac',job.message_hmac,
  'source_sha256',job.source_sha256,'line_count',job.line_count,
  'mime',job.mime,'size_bytes',job.size_bytes,'proposal',job.proposal);
end;$fn$;

create or replace function public.cotironda_piloto_record_source_facts_mvp163(
 p_message_hmac text,p_source_sha256 text,p_state text,p_facts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare quote_ record; l jsonb; inserted integer:=0; ordinal int:=0;
begin
 if coalesce(p_message_hmac,'') !~ '^[a-f0-9]{64}$'
  or coalesce(p_source_sha256,'') !~ '^[a-f0-9]{64}$'
  or p_state not in ('source_checked','unreadable')
  or p_facts is null or jsonb_typeof(p_facts)<>'object'
  or length(p_facts::text)>12000
  or jsonb_typeof(p_facts->'lines')<>'array'
  or jsonb_typeof(p_facts->'terms')<>'object'
  or p_facts->>'rankingAllowed'<>'false'
  or p_facts->>'sourceImmutabilityPreserved'<>'true'
 then return jsonb_build_object('state','invalid');end if;
 -- Terms are categorical ONLY. No price, original text or identifiers.
 if p_facts->'terms'->>'iva' not in
  ('not_stated','included_rate_unknown','excluded_rate_unknown',
   'rate_seen','contradictory')
 or p_facts->'terms'->>'freight' not in
  ('not_stated','to_agree','included','free','amount_mentioned','contradictory')
 or p_facts->'terms'->>'payment' not in
  ('not_stated','cash','transfer','credit','multiple')
 or p_facts->'terms'->>'stock'<>'not_proven'
 or (select count(*) from jsonb_object_keys(p_facts))<>4
 or (select count(*) from jsonb_object_keys(p_facts->'terms'))<>4
 then return jsonb_build_object('state','invalid');end if;
 select q.message_hmac,q.request_id,q.supplier_key,q.line_count
 into quote_ from cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 join cotironda_piloto_privado.media_archive_mvp095 m
  on m.message_hmac=q.message_hmac and m.request_id=q.request_id
  and m.content_sha256=q.source_sha256 and m.participant_key=q.supplier_key
  and m.storage_path='media/'||q.message_hmac and m.state='stored'
 join cotironda_piloto_privado.supplier_evidence_mvp138 e
  on e.message_hmac=q.message_hmac and e.verifier_version=9
  and e.state='verified' and e.source_sha256=q.source_sha256
  and e.supplier_key=q.supplier_key and e.request_id=q.request_id
 where q.message_hmac=p_message_hmac and q.source_sha256=p_source_sha256
  and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 later
   where later.message_hmac=q.message_hmac and later.verifier_version>9)
 for update of q;
 if not found then return jsonb_build_object('state','not_permitted');end if;
 if exists(select 1 from cotironda_piloto_privado.supplier_source_facts_mvp163 f
  where f.message_hmac=p_message_hmac)
 then return jsonb_build_object('state','already_checked');end if;
 if p_state='source_checked' and
   jsonb_array_length(p_facts->'lines')<>quote_.line_count
  or p_state='unreadable' and
   jsonb_array_length(p_facts->'lines')<>0
 then return jsonb_build_object('state','invalid_lines');end if;
 for l in select value from jsonb_array_elements(p_facts->'lines') loop
  ordinal:=ordinal+1;
  if jsonb_typeof(l)<>'object'
   or (select count(*) from jsonb_object_keys(l))<>6
   or l->>'lineNo'<>ordinal::text
   or l->>'unitStatus' not in
    ('explicit','not_explicit','ambiguous','not_found')
   or l->>'presentation' not in ('big_bag','bolson','bag_weight','none')
   or (l->>'unit' is not null and l->>'unit' not in
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack'))
   or (l->>'unitStatus'='explicit') <> (l->>'unit' is not null)
   or (l->>'page' is not null and
    (l->>'page' !~ '^[0-9]{1,2}$' or (l->>'page')::integer not between 1 and 12))
   or (l->>'row' is not null and
    (l->>'row' !~ '^[0-9]{1,3}$' or (l->>'row')::integer not between 1 and 300))
   or (l->>'page' is null)<>(l->>'row' is null)
  then return jsonb_build_object('state','invalid_lines');end if;
 end loop;
 insert into cotironda_piloto_privado.supplier_source_facts_mvp163(
  message_hmac,request_id,supplier_key,source_sha256,state,facts)
 values(p_message_hmac,quote_.request_id,quote_.supplier_key,p_source_sha256,p_state,p_facts)
 on conflict(message_hmac) do nothing;
 get diagnostics inserted=row_count;
 return jsonb_build_object('state',case when inserted=1 then
  'recorded' else 'already_checked' end);
end;$fn$;

revoke all on function public.cotironda_piloto_next_source_facts_mvp163()
 from public,anon,authenticated;
revoke all on function public.cotironda_piloto_record_source_facts_mvp163(
 text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.cotironda_piloto_next_source_facts_mvp163()
 to service_role;
grant execute on function public.cotironda_piloto_record_source_facts_mvp163(
 text,text,text,jsonb) to service_role;
