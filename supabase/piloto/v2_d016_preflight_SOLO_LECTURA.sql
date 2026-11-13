-- COTIRONDA V2 D016 — PREFLIGHT SOLO LECTURA, proyecto PILOTO.
-- REQUIERE ejecutar exclusivamente contra cotironda-piloto, no contra producción.
-- No instala SQL, no toca flags, no expone teléfonos, tokens ni valores de Vault.
-- Este reporte es una PRIMERA PUERTA, no autoriza publicar ni garantiza E2E.
-- Se puede ejecutar aun sin tener instaladas las RPC D016.
WITH
 policies AS (
  SELECT
   COALESCE((SELECT enabled AND activated_at IS NOT NULL
    FROM cotironda_piloto_privado.v2_business_policy
    WHERE singleton=true),false) business_enabled,
   COALESCE((SELECT enabled AND activated_at IS NOT NULL
    FROM cotironda_piloto_privado.v2_original_share_policy
    WHERE singleton=true),false) originals_enabled,
   COALESCE((SELECT enabled AND activated_at IS NOT NULL
    FROM cotironda_piloto_privado.v2_auto_release_policy
    WHERE singleton=true),false) closure_enabled
 ),
 calendar_status AS (
  SELECT
   count(*) FILTER (WHERE locality='la plata' AND year=2026
    AND approved_at IS NOT NULL)::integer AS lp_2026_approved,
   count(*) FILTER (WHERE locality='la plata' AND year=2027
    AND approved_at IS NOT NULL)::integer AS lp_2027_approved,
   count(*) FILTER (WHERE approved_at IS NOT NULL)::integer
    AS total_approved
  FROM cotironda_piloto_privado.v2_business_calendar
 ),
 consent_status AS (
  SELECT
   (SELECT count(DISTINCT buyer.key)::integer
    FROM cotironda_piloto_privado.participants buyer
    JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
     ON channel.participant_key=buyer.key
    WHERE buyer.participant_role='buyer'
     AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
     AND channel.authenticated_message_hmac IS NOT NULL)
      AS connected_buyers,
   (SELECT count(DISTINCT supplier_key)::integer
    FROM cotironda_piloto_privado.v2_supplier_original_consents
    WHERE accepted_at IS NOT NULL AND revoked_at IS NULL)
      AS suppliers_with_original_consent
 ),
 db_features AS (
  SELECT
   to_regprocedure('public.cotironda_piloto_v2_d016_issue_ticket_private(text,text,uuid,text)') IS NOT NULL
    AS issue_ticket_installed,
   to_regprocedure('public.cotironda_piloto_v2_d016_session_context_private(text,uuid)') IS NOT NULL
    AS private_session_installed,
   to_regprocedure('public.cotironda_piloto_v2_d016_worker_due_private(integer)') IS NOT NULL
    AS worker_installed,
   to_regprocedure('public.cotironda_piloto_v2_d016_close_due_private(integer)') IS NOT NULL
    AS scheduler_installed,
   to_regprocedure('public.cotironda_piloto_v2_d016_final_status_private(uuid,text)') IS NOT NULL
    AS final_report_installed,
   EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_cron') cron_available,
   EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_net') pgnet_available,
   to_regclass('vault.decrypted_secrets') IS NOT NULL AS vault_available
 ),
 transport_security AS (
  SELECT
   (
    has_schema_privilege('anon','net','USAGE') AND
    has_table_privilege('anon','net.http_request_queue','SELECT')
   ) AS anon_can_read_http_queue,
   (
    has_schema_privilege('authenticated','net','USAGE') AND
    has_table_privilege('authenticated','net.http_request_queue','SELECT')
   ) AS authenticated_can_read_http_queue,
   (SELECT relrowsecurity FROM pg_class
     WHERE oid=to_regclass('net.http_request_queue')) AS queue_rls_enabled
 ),
 contract AS (
  SELECT EXISTS (
   SELECT 1 FROM pg_constraint c
   JOIN pg_class t ON t.oid=c.conrelid
   JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname='cotironda_piloto_privado' AND t.relname='requests'
    AND c.conname='requests_exact_duration_check'
    AND pg_get_constraintdef(c.oid) LIKE '%18:00:00%'
    AND pg_get_constraintdef(c.oid) LIKE '%business_two_days%'
  ) AS deadline_at_18_verified
 )
