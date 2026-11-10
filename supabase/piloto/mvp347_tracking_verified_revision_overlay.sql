-- MVP347 tracking overlay derived from READ-ONLY live PostgreSQL function,
-- 10/11/2026. Compatible with existing bearer-token authentication, exact
-- latest-message selection, stable anonymous ordering, legacy sources and
-- privacy rules. Do NOT deploy if runtime definition changed.
DO $mvp347_guard$
DECLARE fingerprint text;
BEGIN
 SELECT encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_tracking_status_mvp091(text)'::regprocedure
 ),'UTF8')),'hex') INTO fingerprint;
 IF fingerprint<>'b06e282511a1f53a8e69b3d35e2f3cd6a7a9fe3b0fb2bbd4249fb94670aef9de'
 THEN RAISE EXCEPTION 'mvp347_tracking_sql_baseline_drift';END IF;
 IF to_regclass('cotironda_piloto_privado.anonymous_supplier_revisions_mvp347') IS NULL
 THEN RAISE EXCEPTION 'mvp347_verified_revision_table_missing';END IF;
END $mvp347_guard$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_tracking_status_mvp091(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     select 1 from cotironda_piloto_privado.anonymous_supplier_revisions_mvp347 rev
     where rev.request_id=rid and rev.supplier_key=a.participant_key
       and rev.message_hmac=a.message_hmac
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
    and not exists(select 1 from cotironda_piloto_privado.anonymous_supplier_revisions_mvp347 rev
      where rev.message_hmac=s.hmac)
  union all
  select s.supplier_key,e.public_text
  from latest s
  join lateral (
   select e.public_text
   from cotironda_piloto_privado.supplier_evidence_mvp138 e
   where e.request_id=rid and e.supplier_key=s.supplier_key
    and e.message_hmac=s.hmac and e.state='verified'
    and e.verifier_version between 2 and 9
   order by e.verifier_version desc limit 1
  ) e on s.kind='media' and not exists (
    select 1 from cotironda_piloto_privado.anonymous_supplier_revisions_mvp347 rev
     where rev.message_hmac=s.hmac)
  union all
  select s.supplier_key,rev.public_text
  from latest s
  join cotironda_piloto_privado.anonymous_supplier_revisions_mvp347 rev
   on s.kind='media' and rev.request_id=rid
    and rev.supplier_key=s.supplier_key and rev.message_hmac=s.hmac
    and not exists(select 1 from cotironda_piloto_privado.anonymous_supplier_docs_mvp107 legacy
     where legacy.message_hmac=s.hmac)
    and not exists(select 1 from cotironda_piloto_privado.supplier_evidence_mvp138 e
     where e.message_hmac=s.hmac and e.state='verified')
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
end;$function$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_tracking_status_mvp091(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_tracking_status_mvp091(text) TO service_role;
