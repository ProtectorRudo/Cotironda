-- MVP334: preflight EXCLUSIVAMENTE DE LECTURA para 1 comprador y 2 proveedores.
-- No devuelve claves HMAC, teléfonos, nombres, textos, presupuestos ni secretos.
-- Cero DML/DDL, cero envíos, cero activación. El resultado no prueba AUTH
-- remoto de Whapi ni secretos Edge, y no autoriza publicar.
WITH personas AS (
 SELECT
  count(*) FILTER (WHERE participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL) AS compradores,
  count(*) FILTER (WHERE participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL) AS proveedores,
  count(*) FILTER (WHERE participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 c
              WHERE c.participant_key=p.key AND c.chat_hmac=p.chat_hmac)) AS compradores_vinculados,
  count(*) FILTER (WHERE participant_role='supplier' AND consent_at IS NOT NULL AND opted_out_at IS NULL
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 c
              WHERE c.participant_key=p.key AND c.chat_hmac=p.chat_hmac)
   AND cotironda_piloto_privado.proveedor_contactable_mvp307(p.key)) AS proveedores_contactables,
  bool_or(participant_role='buyer' AND consent_at IS NOT NULL AND opted_out_at IS NULL
    AND (public.cotironda_piloto_ia_trial_flags_mvp229(p.chat_hmac)->>'dispatch')='true'
    AND (public.cotironda_piloto_ia_review_launch_mvp285(p.chat_hmac)->>'release')='true') AS comprador_operativo
 FROM cotironda_piloto_privado.participants p
), catalogos AS (
 SELECT count(*) AS articulos_registrados,
  count(*) FILTER (WHERE cl.recognition_state='curated_family' AND cl.family_code IS NOT NULL) AS articulos_con_familia,
  count(*) FILTER (WHERE cl.recognition_state='pending_review') AS articulos_en_revision,
  count(DISTINCT cl.participant_key) FILTER (WHERE cl.recognition_state='curated_family'
    AND cl.family_code IS NOT NULL) AS proveedores_con_familias,
  count(DISTINCT cl.participant_key) FILTER (WHERE p.catalogue_confirmed_at IS NULL)
    AS proveedores_catalogo_sin_confirmar
 FROM cotironda_piloto_privado.catalogue_lines cl
 JOIN cotironda_piloto_privado.participants p ON p.key=cl.participant_key
   AND p.participant_role='supplier' AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
), controles AS (
 SELECT f.whatsapp_inbound_enabled AS entrada_whatsapp,
        f.whatsapp_outbound_enabled AS salida_whatsapp,
        central.enabled AS ia_central,
        dispatch.enabled AS despacho_legacy,
        auto.enabled AS nueva_liberacion,
        batch.enabled AS lote_diferido,
        notice.enabled AS aviso_diferido,
        batch.daily_attempt_limit AS limite_diario_lote,
        batch.buyer_daily_attempt_limit AS limite_comprador_lote,
        notice.daily_notice_limit AS limite_diario_avisos
 FROM cotironda_piloto_privado.integration_flags f
 CROSS JOIN cotironda_piloto_privado.ai_central_control_mvp226 central
 CROSS JOIN cotironda_piloto_privado.ai_dispatch_gate_mvp222 dispatch
 CROSS JOIN cotironda_piloto_privado.ai_auto_release_gate_mvp306 auto
 CROSS JOIN cotironda_piloto_privado.ai_batch_gate_mvp314 batch
 CROSS JOIN cotironda_piloto_privado.ai_buyer_notice_gate_mvp315 notice
 WHERE f.only_row AND central.only_row AND dispatch.only_row
   AND auto.only_row AND batch.only_row AND notice.only_row
), operaciones AS (
 SELECT
  (SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222
   WHERE state IN ('pending','leased','uncertain')) AS trabajos_inseguros,
  (SELECT count(*) FROM cotironda_piloto_privado.whapi_outbox
   WHERE state IN ('leased','uncertain')) AS mensajes_inseguros,
  (SELECT count(*) FROM cotironda_piloto_privado.whapi_inbox i
   JOIN cotironda_piloto_privado.participants p ON p.key=i.participant_key
   WHERE p.participant_role='buyer' AND i.received_at>now()-interval '24 hours') AS entradas_comprador_24h,
  (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309
   WHERE role='buyer' AND scope='buyer_standard_operations') AS permisos_comprador,
  (SELECT count(*) FROM cotironda_piloto_privado.admin_authorizations_mvp309
   WHERE role='supplier' AND scope='supplier_business_contact_after_close') AS permisos_proveedores,
  (SELECT count(*) FROM cron.job WHERE active AND jobname ILIKE '%batch%') AS programadores_lote
)
SELECT jsonb_build_object(
 'fase','mvp334_preflight_solo_lectura',
 'evaluado_utc',now(),
 'participantes_activos',jsonb_build_object('comprador',p.compradores,'proveedores',p.proveedores,
   'comprador_vinculado',p.compradores_vinculados,'proveedores_contactables',p.proveedores_contactables),
 'catalogos',jsonb_build_object('articulos',c.articulos_registrados,
   'con_familia',c.articulos_con_familia,'en_revision',c.articulos_en_revision,
   'proveedores_con_familias',c.proveedores_con_familias,
   'sin_confirmacion_formal',c.proveedores_catalogo_sin_confirmar),
 'permisos_administrativos',jsonb_build_object('comprador',o.permisos_comprador,
   'proveedores',o.permisos_proveedores),
 'servicios',jsonb_build_object('whatsapp_entrada',g.entrada_whatsapp,
   'whatsapp_salida',g.salida_whatsapp,'ia_central',g.ia_central,
   'despacho_legacy',g.despacho_legacy,'comprador_operativo',p.comprador_operativo),
 'gates_nuevos',jsonb_build_object('auto_release',g.nueva_liberacion,
   'batch',g.lote_diferido,'buyer_notice',g.aviso_diferido),
 'presupuestos_de_intentos',jsonb_build_object('lote_diario',g.limite_diario_lote,
   'lote_por_comprador',g.limite_comprador_lote,'avisos_diarios',g.limite_diario_avisos),
 'riesgos_de_reenvio',jsonb_build_object('trabajos_inseguros',o.trabajos_inseguros,
   'mensajes_inseguros',o.mensajes_inseguros),
 'evidencia_recepcion_24h',o.entradas_comprador_24h,
 'programadores_lote',o.programadores_lote,
 'verificacion_externa_pendiente',true,
 'publicacion_autorizada',false,
 'preflight_sql_apto',(
   p.compradores=1 AND p.proveedores=2 AND p.compradores_vinculados=1
   AND p.proveedores_contactables=2 AND p.comprador_operativo IS TRUE
   AND c.proveedores_con_familias=2 AND o.permisos_comprador=1
   AND o.permisos_proveedores=2
   AND g.entrada_whatsapp AND g.salida_whatsapp AND g.ia_central AND g.despacho_legacy
   AND NOT g.nueva_liberacion AND NOT g.lote_diferido AND NOT g.aviso_diferido
   AND o.trabajos_inseguros=0 AND o.mensajes_inseguros=0
   AND o.entradas_comprador_24h>=1
 ))
 AS evidence_snapshot
FROM personas p CROSS JOIN catalogos c CROSS JOIN controles g CROSS JOIN operaciones o;
