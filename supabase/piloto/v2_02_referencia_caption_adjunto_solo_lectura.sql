-- Cotironda V2-02: referencia escrita en CAPTION de un adjunto original.
-- NO inspecciona ni inventa contenido PDF/Excel. La descripcion cifrada
-- del manifiesto fue archivada por el webhook autenticado, se coteja SHA
-- y solo entonces se recupera el ID de un despacho real.
-- Esta RPC es SOLO LECTURA: MVP225 conserva el vinculo definitivo.
-- Requiere publicacion independiente de SQL y Edge: en repositorio NO opera.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_quoted_id_for_media_reference(
 p_message_hmac text,
 p_chat_hmac text,
 p_original_manifest text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $v2$
DECLARE
 v_source record;
 v_manifest jsonb;
 v_caption text;
 v_code text;
 v_codes integer;
 v_candidates integer;
 v_quoted text;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_original_manifest IS NULL
 OR length(p_original_manifest) NOT BETWEEN 10 AND 3000
 OR p_original_manifest IS NOT JSON OBJECT
 THEN RETURN jsonb_build_object('state','invalid_input'); END IF;
 v_manifest:=p_original_manifest::jsonb;

 -- La cabecera es metadato original de Whapi, NO texto de IA.
 -- No aceptar nombres de archivo, URLs, archivos no almacenados ni
 -- una descripcion construida sin coincidencia byte a byte del SHA.
 SELECT m.participant_key,m.received_at,m.kind,p.consent_at AS supplier_consent_at
 INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants p
  ON p.key=m.participant_key AND p.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac
  AND a.chat_hmac=m.chat_hmac AND a.participant_key=m.participant_key
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
 AND m.kind IN ('document','image') AND a.kind=m.kind
 AND m.request_id IS NULL AND a.request_id IS NULL
 AND m.processing_state IN ('unmatched_quote','needs_review')
 AND m.plaintext_sha256=encode(sha256(convert_to(p_original_manifest,'UTF8')),'hex')
 AND a.state='stored' AND a.content_sha256 ~ '^[a-f0-9]{64}$'
 AND a.size_bytes BETWEEN 1 AND 8388608
 AND a.storage_path='media/'||m.message_hmac
 AND a.finished_at IS NOT NULL
 AND a.media_id_sha256=encode(sha256(convert_to(v_manifest->>'media_id','UTF8')),'hex')
 AND a.mime=v_manifest->>'mime'
 AND v_manifest->>'origin'='whapi'
 AND v_manifest->>'version'='1'
 AND v_manifest->>'kind'=m.kind
 AND v_manifest->>'state'='awaiting_secure_download'
 AND p.participant_role='supplier'
 AND p.consent_at IS NOT NULL AND p.consent_at<=m.received_at
 AND p.opted_out_at IS NULL;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state','source_not_authorized');
 END IF;

 v_caption:=v_manifest->>'caption';
 IF v_caption IS NULL OR length(v_caption) NOT BETWEEN 12 AND 500
 THEN RETURN jsonb_build_object('state','reference_absent'); END IF;

 -- Solo codigo marcado y UNICO. Un UUID completo ambiguo, dos codigos,
 -- falta de referencia o colision de 8 caracteres => no hay vinculo.
 SELECT count(*),min(ref) INTO v_codes,v_code
 FROM (
  SELECT DISTINCT captures[2] AS ref
  FROM regexp_matches(
   upper(v_caption),
   '(COTIRONDA[[:space:]]+PEDIDO|COTI)[[:space:]:#-]*([A-F0-9]{8})([^A-F0-9]|$)',
   'g'
  ) AS m(captures)
 ) codes;
 IF v_codes=0 THEN RETURN jsonb_build_object('state','reference_absent');END IF;
 IF v_codes<>1 THEN RETURN jsonb_build_object('state','reference_ambiguous');END IF;

 -- Frente a dos obras simultaneas del mismo proveedor, NO elegir por fecha.
 -- Correlacion es por codigo + proveedor + invitacion + despacho aceptado
 -- + autorizaciones preexistentes, verificada otra vez por MVP225.
 SELECT count(*),min(job.whapi_message_id)
 INTO v_candidates,v_quoted
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
 JOIN cotironda_piloto_privado.requests r ON r.id=job.request_id
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=r.id AND inv.supplier_key=job.supplier_key
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 WHERE job.supplier_key=v_source.participant_key
 AND job.state='api_accepted'
 AND job.whapi_message_id ~ '^[A-Za-z0-9._:-]{8,160}$'
 AND job.finished_at IS NOT NULL AND job.finished_at<=v_source.received_at
 AND v_source.supplier_consent_at<=job.finished_at
 AND buyer.consent_at<=job.finished_at
 AND inv.created_at<=job.finished_at
 AND r.created_at<=v_source.received_at
 AND r.closes_at>v_source.received_at
 AND r.state='prepared' AND inv.state='prepared'
 AND sh.status='shadow'
 AND buyer.participant_role='buyer'
 AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 AND upper(substr(r.id::text,1,8))=v_code;
 IF v_candidates<>1 OR v_quoted IS NULL THEN
  RETURN jsonb_build_object('state',
   CASE WHEN v_candidates>1 THEN 'reference_ambiguous'
   ELSE 'reference_not_linkable' END);
 END IF;
 RETURN jsonb_build_object('state','matched','quoted_whapi_id',v_quoted);
END;
$v2$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_quoted_id_for_media_reference(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_quoted_id_for_media_reference(text,text,text)
 TO service_role;
