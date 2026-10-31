-- MVP-003. Read-only deterministic signature of a synthetic PG17 database.
-- Same SQL runs against source and restored DB. NEVER emit row content.
select md5(pg_catalog.jsonb_build_object(
  'organizations', (select count(*) from public.organizations),
  'supplier_profiles', (select count(*) from public.supplier_profiles),
  'rounds', (select count(*) from cotironda_private.rounds_v1),
  'round_items', (select count(*) from cotironda_private.round_items_v1),
  'contacts', (select count(*) from cotironda_private.whapi_contacts_v1),
  'jobs', (select count(*) from cotironda_private.whapi_reply_jobs_d047),
  'job_states', (select md5(coalesce(string_agg(
    job_id::text||':'||status||':'||send_phase,',' order by job_id),''))
    from cotironda_private.whapi_reply_jobs_d047),
  'inbox', (select count(*) from cotironda_private.whapi_inbox_v1),
  'drafts', (select count(*) from cotironda_private.offer_drafts_v1),
  'confirm_receipts', (select count(*) from cotironda_private.whapi_confirm_sources_d049),
  'limits', (select count(*) from cotironda_private.whapi_buyer_send_policies_d056),
  'reserved', (select count(*) from cotironda_private.whapi_send_reservations_d056),
  'reservation_hash', (select md5(coalesce(string_agg(
    job_id::text||':'||buyer_org_id::text||':'||reserved_units::text,
    ',' order by job_id),''))
    from cotironda_private.whapi_send_reservations_d056),
  'rls_tables', (select count(*) from pg_class
    where relnamespace::regnamespace::text in
      ('public','cotironda_private','storage','auth')
     and relkind in ('r','p') and relrowsecurity),
  'routines', (select count(*) from pg_proc
    where pronamespace='cotironda_private'::regnamespace),
  'begin_send', (select md5(pg_get_functiondef(
    'cotironda_private.whapi_begin_send_d053(uuid,uuid)'::regprocedure))),
  'quota_trigger', (select count(*) from pg_trigger where
    tgname='whapi_before_begin_send_limit_d056' and not tgisinternal),
  'anon_private_select', has_table_privilege('anon',
    'cotironda_private.whapi_reply_jobs_d047','SELECT'),
  'sender_reconcile', has_function_privilege('cotironda_reply_sender_d054',
    'cotironda_private.whapi_reconcile_uncertain_d053(uuid,text,text,text)',
    'EXECUTE')
)::text);
