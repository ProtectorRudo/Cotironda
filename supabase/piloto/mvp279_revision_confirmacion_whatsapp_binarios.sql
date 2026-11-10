-- MVP279 — Buyer approval for a SPECIFIC binary original, exact material list,
-- quantities, rubros, supplier routing, delivery city and deadline. OFF by default.
-- This code DOES NOT enable Whapi or turn on any SQL gate.
-- Requires MVP278. No table is exposed through public API.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_buyer_review_mvp279(
 request_id uuid PRIMARY KEY
  REFERENCES cotironda_piloto_privado.ai_shadow_requests_mvp221(request_id)
  ON DELETE RESTRICT,
 buyer_key text NOT NULL
  REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 source_hmac text NOT NULL UNIQUE CHECK(source_hmac ~ '^[a-f0-9]{64}$'),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 code_sha256 text NOT NULL UNIQUE CHECK(code_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'issued'
  CHECK(state IN ('issued','api_accepted','uncertain','confirmed')),
 whapi_message_id text UNIQUE,
 confirmed_reply_hmac text UNIQUE
  CHECK(confirmed_reply_hmac IS NULL OR confirmed_reply_hmac ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL,
 sent_at timestamptz,
 confirmed_at timestamptz,
 CHECK (expires_at>created_at AND expires_at<=created_at+interval '24 hours'),
 CHECK(
  (state='issued' AND whapi_message_id IS NULL AND sent_at IS NULL AND confirmed_reply_hmac IS NULL AND confirmed_at IS NULL)
  OR (state='uncertain' AND sent_at IS NOT NULL AND confirmed_reply_hmac IS NULL AND confirmed_at IS NULL)
  OR (state='api_accepted' AND whapi_message_id IS NOT NULL AND sent_at IS NOT NULL AND confirmed_reply_hmac IS NULL AND confirmed_at IS NULL)
  OR (state='confirmed' AND whapi_message_id IS NOT NULL AND sent_at IS NOT NULL AND confirmed_reply_hmac IS NOT NULL AND confirmed_at IS NOT NULL)
 )
);
ALTER TABLE cotironda_piloto_privado.ai_buyer_review_mvp279 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.ai_buyer_review_mvp279
 FROM PUBLIC,anon,authenticated,service_role;

-- SHA covers source, original text, original binary SHA, timestamp/deadline,
-- delivery conditions, every line AND all hidden supplier catalog routes.
-- This helper is NEVER exposed; the public review RPC returns only items,
-- city and code to the trusted authenticated Whapi handler.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.ai_buyer_snapshot_mvp279(
 p_request uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $snapshot$
 SELECT jsonb_build_object(
  'requestId',r.id::text,'buyer',r.buyer_key,'source',r.source_hmac,
  'originalTextHash',encode(sha256(convert_to(r.original_request,'UTF8')),'hex'),
  'originalBinaryHash',e.original_sha256,
  'derivedTextHash',e.derived_text_sha256,
  'city',r.delivery_city,'note',r.requested_delivery_note,
  'deadline',to_char(r.closes_at AT TIME ZONE 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'items',(SELECT jsonb_agg(jsonb_build_object(
   'lineNo',l.line_no,'description',l.original_description,
   'quantity',l.quantity::text,'unit',l.unit,'family',l.family_code,
   'rubro',rub.rubro,'evidence',rub.evidencia
   ) ORDER BY l.line_no)
   FROM cotironda_piloto_privado.request_lines l
   LEFT JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
    ON rub.request_id=l.request_id AND rub.line_no=l.line_no
   WHERE l.request_id=r.id),
  'destinations',(SELECT jsonb_agg(jsonb_build_object(
   'supplier',d.supplier_key,'lineNo',d.line_no,
   'catalogueLineNo',d.catalogue_line_no,
   'description',d.catalogue_description,
   'kind',d.tipo,'reason',d.explicacion
   ) ORDER BY d.supplier_key,d.line_no)
   FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
   WHERE d.request_id=r.id)
 )
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
  ON sh.request_id=r.id AND sh.source_hmac=r.source_hmac
 JOIN cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e
  ON e.message_hmac=r.source_hmac AND e.buyer_key=r.buyer_key
 WHERE r.id=p_request;
$snapshot$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.ai_buyer_snapshot_mvp279(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.ai_buyer_snapshot_mvp279(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.confirmada_binaria_mvp279(
 p_request uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $confirmed$
 SELECT coalesce(EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279 review
  JOIN cotironda_piloto_privado.requests r ON r.id=review.request_id
  JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.chat_hmac=review.chat_hmac
  WHERE review.request_id=p_request
   AND review.state='confirmed' AND review.confirmed_at IS NOT NULL
   AND review.source_hmac=r.source_hmac
   AND review.buyer_key=r.buyer_key
   AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
   AND review.snapshot_sha256=encode(sha256(convert_to(
    cotironda_piloto_privado.ai_buyer_snapshot_mvp279(r.id)::text,'UTF8')),'hex')
   AND r.closes_at>clock_timestamp()
 ),false);
$confirmed$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.confirmada_binaria_mvp279(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.confirmada_binaria_mvp279(uuid)
 TO service_role;

-- Creates a ONE-TIME exact preview; a repeat returns no code and will not
-- send twice. An uncertain Whapi delivery remains terminal/manual review.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_issue_mvp279(
 p_chat_hmac text,p_source_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $issue$
DECLARE r record;snapshot jsonb;items jsonb;code text;digest text;
 counter int;sup_count int;total int;issued_at timestamptz;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 SELECT request.id,request.buyer_key,request.source_hmac,request.closes_at,
  buyer.chat_hmac INTO r
 FROM cotironda_piloto_privado.requests request
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=request.buyer_key AND buyer.chat_hmac=p_chat_hmac
 JOIN cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 evidence
  ON evidence.message_hmac=request.source_hmac
 WHERE request.source_hmac=p_source_hmac AND request.state='draft'
  AND request.closes_at>clock_timestamp()+interval '1 hour'
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
   evidence.message_hmac,buyer.chat_hmac,buyer.key,
   evidence.derived_text_sha256,evidence.verified_items)
 FOR UPDATE OF request;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279
   WHERE request_id=r.id)
 THEN RETURN jsonb_build_object('state','already_issued');END IF;
 snapshot:=cotironda_piloto_privado.ai_buyer_snapshot_mvp279(r.id);
 items:=snapshot->'items';
 IF snapshot IS NULL OR jsonb_typeof(items)<>'array'
 OR jsonb_array_length(items) NOT BETWEEN 1 AND 25
 OR jsonb_array_length(items)<>(SELECT verified_items
   FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278
   WHERE message_hmac=r.source_hmac)
 OR (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221
     WHERE request_id=r.id)<>jsonb_array_length(items)
 OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
    WHERE l.request_id=r.id AND NOT EXISTS(
     SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
     WHERE d.request_id=l.request_id AND d.line_no=l.line_no))
 THEN RETURN jsonb_build_object('state','incomplete_items_or_routes');END IF;
 -- Whatsapp text hard limit: NEVER cut any description or omit an item.
 SELECT coalesce(sum(length(l.original_description)+length(l.unit)+
     length(l.quantity::text)+length(rub.rubro)+35),0)::integer INTO total
 FROM cotironda_piloto_privado.request_lines l
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=l.request_id AND rub.line_no=l.line_no
 WHERE l.request_id=r.id;
 IF total>2400 OR total<10
 THEN RETURN jsonb_build_object('state','preview_requires_alternative_view');END IF;
 digest:=encode(sha256(convert_to(snapshot::text,'UTF8')),'hex');
 code:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,16));
 -- Un solo instante para cumplir expires_at<=created_at+24h sin carreras
 -- de microsegundos entre el DEFAULT y una segunda lectura del reloj.
 issued_at:=clock_timestamp();
 INSERT INTO cotironda_piloto_privado.ai_buyer_review_mvp279(
  request_id,buyer_key,chat_hmac,source_hmac,snapshot_sha256,code_sha256,
  created_at,expires_at
 ) VALUES(r.id,r.buyer_key,r.chat_hmac,r.source_hmac,digest,
   encode(sha256(convert_to(code,'UTF8')),'hex'),issued_at,
   least(issued_at+interval '24 hours',r.closes_at-interval '1 hour'));
 RETURN jsonb_build_object('state','issued',
  'request_id',r.id,'code',code,
  'city',snapshot->'city','note',snapshot->'note',
  'items',items,'items_count',jsonb_array_length(items),
  'deadline',snapshot->'deadline');
END
$issue$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_delivery_mvp279(
 p_request uuid,p_status text,p_whapi_message_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $delivery$
DECLARE n int;
BEGIN
 IF p_request IS NULL OR p_status NOT IN('api_accepted','uncertain')
 OR (p_status='api_accepted' AND
    (p_whapi_message_id IS NULL OR
     p_whapi_message_id !~ '^[A-Za-z0-9._:-]{8,160}$'))
 OR (p_status='uncertain' AND p_whapi_message_id IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_buyer_review_mvp279
 SET state=p_status,whapi_message_id=p_whapi_message_id,
  sent_at=clock_timestamp()
 WHERE request_id=p_request AND state='issued';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN n=1 THEN 'recorded' ELSE 'not_pending' END);
END
$delivery$;

-- Confirmation is bound to a signed/authenticated inbound WhatsApp text
-- and its original plaintext SHA: never accept an LLM transcript as a vote.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_confirm_mvp279(
 p_chat_hmac text,p_message_hmac text,p_exact_text text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $confirm$
DECLARE matchcode text[];digest text;v record;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_exact_text IS NULL OR length(p_exact_text)>80
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 matchcode:=regexp_match(btrim(p_exact_text),
  '^CONFIRMAR COTI ([a-f0-9]{16})$','i');
 IF matchcode IS NULL THEN RETURN jsonb_build_object('state','invalid_command');END IF;
 digest:=encode(sha256(convert_to(upper(matchcode[1]),'UTF8')),'hex');
 SELECT review.* INTO v FROM cotironda_piloto_privado.ai_buyer_review_mvp279 review
 JOIN cotironda_piloto_privado.requests r ON r.id=review.request_id
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.chat_hmac=review.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox msg
  ON msg.message_hmac=p_message_hmac AND msg.chat_hmac=p_chat_hmac
  AND msg.participant_key=buyer.key
 WHERE review.code_sha256=digest AND review.chat_hmac=p_chat_hmac
  AND review.state='api_accepted'
  AND r.state='draft' AND r.closes_at>clock_timestamp()
  AND review.expires_at>clock_timestamp()
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND msg.kind='text' AND msg.processing_state='needs_review'
  AND msg.received_at>review.created_at
  AND msg.plaintext_sha256=encode(sha256(convert_to(p_exact_text,'UTF8')),'hex')
 FOR UPDATE OF review;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized_or_expired');END IF;
 IF v.snapshot_sha256 IS DISTINCT FROM encode(sha256(convert_to(
    cotironda_piloto_privado.ai_buyer_snapshot_mvp279(v.request_id)::text,
    'UTF8')),'hex')
 THEN RETURN jsonb_build_object('state','stale_review');END IF;
 UPDATE cotironda_piloto_privado.ai_buyer_review_mvp279
 SET state='confirmed',confirmed_reply_hmac=p_message_hmac,
   confirmed_at=clock_timestamp()
 WHERE request_id=v.request_id AND state='api_accepted';
 RETURN jsonb_build_object('state','confirmed','request_id',v.request_id);
END
$confirm$;

-- Exact approvals only. Separate server switch controls whether it asks
-- the existing SQL publisher to create supplier dispatch jobs.
-- No grants are ever given to API consumers or Auth users.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_review_issue_mvp279(text,text),
 public.cotironda_piloto_ia_review_delivery_mvp279(uuid,text,text),
 public.cotironda_piloto_ia_review_confirm_mvp279(text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_review_issue_mvp279(text,text),
 public.cotironda_piloto_ia_review_delivery_mvp279(uuid,text,text),
 public.cotironda_piloto_ia_review_confirm_mvp279(text,text,text)
 TO service_role;


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
 -- PDF/Office may NEVER publish without an authenticated, version-locked
 -- one-time approval. Existing TEXT and TXT/CSV flows remain unchanged.
 IF NOT (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e WHERE e.message_hmac=v_round.source_hmac) OR cotironda_piloto_privado.confirmada_binaria_mvp279(v_round.id))
 THEN RETURN jsonb_build_object('state','buyer_review_required');END IF;

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
  AND (r.created_at>clock_timestamp()-interval '30 minutes'
   OR (EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279 review
     WHERE review.request_id=r.id AND review.state='confirmed'
       AND review.confirmed_at>clock_timestamp()-interval '30 minutes')
    AND cotironda_piloto_privado.confirmada_binaria_mvp279(r.id)))
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.processing_state='needs_review'
  AND (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e WHERE e.message_hmac=r.source_hmac) OR cotironda_piloto_privado.confirmada_binaria_mvp279(r.id))
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
  AND (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e WHERE e.message_hmac=r.source_hmac) OR cotironda_piloto_privado.confirmada_binaria_mvp279(r.id))
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
  AND (NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e WHERE e.message_hmac=r.source_hmac) OR cotironda_piloto_privado.confirmada_binaria_mvp279(r.id))
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


-- Critical: all direct publish/claim/PDF snapshot/ready-for-chat routes
-- re-check buyer's exact approval; no bypass via a different service RPC.
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
