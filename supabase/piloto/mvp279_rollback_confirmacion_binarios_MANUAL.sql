-- MVP279 MANUAL rollback only after CENTRAL + DISPATCH OFF and an
-- independent review of any outstanding buyer round. Preserve all audit
-- evidence: do NOT delete original files, buyer reviews or messages.
BEGIN;
DO $gate$ BEGIN
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
    WHERE enabled)
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
    WHERE enabled)
 THEN RAISE EXCEPTION 'mvp279_rollback_requires_all_gates_off'; END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279 v
  JOIN cotironda_piloto_privado.requests r ON r.id=v.request_id
  WHERE r.state IN('draft','prepared')
   AND r.closes_at>clock_timestamp()
 ) THEN RAISE EXCEPTION 'mvp279_rollback_has_live_buyer_review'; END IF;
END $gate$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_publish_mvp222(
 p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $publish$
DECLARE v_round record; source record; buyer record; sup record;
 v_supplier_count int; v_lines int; v_pairs int; v_added int;
BEGIN
 IF p_request IS NULL THEN RETURN jsonb_build_object('state','invalid_request');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','dispatch_disabled');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','transport_disabled');END IF;

 SELECT r.id,r.state,r.buyer_key,r.source_hmac,r.original_request,
  r.delivery_city,r.closes_at
 INTO v_round FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 a ON a.request_id=r.id
 WHERE r.id=p_request AND a.status='shadow'
 FOR UPDATE OF r;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_shadow_request');END IF;
 IF v_round.state='prepared' THEN RETURN jsonb_build_object('state','already_published');END IF;
 IF v_round.state<>'draft' OR v_round.closes_at<=clock_timestamp()
 THEN RETURN jsonb_build_object('state','request_not_ready');END IF;

 SELECT b.key,b.chat_hmac INTO buyer FROM cotironda_piloto_privado.participants b
 WHERE b.key=v_round.buyer_key AND b.participant_role='buyer'
  AND b.chat_hmac IS NOT NULL AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','buyer_not_authorized');END IF;
 IF v_round.source_hmac IS NULL OR v_round.source_hmac !~ '^[0-9a-f]{64}$'
 THEN RETURN jsonb_build_object('state','source_invalid');END IF;
 SELECT m.message_hmac,m.chat_hmac,m.participant_key,m.plaintext_sha256
 INTO source FROM cotironda_piloto_privado.whapi_inbox m
 WHERE m.message_hmac=v_round.source_hmac AND m.request_id=v_round.id
  AND m.participant_key=buyer.key AND m.chat_hmac=buyer.chat_hmac
  AND m.processing_state='needs_review'
  AND ((m.kind='text' AND m.plaintext_sha256=
   encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex'))
   OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex')))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex'),(SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines l WHERE l.request_id=v_round.id))));
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_not_verified');END IF;

 SELECT count(*) INTO v_lines FROM cotironda_piloto_privado.request_lines l
 WHERE l.request_id=v_round.id;
 IF v_lines NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','request_exceeds_pdf_limit'); END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221 l
     WHERE l.request_id=v_round.id)<>v_lines THEN
  RETURN jsonb_build_object('state','rubros_incomplete');END IF;

 -- Cobertura: no ocultar silenciosamente materiales sin destino.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
  WHERE l.request_id=v_round.id AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
   WHERE d.request_id=l.request_id AND d.line_no=l.line_no))
 THEN RETURN jsonb_build_object('state','uncovered_items'); END IF;
 SELECT count(DISTINCT d.supplier_key),count(*) INTO v_supplier_count,v_pairs
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
 WHERE d.request_id=v_round.id;
 IF v_supplier_count NOT BETWEEN 1 AND 25 OR v_pairs>625
 THEN RETURN jsonb_build_object('state','too_many_suppliers'); END IF;

 -- Revalidar catálogo/zonas bajo lock. La falta de confirmación formal
 -- NO impide INVITAR a cotizar si el proveedor ya consintió el contacto.
 FOR sup IN
  SELECT p.key,p.delivery_city
  FROM cotironda_piloto_privado.participants p
  JOIN (SELECT DISTINCT supplier_key FROM
    cotironda_piloto_privado.ai_shadow_destinos_mvp221
    WHERE request_id=v_round.id) d ON d.supplier_key=p.key
  ORDER BY p.key FOR UPDATE OF p
 LOOP
  IF sup.delivery_city IS NULL
  THEN RETURN jsonb_build_object('state','supplier_without_zone');END IF;
 END LOOP;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
  JOIN cotironda_piloto_privado.request_lines l ON
    l.request_id=d.request_id AND l.line_no=d.line_no
  JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
  LEFT JOIN cotironda_piloto_privado.catalogue_lines c
    ON c.participant_key=d.supplier_key AND c.line_no=d.catalogue_line_no
  WHERE d.request_id=v_round.id AND (
    p.participant_role<>'supplier' OR p.chat_hmac IS NULL OR
    p.consent_at IS NULL OR p.opted_out_at IS NOT NULL OR
    lower(btrim(p.delivery_city))<>lower(btrim(v_round.delivery_city)) OR
    c.line_no IS NULL OR c.literal_description<>d.catalogue_description
  )
 ) THEN RETURN jsonb_build_object('state','catalogue_or_identity_changed');END IF;
 IF EXISTS(SELECT 1 FROM
  (SELECT supplier_key,count(*) AS n
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
   WHERE request_id=v_round.id GROUP BY supplier_key) x
  WHERE x.n NOT BETWEEN 1 AND 25)
 THEN RETURN jsonb_build_object('state','supplier_pdf_limit');END IF;

 -- El trigger legacy omite SOLO el sidecar IA. No insertar por fuera.
 INSERT INTO cotironda_piloto_privado.invitations(request_id,supplier_key)
 SELECT v_round.id,d.supplier_key FROM (
  SELECT DISTINCT supplier_key FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
  WHERE request_id=v_round.id) d ORDER BY d.supplier_key;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added<>v_supplier_count THEN RAISE EXCEPTION 'mvp222_invitation_count';END IF;
 INSERT INTO cotironda_piloto_privado.invitation_lines_mvp099(
  request_id,supplier_key,line_no)
 SELECT request_id,supplier_key,line_no
 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
 WHERE request_id=v_round.id ORDER BY supplier_key,line_no;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added<>v_pairs THEN RAISE EXCEPTION 'mvp222_pair_count';END IF;
 INSERT INTO cotironda_piloto_privado.ai_dispatch_jobs_mvp222(request_id,supplier_key)
 SELECT v_round.id,supplier_key FROM (
  SELECT DISTINCT supplier_key FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
  WHERE request_id=v_round.id) d ORDER BY supplier_key;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 IF v_added<>v_supplier_count THEN RAISE EXCEPTION 'mvp222_job_count';END IF;
 UPDATE cotironda_piloto_privado.requests SET state='prepared' WHERE id=v_round.id;
 RETURN jsonb_build_object('state','ready_for_delivery',
  'suppliers',v_supplier_count,'source_lines',v_lines,
  'mapped_lines',v_pairs,'legacy_whapi_jobs',0);
