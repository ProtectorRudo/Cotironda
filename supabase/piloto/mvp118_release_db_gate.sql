-- MVP-118 / PILOTO only. Execute AFTER the approved staged migrations,
-- in the SAME transaction and with all outbound workers disabled.
-- This file is a READ-ONLY assertion gate: no DDL, DML, network or secrets.
-- It does NOT authorize WhatsApp traffic or certify actual E2E delivery.
do $release_gate$
declare missing int; public_leak int; activation record; current_limit text;
begin
 select count(*) into missing from (values
  (to_regclass('cotironda_piloto_privado.supplier_quote_lines_mvp101')),
  (to_regclass('cotironda_piloto_privado.supplier_reading_checks_mvp102')),
  (to_regclass('cotironda_piloto_privado.supplier_amount_checks_mvp103')),
  (to_regclass('cotironda_piloto_privado.supplier_ack_mvp104')),
  (to_regclass('cotironda_piloto_privado.supplier_source_checks_mvp106')),
  (to_regclass('cotironda_piloto_privado.anonymous_supplier_docs_mvp107')),
  (to_regclass('cotironda_piloto_privado.finalist_coverage_plans_mvp108')),
  (to_regclass('cotironda_piloto_privado.participant_channels_mvp109')),
  (to_regclass('cotironda_piloto_privado.contact_reveal_consents_mvp109')),
  (to_regclass('cotironda_piloto_privado.finalist_whapi_outbox_mvp110')),
  (to_regclass('cotironda_piloto_privado.finalist_activation_mvp113'))
 ) q(t) where t is null;
 if missing>0 then raise exception 'cutover_db_gates_missing %',missing;end if;
 if to_regprocedure('public.cotironda_piloto_claim_finalist_whapi_mvp110()') is null
  or to_regprocedure('public.cotironda_piloto_tracking_finalists_mvp110(text)') is null
 then raise exception 'cutover_rpc_missing';end if;

 select count(*) into public_leak
 from pg_class t join pg_namespace ns on ns.oid=t.relnamespace
 where ns.nspname='cotironda_piloto_privado'
  and t.relname in ('supplier_quote_lines_mvp101','supplier_reading_checks_mvp102',
   'supplier_amount_checks_mvp103','supplier_source_checks_mvp106',
   'anonymous_supplier_docs_mvp107','finalist_coverage_plans_mvp108',
   'participant_channels_mvp109','contact_reveal_consents_mvp109',
   'finalist_whapi_outbox_mvp110','finalist_activation_mvp113')
  and (not t.relrowsecurity
   or has_table_privilege('anon',t.oid,'SELECT')
   or has_table_privilege('authenticated',t.oid,'SELECT')
   or has_table_privilege('service_role',t.oid,'SELECT'));
 if public_leak<>0 then raise exception 'cutover_privacy_regression %',public_leak;end if;

 if not has_function_privilege('service_role',
  'public.cotironda_piloto_claim_finalist_whapi_mvp110()','EXECUTE')
  or has_function_privilege('anon',
  'public.cotironda_piloto_claim_finalist_whapi_mvp110()','EXECUTE')
  or has_function_privilege('authenticated',
  'public.cotironda_piloto_claim_finalist_whapi_mvp110()','EXECUTE')
 then raise exception 'cutover_worker_permissions';end if;

 select only_row,enabled,activated_at into activation
 from cotironda_piloto_privado.finalist_activation_mvp113;
 if activation.only_row is distinct from true
  or activation.enabled is distinct from false
  or activation.activated_at is not null
 then raise exception 'cutover_worker_activated';end if;

 select pg_get_constraintdef(oid) into current_limit
 from pg_constraint
 where conrelid='cotironda_piloto_privado.document_agreements_mvp099'::regclass
  and conname='document_agreements_mvp099_line_count_check';
 if current_limit not like '%25%'
 then raise exception 'cutover_document_cap_not_25';end if;
end;$release_gate$;
