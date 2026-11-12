-- MVP354 — SOLO DESARROLLO. No ejecutado en piloto.
-- Conteo documental por ronda y por proveedor, sin IA/precios.
-- El bearer en el navegador se transforma en SHA-256 en Edge; el SQL
-- REVALIDA token, comprador, vigencia, revocación, ronda e invitación.
-- Servicio únicamente: nunca conceder EXECUTE a anon/authenticated.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_document_receipts_mvp354(
 p_token_hash text
) RETURNS jsonb
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = ''
AS $function$
WITH contexto AS (
 SELECT r.id AS request_id,r.created_at,r.closes_at
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE p_token_hash ~ '^[a-f0-9]{64}$'
  AND t.token_hash=p_token_hash AND t.revoked_at IS NULL
  AND t.expires_at>clock_timestamp()
  AND r.state IN ('prepared','closed')
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
),
despachados AS (
 SELECT j.supplier_key,min(j.finished_at) AS first_sent
 FROM contexto r
 JOIN cotironda_piloto_privado.invitations i ON i.request_id=r.request_id
   AND i.state='prepared'
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
   ON j.request_id=i.request_id AND j.supplier_key=i.supplier_key
   AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
   AND j.finished_at IS NOT NULL
 JOIN cotironda_piloto_privado.participants supplier
   ON supplier.key=j.supplier_key AND supplier.participant_role='supplier'
   AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 GROUP BY j.supplier_key
),
recibidos AS (
 SELECT DISTINCT e.supplier_key
 FROM contexto r
 JOIN despachados e ON true
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
   ON a.request_id=r.request_id AND a.participant_key=e.supplier_key
 JOIN cotironda_piloto_privado.participants p
   ON p.key=e.supplier_key AND p.chat_hmac=a.chat_hmac
 WHERE a.state='stored' AND a.finished_at IS NOT NULL
  AND a.reserved_at>=e.first_sent AND a.reserved_at<=r.closes_at
  AND a.reserved_at>=r.created_at
  AND a.message_hmac ~ '^[a-f0-9]{64}$'
  AND a.storage_path=('media/'||a.message_hmac)
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.size_bytes BETWEEN 1 AND 8388608
  AND a.mime IN (
   'application/pdf','image/jpeg','image/png','image/webp',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'text/plain','text/csv'
  )
  -- La simple proximidad temporal NO prueba una ronda: una segunda
  -- invitación despachada al mismo proveedor en ventana simultánea
  -- bloquea la proyección y exige revisión operativa privada.
  AND NOT EXISTS (
   SELECT 1
   FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 other_job
   JOIN cotironda_piloto_privado.requests other_round
     ON other_round.id=other_job.request_id
   JOIN cotironda_piloto_privado.invitations other_inv
     ON other_inv.request_id=other_job.request_id
       AND other_inv.supplier_key=other_job.supplier_key
   WHERE other_job.supplier_key=e.supplier_key
     AND other_job.request_id<>r.request_id
     AND other_job.state='api_accepted'
     AND other_job.whapi_message_id IS NOT NULL
     AND other_job.finished_at IS NOT NULL
     AND other_job.finished_at<=a.reserved_at
     AND other_inv.state='prepared'
     AND other_round.state IN ('prepared','closed')
     AND other_round.created_at<=a.reserved_at
     AND other_round.closes_at>=a.reserved_at
  )
),
totales AS (
 SELECT (SELECT count(*) FROM despachados)::integer AS invitados,
        (SELECT count(*) FROM recibidos)::integer AS archivos_recibidos
)
SELECT coalesce((
 SELECT jsonb_build_object(
  'state','recepcion_documental_anonima_mvp354',
  'invitados',t.invitados,
  'archivos_recibidos',t.archivos_recibidos,
  'pendientes',t.invitados-t.archivos_recibidos,
  'precios_validados',false,
  'originales_disponibles',false,
  'identidades_reveladas',false,
  'comparacion_permitida',false
 ) FROM contexto c CROSS JOIN totales t
),jsonb_build_object('state','not_found'));
$function$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_document_receipts_mvp354(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_document_receipts_mvp354(text)
 TO service_role;