END;
$publish$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_ready_for_chat_mvp223(
 p_buyer_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $lookup$
DECLARE rid uuid; n int;
BEGIN
 IF p_buyer_chat_hmac IS NULL OR
  p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid_input');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT count(DISTINCT r.id),min(r.id::text)::uuid INTO n,rid
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id AND shadow.status='shadow'
 JOIN cotironda_piloto_privado.participants b
  ON b.key=r.buyer_key
 JOIN cotironda_piloto_privado.whapi_inbox src
  ON src.message_hmac=r.source_hmac AND src.request_id=r.id
  AND src.participant_key=b.key AND src.chat_hmac=b.chat_hmac
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
  ON job.request_id=r.id AND job.state='pending'
 WHERE r.state='prepared' AND r.closes_at>clock_timestamp()
  AND r.created_at>clock_timestamp()-interval '30 minutes'
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.processing_state='needs_review'
  AND ((src.kind='text' AND src.plaintext_sha256=
   encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))
   OR (src.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    src.message_hmac,src.chat_hmac,src.participant_key,encode(sha256(convert_to(r.original_request,'UTF8')),'hex')))
   OR (src.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      src.message_hmac,src.chat_hmac,src.participant_key,
      encode(sha256(convert_to(r.original_request,'UTF8')),'hex'),(SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines l WHERE l.request_id=r.id))));
 IF n=0 THEN RETURN jsonb_build_object('state','empty');END IF;
 IF n<>1 THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 RETURN jsonb_build_object('state','ready','request_id',rid);
