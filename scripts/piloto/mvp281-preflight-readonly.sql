-- MVP281 PRE-FLIGHT SOLO LECTURA. No instalar como migración.
-- Resultado agregado sin teléfonos, IDs de comprador, tokens ni precios.
-- Requiere esquema existente MVP229/230 en cotironda-piloto.
WITH components(component,installed) AS (
 VALUES
 ('245_supplier_document_bridge',to_regprocedure('public.cotironda_piloto_ia_reserve_media_mvp245(text,text,text,integer)') IS NOT NULL),
 ('257_uncertain_evidence',to_regclass('cotironda_piloto_privado.uncertain_whapi_receipts_mvp257') IS NOT NULL),
 ('263_supervisor',to_regclass('cotironda_piloto_privado.supervisor_policy_mvp263') IS NOT NULL),
 ('264_cost_meter',to_regclass('cotironda_piloto_privado.ai_usage_calls_mvp264') IS NOT NULL),
 ('267_operator_auth',to_regprocedure('cotironda_piloto_privado.operator_session_mvp267()') IS NOT NULL),
 ('276_text_csv_source',to_regprocedure('cotironda_piloto_privado.fuente_original_documental_mvp276(text,text,text,text)') IS NOT NULL),
 ('278_binary_evidence',to_regclass('cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278') IS NOT NULL),
 ('279_buyer_review',to_regclass('cotironda_piloto_privado.ai_buyer_review_mvp279') IS NOT NULL),
 ('280_unified_confirmation',to_regprocedure('cotironda_piloto_privado.fuente_revisable_mvp280(uuid)') IS NOT NULL)
), gates AS (
 SELECT
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
    FROM cotironda_piloto_privado.ai_central_control_mvp226) AS ia_off,
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
    FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222) AS dispatch_off,
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
    FROM cotironda_piloto_privado.ai_trial_control_mvp229) AS trial_off,
  (SELECT count(*)=1 AND coalesce(bool_and(enabled IS FALSE),false)
    FROM cotironda_piloto_privado.original_share_policy_mvp178) AS original_share_off
), incidents AS (
 SELECT
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
    WHERE state='uncertain') AS uncertain_dispatch,
  (SELECT count(*) FROM cron.job WHERE active) AS existing_active_cron,
  (SELECT count(*) FROM cron.job
    WHERE active AND jobname LIKE '%mvp263%') AS new_supervisor_cron
)
SELECT jsonb_build_object(
 'state','mvp281_pilot_integration_preflight',
 'read_only',true,
 'postgres_version',current_setting('server_version'),
 'components_checked',(SELECT count(*) FROM components),
 'components_installed',(SELECT count(*) FROM components WHERE installed),
 'missing_components',(SELECT coalesce(jsonb_agg(component ORDER BY component),'[]'::jsonb)
                       FROM components WHERE NOT installed),
 'gates',jsonb_build_object(
   'ia_off',g.ia_off,'dispatch_off',g.dispatch_off,
   'trial_off',g.trial_off,'original_share_off',g.original_share_off),
 'uncertain_dispatch',i.uncertain_dispatch,
 'existing_active_cron_jobs',i.existing_active_cron,
 'supervisor_cron_off',i.new_supervisor_cron=0,
 'safe_for_future_controlled_schema_review',
   g.ia_off AND g.dispatch_off AND g.trial_off AND g.original_share_off
   AND i.uncertain_dispatch=0 AND i.new_supervisor_cron=0,
 'edge_release_verified',false,
 'vercel_release_verified',false,
 'real_whatsapp_e2e_verified',false,
 'pilot_publication_authorized',false,
 'all_21_migrations_installed_by_this_query',false
) AS report
FROM gates g CROSS JOIN incidents i;
