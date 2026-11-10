-- MVP282: SOLO LECTURA - comprobar dependencias del esquema MVP239.
-- No conserva datos privados, no ejecuta migraciones ni cambia permisos.
WITH deps(nombre,disponible) AS (
 VALUES
 ('auth.users',to_regclass('auth.users') IS NOT NULL),
 ('auth.sessions',to_regclass('auth.sessions') IS NOT NULL),
 ('storage.objects',to_regclass('storage.objects') IS NOT NULL),
 ('whapi_inbox',to_regclass('cotironda_piloto_privado.whapi_inbox') IS NOT NULL),
 ('media_archive_mvp095',to_regclass('cotironda_piloto_privado.media_archive_mvp095') IS NOT NULL),
 ('ai_shadow_requests_mvp221',to_regclass('cotironda_piloto_privado.ai_shadow_requests_mvp221') IS NOT NULL),
 ('ai_shadow_rubros_mvp221',to_regclass('cotironda_piloto_privado.ai_shadow_rubros_mvp221') IS NOT NULL),
 ('ai_shadow_destinos_mvp221',to_regclass('cotironda_piloto_privado.ai_shadow_destinos_mvp221') IS NOT NULL),
 ('ai_dispatch_jobs_mvp222',to_regclass('cotironda_piloto_privado.ai_dispatch_jobs_mvp222') IS NOT NULL),
 ('ai_supplier_links_mvp225',to_regclass('cotironda_piloto_privado.ai_supplier_links_mvp225') IS NOT NULL),
 ('ai_central_attempts_mvp226',to_regclass('cotironda_piloto_privado.ai_central_attempts_mvp226') IS NOT NULL),
 ('ai_supplier_review_mvp227',to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NOT NULL),
 ('supplier_media_quotes_mvp098',to_regclass('cotironda_piloto_privado.supplier_media_quotes_mvp098') IS NOT NULL),
 ('supplier_source_checks_mvp106',to_regclass('cotironda_piloto_privado.supplier_source_checks_mvp106') IS NOT NULL),
 ('original_share_policy_mvp178',to_regclass('cotironda_piloto_privado.original_share_policy_mvp178') IS NOT NULL),
 ('ai_trial_control_mvp229',to_regclass('cotironda_piloto_privado.ai_trial_control_mvp229') IS NOT NULL),
 ('document_ai_diagnostics_mvp127',to_regclass('cotironda_piloto_privado.document_ai_diagnostics_mvp127') IS NOT NULL),
 ('ia_shadow_prepare_rpc',
   to_regprocedure('public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb)') IS NOT NULL),
 ('ia_publish_rpc',
   to_regprocedure('public.cotironda_piloto_ia_publish_mvp222(uuid)') IS NOT NULL)
)
SELECT jsonb_build_object(
 'audit','mvp282_prerequisites_readonly',
 'total',count(*),
 'present',count(*) FILTER(WHERE disponible),
 'missing',coalesce(jsonb_agg(nombre ORDER BY nombre)
   FILTER(WHERE NOT disponible),'[]'::jsonb),
 'all_prerequisites_present',bool_and(disponible),
 'executed_migrations',false,
 'deployment_permitted',false
) AS report FROM deps;
