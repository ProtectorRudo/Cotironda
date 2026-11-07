-- MVP222: ENVÍO DE IA CENTRAL SEPARADO del trigger heredado.
-- Requiere MVP221. Instalación por defecto OFF, sin WhatsApp.
-- No modifica catálogos, rondas ni respuestas existentes.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_dispatch_gate_mvp222 (
  only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
  enabled boolean NOT NULL DEFAULT false,
  activated_at timestamptz,
  CHECK((enabled=false AND activated_at IS NULL) OR
        (enabled=true AND activated_at IS NOT NULL))
);
INSERT INTO cotironda_piloto_privado.ai_dispatch_gate_mvp222(only_row,enabled)
VALUES (true,false) ON CONFLICT(only_row) DO NOTHING;
ALTER TABLE cotironda_piloto_privado.ai_dispatch_gate_mvp222 ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_dispatch_jobs_mvp222 (
  request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id) ON DELETE RESTRICT,
  supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'pending'
   CHECK(state IN ('pending','leased','api_accepted','uncertain')),
  lease_token uuid,
  leased_at timestamptz,
  whapi_message_id text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  finished_at timestamptz,
  PRIMARY KEY(request_id,supplier_key),
  CHECK((state='pending' AND lease_token IS NULL AND finished_at IS NULL)
   OR (state='leased' AND lease_token IS NOT NULL AND leased_at IS NOT NULL AND finished_at IS NULL)
   OR (state IN ('api_accepted','uncertain') AND lease_token IS NOT NULL
       AND leased_at IS NOT NULL AND finished_at IS NOT NULL))
);
ALTER TABLE cotironda_piloto_privado.ai_dispatch_jobs_mvp222 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.ai_dispatch_gate_mvp222,
 cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 FROM PUBLIC,anon,authenticated,service_role;

-- Conservar EXACTO el comportamiento anterior salvo en rondas IA en sombra.
-- Sin este early return el trigger enqueue_on_invitation crea whapi_outbox.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.queue_invitation_whapi_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $old$
DECLARE txt text;
BEGIN
 IF EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_shadow_requests_mvp221 a
            WHERE a.request_id=new.request_id) THEN
    RETURN new; -- IA Central tiene su propia cola, inicialmente DESACTIVADA.
 END IF;
 SELECT cotironda_piloto_privado.invitation_body_mvp089(new.request_id)
 INTO txt;
 IF txt IS NULL THEN RAISE EXCEPTION 'missing_invitation_lines'; END IF;
 INSERT INTO cotironda_piloto_privado.whapi_outbox(request_id,supplier_key,message_body)
 VALUES(new.request_id,new.supplier_key,txt);
 RETURN new;
END;
$old$;

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
  AND m.kind='text' AND m.processing_state='needs_review'
  AND m.plaintext_sha256=encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex');
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

-- La cola IA solo puede ser reclamada si está ACTIVADA y el transporte
-- aprobado; usar SKIP LOCKED para impedir envíos simultáneos.
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

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_mvp222(
 p_request uuid,p_supplier text,p_lease uuid,p_state text,
 p_message_id text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE n int;
BEGIN
 IF p_state NOT IN('api_accepted','uncertain') OR p_request IS NULL OR
  p_supplier IS NULL OR p_lease IS NULL OR
  (p_message_id IS NOT NULL AND
   (length(p_message_id) NOT BETWEEN 8 AND 160 OR
    p_message_id !~ '^[A-Za-z0-9._:-]+$'))
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state=p_state,
     whapi_message_id=CASE WHEN p_state='api_accepted' THEN p_message_id ELSE NULL END,
     finished_at=clock_timestamp()
 WHERE request_id=p_request AND supplier_key=p_supplier
   AND state='leased' AND lease_token=p_lease;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END;
$finish$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_claim_mvp222(uuid),
 public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid),
 public.cotironda_piloto_ia_finish_mvp222(uuid,text,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_claim_mvp222(uuid),
 public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid),
 public.cotironda_piloto_ia_finish_mvp222(uuid,text,uuid,text,text)
 TO service_role;
