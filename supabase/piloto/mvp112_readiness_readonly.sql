-- MVP-112: safe, READ-ONLY GO/NO-GO audit of REAL pilot.
-- No DDL, writes, network messages, decrypted data or secret output.
with requirements(gate,part,installed) as (
 values
 ('supplier_original_mirror','incoming',to_regclass('cotironda_piloto_privado.supplier_quote_lines_mvp101') is not null),
 ('corroboration_double_ai','incoming',to_regclass('cotironda_piloto_privado.supplier_reading_checks_mvp102') is not null),
 ('exact_economic_audit','incoming',to_regclass('cotironda_piloto_privado.supplier_amount_checks_mvp103') is not null),
 ('supplier_acknowledgement','incoming',to_regclass('cotironda_piloto_privado.supplier_ack_mvp104') is not null),
 ('anonymous_buyer_tracking','view',to_regprocedure('public.cotironda_piloto_tracking_status_mvp091(text)') is not null),
 ('original_source_check','incoming',to_regclass('cotironda_piloto_privado.supplier_source_checks_mvp106') is not null),
 ('safe_anonymous_document','view',to_regclass('cotironda_piloto_privado.anonymous_supplier_docs_mvp107') is not null),
 ('complete_coverage_selection','close',to_regclass('cotironda_piloto_privado.finalist_coverage_plans_mvp108') is not null),
 ('encrypted_contacts','privacy',to_regclass('cotironda_piloto_privado.participant_channels_mvp109') is not null),
 ('specific_mutual_consent','privacy',to_regclass('cotironda_piloto_privado.contact_reveal_consents_mvp109') is not null),
 ('finalist_whapi_outbox','close',to_regclass('cotironda_piloto_privado.finalist_whapi_outbox_mvp110') is not null),
 ('outbound_private_worker_rpc','close',to_regprocedure('public.cotironda_piloto_claim_finalist_whapi_mvp110()') is not null),
 ('buyer_finalist_reveal_rpc','view',to_regprocedure('public.cotironda_piloto_tracking_finalists_mvp110(text)') is not null)
),
state as (
 select bool_and(installed) as database_ready,count(*) filter(where not installed) as missing,
  jsonb_agg(gate order by gate) filter(where not installed) as pending
 from requirements
),
flags as (
 select whatsapp_inbound_enabled,whatsapp_outbound_enabled,
  media_archive_enabled_mvp095 from cotironda_piloto_privado.integration_flags where only_row
)
select case when state.database_ready and flags.whatsapp_inbound_enabled
 and flags.whatsapp_outbound_enabled and flags.media_archive_enabled_mvp095
 then 'database_gates_present_external_edge_and_real_e2e_not_verified'
 else 'NO_GO' end as pilot_status,
 state.missing as missing_database_gates,
 coalesce(state.pending,'[]'::jsonb) as missing_list,
 flags.whatsapp_inbound_enabled,
 flags.whatsapp_outbound_enabled,
 flags.media_archive_enabled_mvp095,
 'NOT_CHECKED_BY_SQL: GitHub merges, Edge deployed hashes, Vercel, Whapi callback, API secrets, real 1+2 phones and cost/rate limits' as external_checks
from state cross join flags;