SELECT jsonb_build_object(
 'tipo','cotironda_v2_d016_preflight',
 'alcance','solo_lectura_piloto',
 'checked_at_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'puertas',jsonb_build_object(
  'politica_negocio',p.business_enabled,
  'compartir_originales',p.originals_enabled,
  'cierre_automatico',p.closure_enabled,
  'calendarios_aprobados',c.total_approved,
  'calendario_la_plata_2026',c.lp_2026_approved>0,
  'calendario_la_plata_2027',c.lp_2027_approved>0,
  'compradores_whatsapp_verificados',a.connected_buyers,
  'proveedores_con_consentimiento_originales',a.suppliers_with_original_consent,
  'rpc_token',d.issue_ticket_installed,
  'rpc_sesion',d.private_session_installed,
  'rpc_worker',d.worker_installed,
  'rpc_cierre',d.scheduler_installed,
  'rpc_informe_final',d.final_report_installed,
  'cron_disponible',d.cron_available,
  'pg_net_disponible',d.pgnet_available,
  'vault_disponible',d.vault_available,
  'cola_pgnet_sin_lectura_publica',
   NOT (COALESCE(t.anon_can_read_http_queue,false) OR
        COALESCE(t.authenticated_can_read_http_queue,false)),
  'cola_pgnet_rls_habilitada',COALESCE(t.queue_rls_enabled,false),
  'contrato_cierre_18_ar',k.deadline_at_18_verified
 ),
 'bloqueos_activacion',
 to_jsonb(array_remove(ARRAY[
  CASE WHEN NOT p.business_enabled THEN 'politica_negocio_off' END,
  CASE WHEN NOT p.originals_enabled THEN 'originales_off' END,
  CASE WHEN NOT p.closure_enabled THEN 'cierre_automatico_off' END,
  CASE WHEN c.lp_2026_approved=0 THEN 'calendario_la_plata_2026_sin_aprobar' END,
  CASE WHEN a.connected_buyers=0 THEN 'comprador_whatsapp_sin_verificar' END,
  CASE WHEN a.suppliers_with_original_consent<2
   THEN 'menos_de_dos_proveedores_con_consentimiento_originales' END,
  CASE WHEN NOT d.issue_ticket_installed THEN 'rpc_d016_token_sin_instalar' END,
  CASE WHEN NOT d.private_session_installed THEN 'rpc_d016_sesion_sin_instalar' END,
  CASE WHEN NOT d.worker_installed THEN 'rpc_d016_worker_sin_instalar' END,
  CASE WHEN NOT d.scheduler_installed THEN 'rpc_d016_cierre_sin_instalar' END,
  CASE WHEN NOT d.final_report_installed THEN 'rpc_d016_informe_sin_instalar' END,
  CASE WHEN NOT d.cron_available OR NOT d.pgnet_available OR NOT d.vault_available
   THEN 'extensiones_cron_net_vault_incompletas' END,
  CASE WHEN NOT k.deadline_at_18_verified
   THEN 'restriccion_cierre_18_no_verificada' END,
  CASE WHEN COALESCE(t.anon_can_read_http_queue,false) OR
            COALESCE(t.authenticated_can_read_http_queue,false)
   THEN 'cola_pgnet_expone_headers_a_roles_cliente' END
 ],NULL)),
 'sin_verificar_en_sql',jsonb_build_array(
  'identidad_de_proyecto_confirmada_por_conector',
  'feriados_oficiales_y_revision_2026_2027',
  'consentimiento_especifico_ailin_nahuel_y_ronda_nueva',
  'credenciales_en_vault_y_edge',
  'secretos_privados_y_preview_vercel',
  'proteccion_sso',
  'limites_y_costos_api',
  'entrega_whapi_real_y_e2e'
 )
) AS preflight
FROM policies p
CROSS JOIN calendar_status c
CROSS JOIN consent_status a
CROSS JOIN db_features d
CROSS JOIN contract k
CROSS JOIN transport_security t;
