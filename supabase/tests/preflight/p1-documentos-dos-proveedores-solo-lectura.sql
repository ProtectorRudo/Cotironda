-- P1 / P2 — preflight documental verificable, PILOTO, SOLO LECTURA.
-- NO es una función pública ni necesita token del comprador. Ejecutar solo
-- por operador de infraestructura en SQL privado. NO incrustar en portal.
-- CERO nombres, identificadores, HMAC, archivos, direcciones o importes
-- salen del SELECT final; una ronda preparada máxima para no mezclar datos.
-- Un error previo de asociación puede existir ANTES del vínculo formal.
-- Un candidato temporal NO equivale a respuesta de la ronda ni a un permiso de reintento.
WITH active_rounds AS MATERIALIZED (
 SELECT r.id,r.created_at,r.closes_at
 FROM cotironda_piloto_privado.requests r
 WHERE r.state='prepared' AND r.closes_at>clock_timestamp()
),
round_count AS (
 SELECT count(*)::integer AS n FROM active_rounds
),
target AS (
 SELECT r.* FROM active_rounds r
 WHERE (SELECT n FROM round_count)=1
),
invited AS (
 SELECT DISTINCT i.supplier_key
 FROM target r
 JOIN cotironda_piloto_privado.invitations i
  ON i.request_id=r.id AND i.state='prepared'
 JOIN cotironda_piloto_privado.participants p
  ON p.key=i.supplier_key AND p.participant_role='supplier'
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
),
dispatched AS (
 SELECT j.supplier_key, min(j.finished_at) AS first_sent
 FROM target r
 JOIN invited i ON true
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  ON j.request_id=r.id AND j.supplier_key=i.supplier_key
  AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
  AND j.finished_at IS NOT NULL
 GROUP BY j.supplier_key
),
candidates AS (
 SELECT DISTINCT d.supplier_key,m.message_hmac,m.request_id AS inbox_request_id,
  m.received_at,m.kind,m.chat_hmac,
  a.request_id AS archive_request_id,a.state AS archive_state,
  a.finished_at,a.reserved_at,a.content_sha256,a.storage_path,
  a.size_bytes,a.mime
 FROM target r
 JOIN dispatched d ON true
 JOIN cotironda_piloto_privado.participants p
  ON p.key=d.supplier_key AND p.participant_role='supplier'
  AND p.chat_hmac IS NOT NULL
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.participant_key=d.supplier_key AND m.chat_hmac=p.chat_hmac
  AND m.kind IN ('document','image')
  AND m.received_at>=d.first_sent AND m.received_at<=r.closes_at
  AND m.received_at>=r.created_at
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.participant_key=d.supplier_key
  AND a.chat_hmac=m.chat_hmac AND a.kind=m.kind
),
stored AS (
 SELECT c.* FROM candidates c
 WHERE c.archive_state='stored' AND c.finished_at IS NOT NULL
  AND c.reserved_at>=c.received_at
  AND c.message_hmac ~ '^[a-f0-9]{64}$'
  AND c.content_sha256 ~ '^[a-f0-9]{64}$'
  AND c.storage_path='media/'||c.message_hmac
  AND c.size_bytes BETWEEN 1 AND 8388608
  AND c.mime IN ('application/pdf','image/jpeg','image/png','image/webp',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'text/plain','text/csv')
),
with_proof AS (
 SELECT s.* FROM target r
 JOIN stored s ON s.inbox_request_id=r.id AND s.archive_request_id=r.id
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 proof
  ON proof.message_hmac=s.message_hmac
  AND proof.supplier_key=s.supplier_key AND proof.request_id=r.id
  AND proof.kind=s.kind AND proof.source_sha256=s.content_sha256
  AND proof.association IN ('quoted_whapi_id','single_active_round',
   'prior_supplier_preamble')
),
blocked AS (
 -- An unresolved attempt exists BEFORE a durable MVP225 association.
 -- Never require with_proof to recognize an unresolved source.
 SELECT DISTINCT s.supplier_key FROM target r
 JOIN candidates s ON true
 WHERE EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  WHERE u.message_hmac=s.message_hmac AND u.supplier_key=s.supplier_key
    AND u.state IN ('ambiguous_round','not_matched','media_context_conflict')
 )
 OR EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 other
  JOIN cotironda_piloto_privado.requests other_r
   ON other_r.id=other.request_id
  JOIN cotironda_piloto_privado.invitations other_i
   ON other_i.request_id=other.request_id
   AND other_i.supplier_key=other.supplier_key
  WHERE other.supplier_key=s.supplier_key AND other.request_id<>r.id
   AND other.state='api_accepted' AND other.whapi_message_id IS NOT NULL
   AND other.finished_at IS NOT NULL
   AND other.finished_at<=s.received_at
   AND other_i.state='prepared'
   AND other_r.state IN ('prepared','closed')
   AND other_r.created_at<=s.received_at AND other_r.closes_at>=s.received_at
 )
),
verified AS (
 SELECT DISTINCT s.supplier_key FROM target r JOIN with_proof s ON true
 WHERE NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
  WHERE u.message_hmac=s.message_hmac AND u.supplier_key=s.supplier_key
    AND u.state IN ('ambiguous_round','not_matched','media_context_conflict')
 )
 AND NOT EXISTS (
  SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 other
  JOIN cotironda_piloto_privado.requests other_r
   ON other_r.id=other.request_id
  JOIN cotironda_piloto_privado.invitations other_i
   ON other_i.request_id=other.request_id
   AND other_i.supplier_key=other.supplier_key
  WHERE other.supplier_key=s.supplier_key AND other.request_id<>r.id
   AND other.state='api_accepted' AND other.whapi_message_id IS NOT NULL
   AND other.finished_at IS NOT NULL AND other.finished_at<=s.received_at
   AND other_i.state='prepared'
   AND other_r.state IN ('prepared','closed')
   AND other_r.created_at<=s.received_at AND other_r.closes_at>=s.received_at
 )
),
states AS (
 SELECT d.supplier_key,
 CASE
  WHEN v.supplier_key IS NOT NULL THEN 'recibido_verificado'
  WHEN b.supplier_key IS NOT NULL THEN 'conflicto_privado'
  WHEN EXISTS(SELECT 1 FROM candidates c WHERE c.supplier_key=d.supplier_key)
    THEN 'candidato_temporal_no_atribuible'
  ELSE 'sin_archivo_verificado'
 END AS state
 FROM dispatched d
 LEFT JOIN verified v ON v.supplier_key=d.supplier_key
 LEFT JOIN blocked b ON b.supplier_key=d.supplier_key
)
SELECT CASE WHEN (SELECT n FROM round_count)=1
 THEN 'diagnostico_privado_una_ronda'
 ELSE 'sin_ronda_unica_no_evaluar'
 END AS estado,
 (SELECT n FROM round_count) AS rondas_preparadas_vigentes,
 (SELECT count(*)::integer FROM invited) AS proveedores_invitados,
 (SELECT count(*)::integer FROM dispatched) AS despachos_aceptados,
 (SELECT count(DISTINCT supplier_key)::integer FROM candidates)
   AS proveedores_con_candidato_temporal,
 (SELECT count(DISTINCT supplier_key)::integer FROM stored)
   AS proveedores_con_archivo_valido_en_ventana,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM stored s
  JOIN target t ON true WHERE s.inbox_request_id=t.id
   AND s.archive_request_id=t.id)
   AS proveedores_con_inbox_y_archivo_en_ronda,
 (SELECT count(DISTINCT supplier_key)::integer FROM with_proof)
   AS proveedores_con_prueba_fuerte,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM stored s
  WHERE s.inbox_request_id IS NULL)
   AS proveedores_con_inbox_sin_ronda,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM stored s
  WHERE s.archive_request_id IS NULL)
   AS proveedores_con_archivo_sin_ronda,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM stored s
  JOIN target r ON true WHERE EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 p
   WHERE p.message_hmac=s.message_hmac
     AND p.supplier_key=s.supplier_key AND p.request_id<>r.id
     AND p.source_sha256=s.content_sha256
  )) AS proveedores_con_prueba_otra_ronda,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM candidates s
  JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
   ON u.message_hmac=s.message_hmac AND u.supplier_key=s.supplier_key
   AND u.state='ambiguous_round') AS proveedores_ambiguous_round_mvp237,
 (SELECT max(u.candidate_count)::integer FROM candidates s
  JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 u
   ON u.message_hmac=s.message_hmac AND u.supplier_key=s.supplier_key
   AND u.state='ambiguous_round') AS max_rondas_candidatas_en_fallo,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM candidates s
  JOIN cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 x
   ON x.source_hmac=s.message_hmac AND x.supplier_key=s.supplier_key
  WHERE x.state='review' AND x.reason='insufficient_material_evidence')
   AS proveedores_m291_sin_evidencia,
 (SELECT count(DISTINCT s.supplier_key)::integer FROM candidates s
  JOIN cotironda_piloto_privado.ai_supplier_correlation_retries_mvp336 r
   ON r.source_hmac=s.message_hmac AND r.supplier_key=s.supplier_key)
   AS proveedores_con_reintento_registrado,
 (SELECT count(*)::integer FROM states WHERE state='recibido_verificado')
   AS recibidos_verificados,
 (SELECT count(*)::integer FROM states WHERE state='conflicto_privado')
   AS requiere_revision_por_conflicto,
 (SELECT count(*)::integer FROM states WHERE state='candidato_temporal_no_atribuible')
   AS solo_candidato_temporal_no_atribuible,
 (SELECT count(*)::integer FROM states WHERE state='sin_archivo_verificado')
   AS sin_archivo_verificado,
 (to_regprocedure('public.cotironda_piloto_document_receipts_mvp354(text)')
  IS NOT NULL) AS proyeccion_mvp354_instalada;
