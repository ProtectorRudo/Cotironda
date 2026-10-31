-- MVP-003 / #175: cross-table checks on offers are not pg_dump/restore safe.
-- CI ONLY, do not apply in DEV/prod until restore gate and full migration review.
--
-- Existing check_quote_lines_v1() references round_items_v1. PostgreSQL warns
-- that CHECK constraints should not reference other rows/tables: pg_restore
-- loads COPY data in dependency order that may violate the unsafe assumption.
--
-- Move SAME business validation to BEFORE INSERT/UPDATE trigger. pg_dump
-- restores triggers in POST-DATA section, after both tables' rows are loaded.
create function cotironda_private.guard_offer_lines_restore_safe_mvp003()
returns trigger language plpgsql volatile security invoker
set search_path='' as $fn$
begin
 if not cotironda_private.check_quote_lines_v1(new.lines_snapshot,new.round_id)
 then
   raise exception 'quote_lines_invalid_or_unknown_round_item'
     using errcode='23514';
 end if;
 return new;
end;
$fn$;
revoke all on function
 cotironda_private.guard_offer_lines_restore_safe_mvp003()
 from public,anon,authenticated,service_role,cotironda_app;

alter table cotironda_private.offer_drafts_v1
 drop constraint offer_drafts_v1_check;
alter table cotironda_private.offer_versions_v1
 drop constraint offer_versions_v1_check;

create trigger mvp003_offer_draft_lines_guard
 before insert or update of round_id,lines_snapshot
 on cotironda_private.offer_drafts_v1
 for each row execute function cotironda_private.guard_offer_lines_restore_safe_mvp003();
create trigger mvp003_offer_version_lines_guard
 before insert or update of round_id,lines_snapshot
 on cotironda_private.offer_versions_v1
 for each row execute function cotironda_private.guard_offer_lines_restore_safe_mvp003();

comment on function cotironda_private.guard_offer_lines_restore_safe_mvp003() is
  'MVP-003: same strict quote validator, moved from unsafe cross-table CHECK to BEFORE WRITE trigger for backup/restore reliability. No public EXECUTE.';
