-- MVP-014: read-only buyer dashboard of OWN rounds, no round UUID input.
-- CI PG17 only; NOT a Supabase migration / no DEV installation.
-- Session guard reuses D025 (including Supabase auth.sessions revocation)
-- and current active org membership. Returns NO supplier/company/contact IDs.
create function cotironda_private.buyer_round_list_mvp014()
returns table(round_id uuid,round_status text,begins_at timestamptz,
 ends_at timestamptz,item_count integer)
language plpgsql stable security definer set search_path='' as $fn$
begin
 -- D025 authenticates the request BEFORE querying a specific round.
 -- A deliberately nonexistent UUID produces zero rows but still enforces
 -- role, nonanonymous user, verified email, live session and JWT integrity.
 perform 1 from cotironda_private.buyer_round_overview_v1(
  '00000000-0000-4000-8000-000000000014'::uuid);
 return query
 select r.id,r.status,r.begins_at,r.ends_at,
   pg_catalog.count(i.line_no)::integer
 from cotironda_private.rounds_v1 r
 join public.organizations o on o.id=r.buyer_org_id
 join public.organization_members m on m.organization_id=o.id
 join cotironda_private.round_items_v1 i on i.round_id=r.id
 where o.organization_type in ('buyer','both')
   and m.user_id=(select cotironda_private.request_user_id_v035())
   and m.status='active'
 group by r.id,r.status,r.begins_at,r.ends_at
 order by r.begins_at desc,r.id desc
 limit 40;
end;$fn$;
grant create on schema cotironda_private to cotironda_rounds_reader;
grant cotironda_rounds_reader to postgres with set true,inherit false;
alter function cotironda_private.buyer_round_list_mvp014()
 owner to cotironda_rounds_reader;
revoke cotironda_rounds_reader from postgres;
revoke create on schema cotironda_private from cotironda_rounds_reader;
revoke all on function cotironda_private.buyer_round_list_mvp014()
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function cotironda_private.buyer_round_list_mvp014()
 to authenticated;
create function public.buyer_round_list_mvp014()
returns table(round_id uuid,round_status text,begins_at timestamptz,
 ends_at timestamptz,item_count integer)
language sql stable security invoker set search_path='' as $fn$
 select x.round_id,x.round_status,x.begins_at,x.ends_at,x.item_count
 from cotironda_private.buyer_round_list_mvp014() x;
$fn$;
revoke all on function public.buyer_round_list_mvp014()
 from public,anon,authenticated,service_role,cotironda_app;
grant execute on function public.buyer_round_list_mvp014() to authenticated;
comment on function public.buyer_round_list_mvp014() is
 'MVP-014 own buyer rounds, session and membership checked in D025; no supplier details.';
