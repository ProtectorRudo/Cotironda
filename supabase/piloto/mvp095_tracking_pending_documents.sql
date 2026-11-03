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
 select count(distinct v.supplier_key) into n
 from cotironda_piloto_privado.offer_versions v
 join cotironda_piloto_privado.invitations i
   on i.request_id=v.request_id and i.supplier_key=v.supplier_key
 where v.request_id=rid and v.created_at<=cutoff;
 -- Count only private, archived supplier files for the same round.
 -- These are NOT verified quotes, so never include them in received_count.
 select count(distinct a.participant_key) into pending_files
 from cotironda_piloto_privado.media_archive_mvp095 a
 where a.request_id=rid and a.state='stored'
   and a.reserved_at<=cutoff
   and not exists (
     select 1 from cotironda_piloto_privado.offer_versions v
     where v.request_id=rid and v.supplier_key=a.participant_key
       and v.created_at<=cutoff
   );
 -- Canceled rounds should never reveal. A delayed cron cannot bypass date,
 -- and an erroneously early status 'closed' cannot bypass server timestamp.
 if status<>'closed' or now_<cutoff then
   return jsonb_build_object('state',case when status='cancelled'
     then 'cancelled' else 'waiting' end,
    'received_count',n,'files_pending_review',pending_files,'deadline',cutoff,
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
   'files_pending_review',pending_files,
   'deadline',cutoff,'can_open',jsonb_array_length(approved)>0,
   'offers',approved);
end;$fn$;
revoke all on function public.cotironda_piloto_tracking_status_mvp091(text)
 from public,anon,authenticated;
grant execute on function public.cotironda_piloto_tracking_status_mvp091(text)
 to service_role;

