-- MVP-091 / Supabase PILOTO only.
-- A one-time buyer link uses high-entropy random fragment, not URL query.
-- Secrets never stored plaintext; no merchant identities/prices before close.
do $gate$
begin
 if to_regclass('cotironda_piloto_privado.requests') is null or
    to_regclass('cotironda_piloto_privado.offer_versions') is null or
    to_regprocedure('public.cotironda_piloto_receive_whapi_v1(text,text,text,text,text,text,bigint,text,text,jsonb)') is null
 then raise exception 'mvp091_not_pilot' using errcode='42501';end if;
end $gate$;

create table cotironda_piloto_privado.buyer_tracking_mvp091(
 request_id uuid primary key references cotironda_piloto_privado.requests(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 send_state text not null default 'pending' check(send_state in ('pending','api_accepted','uncertain')),
 send_attempted_at timestamptz,
 check(expires_at>created_at),
 check(expires_at<=created_at+interval '40 days')
);
alter table cotironda_piloto_privado.buyer_tracking_mvp091 enable row level security;
revoke all on cotironda_piloto_privado.buyer_tracking_mvp091
 from public,anon,authenticated,service_role;

-- Must be called ONLY for an authenticated buyer webhook that has just
-- committed an actual request; source_hmac acts as a strict message binding.
create function public.cotironda_piloto_issue_tracking_mvp091(
 p_buyer_chat_hmac text,p_source_hmac text,p_token_hash text
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rid uuid; expiry timestamptz; issued integer;
begin
 if p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
 or p_source_hmac !~ '^[a-f0-9]{64}$'
 or p_token_hash !~ '^[a-f0-9]{64}$'
 then raise exception 'mvp091_invalid_tracking_request' using errcode='22023';end if;
 select r.id, least(r.closes_at+interval '30 days',
     clock_timestamp()+interval '35 days')
 into rid,expiry
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.participants p on p.key=r.buyer_key
 where p.participant_role='buyer' and p.chat_hmac=p_buyer_chat_hmac
   and p.consent_at is not null and p.opted_out_at is null
   and r.source_hmac=p_source_hmac
   and r.state='prepared' and r.created_at>clock_timestamp()-interval '5 minutes'
   and exists(select 1 from cotironda_piloto_privado.integration_flags f
      where f.only_row and f.whatsapp_outbound_enabled=true)
   and r.closes_at>clock_timestamp()
 for update of r;
 if rid is null then return jsonb_build_object('state','not_eligible');end if;
 insert into cotironda_piloto_privado.buyer_tracking_mvp091(request_id,token_hash,expires_at)
 values(rid,p_token_hash,expiry) on conflict do nothing;
 get diagnostics issued=row_count;
 if issued<>1 then return jsonb_build_object('state','already_issued');end if;
 return jsonb_build_object('state','issued','request_id',rid,
   'expires_at',expiry);
end;$fn$;
revoke all on function public.cotironda_piloto_issue_tracking_mvp091(text,text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_issue_tracking_mvp091(text,text,text)
 to service_role;

-- Record the buyer link's one attempted send, with no blind retry.
create function public.cotironda_piloto_finish_tracking_mvp091(
 p_token_hash text,p_state text
) returns boolean language plpgsql security definer set search_path='' as $fn$
declare n integer;
begin
 if p_token_hash !~ '^[a-f0-9]{64}$' or
   p_state not in ('api_accepted','uncertain') then
  raise exception 'invalid_tracking_send' using errcode='22023';
 end if;
 update cotironda_piloto_privado.buyer_tracking_mvp091
 set send_state=p_state,send_attempted_at=clock_timestamp()
 where token_hash=p_token_hash and send_state='pending';
 get diagnostics n=row_count;
 return n=1;
end;$fn$;
revoke all on function public.cotironda_piloto_finish_tracking_mvp091(text,text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_finish_tracking_mvp091(text,text)
 to service_role;

-- A separate operator-reviewed projection is mandatory before any supplier
-- source can be shown to buyers; the raw offer_versions stays private.
create table cotironda_piloto_privado.anonymous_offers_mvp091(
 request_id uuid not null,
 supplier_key text not null,
 revision_no smallint not null,
 public_text text not null check(length(public_text) between 5 and 12000),
 approved_at timestamptz not null default clock_timestamp(),
 approved_by text not null check(length(approved_by) between 3 and 100),
 primary key(request_id,supplier_key),
 foreign key(request_id,supplier_key,revision_no)
  references cotironda_piloto_privado.offer_versions(request_id,supplier_key,revision_no)
);
alter table cotironda_piloto_privado.anonymous_offers_mvp091 enable row level security;
revoke all on cotironda_piloto_privado.anonymous_offers_mvp091
 from public,anon,authenticated,service_role;

-- No raw quote data, supplier identifiers, prices or contact can flow out
-- before the server clock reaches deadline. On closed rounds only explicit
-- operator-approved complete redactions are visible.
create function public.cotironda_piloto_tracking_status_mvp091(p_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare rid uuid; status text; cutoff timestamptz;
        n integer; approved jsonb; now_ timestamptz;
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
 select count(distinct v.supplier_key) into n
 from cotironda_piloto_privado.offer_versions v
 join cotironda_piloto_privado.invitations i
   on i.request_id=v.request_id and i.supplier_key=v.supplier_key
 where v.request_id=rid and v.created_at<=cutoff;
 -- Canceled rounds should never reveal. A delayed cron cannot bypass date,
 -- and an erroneously early status 'closed' cannot bypass server timestamp.
 if status<>'closed' or now_<cutoff then
   return jsonb_build_object('state',case when status='cancelled'
     then 'cancelled' else 'waiting' end,
    'received_count',n,'deadline',cutoff,
    'can_open',false,'offers','[]'::jsonb);
 end if;
 select coalesce(jsonb_agg(
    jsonb_build_object('label','Presupuesto '||seq,'text',safe.public_text)
    order by seq),'[]'::jsonb) into approved
 from (
    select a.public_text,row_number() over(order by a.supplier_key) seq
    from cotironda_piloto_privado.anonymous_offers_mvp091 a
    join (select supplier_key,max(revision_no) last_revision
      from cotironda_piloto_privado.offer_versions v
      where v.request_id=rid and v.created_at<=cutoff group by supplier_key
    ) latest on latest.supplier_key=a.supplier_key
             and latest.last_revision=a.revision_no
    where a.request_id=rid
 ) safe;
 return jsonb_build_object('state','closed','received_count',n,
   'deadline',cutoff,'can_open',jsonb_array_length(approved)>0,
   'offers',approved);
end;$fn$;
revoke all on function public.cotironda_piloto_tracking_status_mvp091(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_tracking_status_mvp091(text)
 to service_role;

-- Trusted private snapshot for PDF: accessible only during a validated lease.
create function public.cotironda_piloto_pdf_snapshot_mvp091(
 p_request uuid,p_supplier text,p_lease uuid
) returns jsonb language sql stable security definer set search_path='' as $fn$
 select jsonb_build_object(
  'requestId',r.id,'city',r.delivery_city,
  'deadlineIso',to_char(r.closes_at at time zone 'UTC',
     'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'items', (select jsonb_agg(jsonb_build_object(
    'description',l.original_description,
    'quantity',l.quantity::text,'unit',l.unit) order by l.line_no)
    from cotironda_piloto_privado.request_lines l where l.request_id=r.id))
 from cotironda_piloto_privado.requests r
 join cotironda_piloto_privado.whapi_outbox o on o.request_id=r.id
 where r.id=p_request and o.supplier_key=p_supplier
  and o.state='leased' and o.lease_token=p_lease
  and cotironda_piloto_privado.allow_next_pilot_send_mvp091(p_request,p_supplier);
$fn$;
revoke all on function public.cotironda_piloto_pdf_snapshot_mvp091(uuid,text,uuid)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_pdf_snapshot_mvp091(uuid,text,uuid)
 to service_role;
