-- MVP-018 D067 / PostgreSQL17 disposable CI ONLY.
-- Source D061 hides out-of-rubro items from interpretation. This trigger
-- ALSO rejects an offer that bypasses D061 and tries to persist foreign lines
-- through D059/D060. DO NOT rely on an AI/TypeScript check alone.
create role cotironda_scope_guard_d067 nologin noinherit nobypassrls;
grant usage on schema cotironda_private to cotironda_scope_guard_d067;
grant select on cotironda_private.round_requests_d064,
 cotironda_private.round_match_preparations_d065,
 cotironda_private.round_supplier_lines_d065
 to cotironda_scope_guard_d067;
create policy d067_guard_request on cotironda_private.round_requests_d064
 for select to cotironda_scope_guard_d067 using(true);
create policy d067_guard_prepared on cotironda_private.round_match_preparations_d065
 for select to cotironda_scope_guard_d067 using(true);
create policy d067_guard_scope on cotironda_private.round_supplier_lines_d065
 for select to cotironda_scope_guard_d067 using(true);

create function cotironda_private.reject_foreign_quote_lines_d067()
returns trigger language plpgsql volatile security definer set search_path='' as $fn$
declare v_line jsonb; v_no integer;
begin
 -- D064 requests are the NEW live business pipeline. Synthetic legacy
 -- pre-D064 fixtures remain unaffected until all old flows are migrated.
 if not exists(select 1 from cotironda_private.round_requests_d064 req
   where req.round_id=new.round_id) then return new;end if;

 if not exists(select 1 from cotironda_private.round_match_preparations_d065 prep
    where prep.round_id=new.round_id)
 or pg_catalog.jsonb_typeof(new.lines_snapshot) is distinct from 'array'
 or pg_catalog.jsonb_array_length(new.lines_snapshot)<1
 then raise exception 'd067_scope_not_prepared' using errcode='42501';end if;

 for v_line in select value from pg_catalog.jsonb_array_elements(new.lines_snapshot)
 loop
  if pg_catalog.jsonb_typeof(v_line) is distinct from 'object'
    or pg_catalog.jsonb_typeof(v_line->'line_no') is distinct from 'number'
    or (v_line->>'line_no') !~ '^[1-8]$'
  then raise exception 'd067_invalid_line' using errcode='22023';end if;
  v_no:=(v_line->>'line_no')::integer;
  if not exists(select 1 from cotironda_private.round_supplier_lines_d065 scope
    where scope.round_id=new.round_id
      and scope.supplier_org_id=new.supplier_org_id
      and scope.line_no=v_no)
  then raise exception 'd067_line_not_assigned' using errcode='42501';end if;
 end loop;
 return new;
end;$fn$;

grant create on schema cotironda_private to cotironda_scope_guard_d067;
grant cotironda_scope_guard_d067 to postgres with set true,inherit false;
alter function cotironda_private.reject_foreign_quote_lines_d067()
 owner to cotironda_scope_guard_d067;
revoke cotironda_scope_guard_d067 from postgres;
revoke create on schema cotironda_private from cotironda_scope_guard_d067;
revoke all on function cotironda_private.reject_foreign_quote_lines_d067()
 from public,anon,authenticated,service_role,cotironda_app;
create trigger d067_quote_lines_guard before insert
 on cotironda_private.offer_versions_v1 for each row
 execute function cotironda_private.reject_foreign_quote_lines_d067();
comment on function cotironda_private.reject_foreign_quote_lines_d067() is
 'New D064 buyer rounds: reject offer line not assigned to invited supplier in D065. Never modify older versions.';
