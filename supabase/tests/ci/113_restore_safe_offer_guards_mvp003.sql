-- MVP-003 / #175. Defensive regression: strict validator still rejects
-- direct writes; all previously inserted synthetic rows remain valid.
-- Runs only in disposable PostgreSQL 17 CI AFTER patch.
begin;
do $regression$
declare v_round uuid; v_supplier uuid; v_error text;
begin
 if exists(select 1 from pg_constraint
    where conrelid in (
      'cotironda_private.offer_drafts_v1'::regclass,
      'cotironda_private.offer_versions_v1'::regclass)
      and contype='c'
      and pg_get_constraintdef(oid) ilike '%check_quote_lines_v1%')
 then raise exception 'mvp003_cross_table_check_still_present';end if;
 if (select count(*) from pg_trigger
     where tgname in ('mvp003_offer_draft_lines_guard',
        'mvp003_offer_version_lines_guard')
       and not tgisinternal)<>2
 then raise exception 'mvp003_quote_triggers_missing';end if;
 if exists(select 1 from cotironda_private.offer_drafts_v1
    where not cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
 or exists(select 1 from cotironda_private.offer_versions_v1
    where not cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
 then raise exception 'mvp003_existing_offer_invalid';end if;
 select round_id,supplier_org_id into v_round,v_supplier
 from cotironda_private.offer_drafts_v1 order by round_id limit 1;
 if v_round is null then raise exception 'mvp003_requires_existing_fake_offer';end if;
 begin
   update cotironda_private.offer_drafts_v1
   set revision=revision+1, lines_snapshot='[]'::jsonb
   where round_id=v_round and supplier_org_id=v_supplier;
   raise exception 'mvp003_invalid_draft_not_rejected';
 exception when check_violation then
   get stacked diagnostics v_error=message_text;
   if v_error<>'quote_lines_invalid_or_unknown_round_item'
   then raise exception 'mvp003_wrong_guard_failure: %',v_error;end if;
 end;
 select round_id,supplier_org_id into v_round,v_supplier
 from cotironda_private.offer_versions_v1 order by round_id limit 1;
 if v_round is null then raise exception 'mvp003_requires_confirmed_fake_offer';end if;
 begin
   update cotironda_private.offer_versions_v1 set lines_snapshot='[]'::jsonb
   where round_id=v_round and supplier_org_id=v_supplier;
   raise exception 'mvp003_invalid_version_not_rejected';
 exception when check_violation then
   get stacked diagnostics v_error=message_text;
   if v_error<>'quote_lines_invalid_or_unknown_round_item'
   then raise exception 'mvp003_wrong_version_guard_failure: %',v_error;end if;
 end;
end;$regression$;
rollback;