END;
$lookup$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_claim_mvp222(
 p_request uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $claim$
DECLARE j record; lease uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT d.request_id,d.supplier_key,p.chat_hmac INTO j
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
 JOIN cotironda_piloto_privado.requests r ON r.id=d.request_id
 JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
 JOIN cotironda_piloto_privado.invitations i
   ON i.request_id=d.request_id AND i.supplier_key=d.supplier_key
 WHERE d.request_id=p_request AND d.state='pending'
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND i.state='prepared' AND p.participant_role='supplier'
  AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND lower(btrim(r.delivery_city))=lower(btrim(p.delivery_city))
 ORDER BY d.supplier_key FOR UPDATE OF d SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','empty');END IF;
 lease:=gen_random_uuid();
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state='leased',lease_token=lease,leased_at=clock_timestamp()
 WHERE request_id=j.request_id AND supplier_key=j.supplier_key;
 RETURN jsonb_build_object('state','leased','request_id',j.request_id,
   'supplier_key',j.supplier_key,'chat_hmac',j.chat_hmac,'lease_token',lease);
END;
$claim$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_pdf_snapshot_mvp222(
 p_request uuid,p_supplier text,p_lease uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $snapshot$
 SELECT jsonb_build_object(
  'requestId',r.id,'city',r.delivery_city,
  'deadlineIso',to_char(r.closes_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'deliveryNote',r.requested_delivery_note,
  'items',(SELECT jsonb_agg(jsonb_build_object(
    'description',l.original_description,
    'quantity',l.quantity::text,'unit',l.unit
   ) ORDER BY l.line_no)
   FROM cotironda_piloto_privado.request_lines l
   JOIN cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    ON d.request_id=l.request_id AND d.line_no=l.line_no
   WHERE l.request_id=r.id AND d.supplier_key=p_supplier)
 )
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  ON j.request_id=r.id AND j.supplier_key=p_supplier
 JOIN cotironda_piloto_privado.participants s ON s.key=p_supplier
 JOIN cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
   ON g.only_row AND g.enabled AND g.activated_at IS NOT NULL
 JOIN cotironda_piloto_privado.integration_flags f
   ON f.only_row AND f.whatsapp_outbound_enabled
 WHERE r.id=p_request AND j.state='leased' AND j.lease_token=p_lease
  AND r.state='prepared' AND r.closes_at>clock_timestamp()
  AND s.consent_at IS NOT NULL AND s.opted_out_at IS NULL
  AND lower(btrim(s.delivery_city))=lower(btrim(r.delivery_city))
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.invitations i
    WHERE i.request_id=r.id AND i.supplier_key=p_supplier
      AND i.state='prepared')
  AND NOT EXISTS(SELECT 1 FROM
    cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    LEFT JOIN cotironda_piloto_privado.catalogue_lines c
      ON c.participant_key=d.supplier_key AND c.line_no=d.catalogue_line_no
    WHERE d.request_id=r.id AND d.supplier_key=p_supplier
      AND (c.line_no IS NULL OR c.literal_description<>d.catalogue_description));
$snapshot$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_review_issue_mvp279(text,text),
 public.cotironda_piloto_ia_review_delivery_mvp279(uuid,text,text),
 public.cotironda_piloto_ia_review_confirm_mvp279(text,text,text),
 cotironda_piloto_privado.ai_buyer_snapshot_mvp279(uuid),
 cotironda_piloto_privado.confirmada_binaria_mvp279(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text),
 public.cotironda_piloto_ia_claim_mvp222(uuid),
 public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text),
 public.cotironda_piloto_ia_claim_mvp222(uuid),
 public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid)
 TO service_role;
COMMIT;
-- Review record table remains private, RLS enabled, fully intact.
