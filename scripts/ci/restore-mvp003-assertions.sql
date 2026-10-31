-- MVP-003: ONLY on disposable restored DB. Defense in depth.
do $audit$
begin
 if current_database()<>'cotironda_ci_restore_mvp003'
 then raise exception 'mvp003_wrong_restore_target';end if;
 if not exists (select 1 from pg_class
    where oid='cotironda_private.whapi_reply_jobs_d047'::regclass
      and relrowsecurity)
 or not exists (select 1 from pg_class
    where oid='cotironda_private.whapi_send_reservations_d056'::regclass
      and relrowsecurity)
 or not exists (select 1 from pg_trigger
   where tgname='whapi_before_begin_send_limit_d056' and not tgisinternal)
 or (select count(*) from pg_trigger
   where tgname in ('mvp003_offer_draft_lines_guard',
     'mvp003_offer_version_lines_guard') and not tgisinternal)<>2
 then raise exception 'mvp003_private_rls_trigger_not_restored';end if;
 if exists(select 1 from cotironda_private.offer_drafts_v1
   where not cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
 or exists(select 1 from cotironda_private.offer_versions_v1
   where not cotironda_private.check_quote_lines_v1(lines_snapshot,round_id))
 then raise exception 'mvp003_bad_line_reference_after_restore';end if;
 if (select count(*) from cotironda_private.whapi_send_reservations_d056)<1
 then raise exception 'mvp003_synthetic_reservations_not_restored';end if;
 if has_table_privilege('anon','cotironda_private.whapi_reply_jobs_d047','SELECT')
 or has_table_privilege('authenticated',
    'cotironda_private.whapi_send_reservations_d056','SELECT')
 or has_function_privilege('cotironda_reply_sender_d054',
   'cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)',
   'EXECUTE')
 then raise exception 'mvp003_restored_permissions_too_broad';end if;
 if not exists(select 1 from pg_roles
   where rolname='cotironda_reply_sender_d054'
   and not rolcanlogin and not rolinherit and not rolbypassrls)
 then raise exception 'mvp003_roles_missing_or_insecure';end if;
end;$audit$;
