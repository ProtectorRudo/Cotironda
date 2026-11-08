-- MVP306 EN DESARROLLO: sin confirmacion del comprador, con
-- evidencia, sin inventar consentimiento, sin tocar rondas anteriores.
-- DEPENDE DE MVP109, MVP280, MVP303, MVP304. GATE OFF por defecto.
CREATE TABLE cotironda_piloto_privado.ai_auto_release_gate_mvp306(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK((enabled AND activated_at IS NOT NULL) OR
  (NOT enabled AND activated_at IS NULL)));
INSERT INTO cotironda_piloto_privado.ai_auto_release_gate_mvp306
 (only_row,enabled) VALUES(true,false);
ALTER TABLE cotironda_piloto_privado.ai_auto_release_gate_mvp306 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_auto_release_gate_mvp306
 FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE cotironda_piloto_privado.ai_buyer_auto_release_mvp306(
 request_id uuid PRIMARY KEY REFERENCES cotironda_piloto_privado.requests(id),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 source_hmac text NOT NULL UNIQUE CHECK(source_hmac ~ '^[a-f0-9]{64}$'),
 snapshot_sha256 text NOT NULL CHECK(snapshot_sha256 ~ '^[a-f0-9]{64}$'),
 approved_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE cotironda_piloto_privado.ai_buyer_auto_release_mvp306 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_buyer_auto_release_mvp306
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_buyer_auto_immutable_mvp306 BEFORE UPDATE OR DELETE
 ON cotironda_piloto_privado.ai_buyer_auto_release_mvp306 FOR EACH ROW
 EXECUTE FUNCTION cotironda_piloto_privado.reject_supplier_line_mutation_mvp101();

-- Exigir consentimiento UNA SOLA VEZ en el alta del proveedor. Las rondas
-- nuevas sin autorizacion comercial no se envian; nunca revelar telefonos
-- por una mera inscripcion, sin evidencia de COTI CONTACTOS SI.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.proveedores_contactables_mvp306(
 p_request uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $contacts$
 SELECT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
              WHERE request_id=p_request)
 AND NOT EXISTS(
 SELECT 1 FROM
  (SELECT DISTINCT supplier_key FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221
    WHERE request_id=p_request) d
 JOIN cotironda_piloto_privado.participants p ON p.key=d.supplier_key
 LEFT JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
  ON ch.participant_key=p.key AND ch.chat_hmac=p.chat_hmac
 LEFT JOIN cotironda_piloto_privado.contact_reveal_consents_mvp109 c
  ON c.participant_key=p.key AND c.approved_at IS NOT NULL AND c.revoked_at IS NULL
 LEFT JOIN cotironda_piloto_privado.whapi_inbox approval
  ON approval.message_hmac=c.source_message_hmac
  AND approval.participant_key=p.key AND approval.chat_hmac=p.chat_hmac
  AND approval.kind='text' AND approval.plaintext_sha256=
   encode(sha256(convert_to('COTI CONTACTOS SI','UTF8')),'hex')
 LEFT JOIN cotironda_piloto_privado.whapi_inbox binding
  ON binding.message_hmac=ch.authenticated_message_hmac
  AND binding.participant_key=p.key AND binding.chat_hmac=p.chat_hmac
 WHERE p.participant_role<>'supplier' OR p.consent_at IS NULL
  OR p.opted_out_at IS NOT NULL OR ch.participant_key IS NULL
  OR c.participant_key IS NULL OR approval.message_hmac IS NULL
  OR binding.message_hmac IS NULL OR c.approved_at<approval.received_at
  OR p.display_label IS NULL OR length(trim(p.display_label)) NOT BETWEEN 2 AND 100
  OR p.display_label ~ '[[:cntrl:]<>]' OR p.display_label ~ '[0-9]{8,}');
$contacts$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.proveedores_contactables_mvp306(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.proveedores_contactables_mvp306(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_auto_release_mvp306(
 p_chat_hmac text,p_source_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $release$
DECLARE v record; snap jsonb; n int;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_hmac IS NULL OR p_source_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','dispatch_disabled');END IF;
 SELECT r.id,r.buyer_key,r.source_hmac,b.chat_hmac INTO v
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
  AND b.chat_hmac=p_chat_hmac
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 shadow
  ON shadow.request_id=r.id AND shadow.status='shadow'
 JOIN cotironda_piloto_privado.ai_auto_release_gate_mvp306 gate
  ON gate.only_row AND gate.enabled AND r.created_at>=gate.activated_at
 WHERE r.source_hmac=p_source_hmac AND r.state='draft'
  AND r.closes_at>clock_timestamp()+interval '1 hour'
  AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND cotironda_piloto_privado.fuente_revisable_mvp280(r.id)
 FOR UPDATE OF r;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_or_buyer_not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279
   WHERE request_id=v.id)
 THEN RETURN jsonb_build_object('state','historical_review');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306
   WHERE request_id=v.id)
 THEN RETURN jsonb_build_object('state','already_approved','request_id',v.id);END IF;
 snap:=cotironda_piloto_privado.ai_buyer_snapshot_mvp279(v.id);
 IF snap IS NULL OR jsonb_typeof(snap->'items')<>'array'
   OR jsonb_typeof(snap->'destinations')<>'array'
 THEN RETURN jsonb_build_object('state','missing_snapshot');END IF;
 n:=jsonb_array_length(snap->'items');
 IF n NOT BETWEEN 1 AND 25
  OR (SELECT count(*) FROM cotironda_piloto_privado.ai_shadow_rubros_mvp221
      WHERE request_id=v.id)<>n
  OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
   WHERE l.request_id=v.id AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    WHERE d.request_id=l.request_id AND d.line_no=l.line_no))
 THEN RETURN jsonb_build_object('state','incomplete_lines_or_routes');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
  WHERE l.request_id=v.id AND (length(l.original_description)>75 OR
   l.original_description ~* '(https?://|www[.]|@|whatsapp|tel[eé]fono|celular|cuit|cuil|correo|email|raz[oó]n social)'))
 THEN RETURN jsonb_build_object('state','possible_private_data');END IF;
 IF NOT cotironda_piloto_privado.proveedores_contactables_mvp306(v.id)
 THEN RETURN jsonb_build_object('state','supplier_contact_consent_missing');END IF;
 INSERT INTO cotironda_piloto_privado.ai_buyer_auto_release_mvp306
 (request_id,buyer_key,chat_hmac,source_hmac,snapshot_sha256)
 VALUES(v.id,v.buyer_key,v.chat_hmac,v.source_hmac,
  encode(sha256(convert_to(snap::text,'UTF8')),'hex'));
 RETURN jsonb_build_object('state','approved','request_id',v.id);
END $release$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_auto_release_mvp306(text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_auto_release_mvp306(text,text)
 TO service_role;

-- ORIGEN + SHA se revalidan en CADA una de las cuatro RPC de despacho
-- existentes, porque todas usan confirmada_comprador_mvp280.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.confirmada_comprador_mvp280(
 p_request uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $approved$
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
   AND cotironda_piloto_privado.fuente_revisable_mvp280(r.id)
   AND review.snapshot_sha256=encode(sha256(convert_to(
    cotironda_piloto_privado.ai_buyer_snapshot_mvp279(r.id)::text,
    'UTF8')),'hex')
   AND r.closes_at>clock_timestamp()
 ) OR EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306 auto
  JOIN cotironda_piloto_privado.requests r ON r.id=auto.request_id
  JOIN cotironda_piloto_privado.participants b
   ON b.key=r.buyer_key AND b.chat_hmac=auto.chat_hmac
  JOIN cotironda_piloto_privado.ai_auto_release_gate_mvp306 gate
   ON gate.only_row AND gate.enabled AND gate.activated_at IS NOT NULL
  WHERE r.id=p_request AND r.created_at>=gate.activated_at
   AND auto.source_hmac=r.source_hmac AND auto.buyer_key=r.buyer_key
   AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
   AND b.opted_out_at IS NULL AND r.closes_at>clock_timestamp()
   AND cotironda_piloto_privado.fuente_revisable_mvp280(r.id)
   AND cotironda_piloto_privado.proveedores_contactables_mvp306(r.id)
   AND auto.snapshot_sha256=encode(sha256(convert_to(
    cotironda_piloto_privado.ai_buyer_snapshot_mvp279(r.id)::text,
    'UTF8')),'hex')
 ),false);
$approved$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.confirmada_comprador_mvp280(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.confirmada_comprador_mvp280(uuid)
 TO service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_issue_auto_tracking_mvp306(
 p_chat_hmac text,p_event_hmac text,p_request uuid,p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $tracking$
DECLARE r record;n int;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_event_hmac IS NULL OR p_event_hmac !~ '^[a-f0-9]{64}$'
 OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 OR p_request IS NULL
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','transport_disabled');END IF;
 SELECT req.id,req.closes_at INTO r
 FROM cotironda_piloto_privado.requests req
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=req.buyer_key
 JOIN cotironda_piloto_privado.whapi_inbox msg
  ON msg.message_hmac=req.source_hmac AND msg.request_id=req.id
   AND msg.participant_key=buyer.key AND msg.chat_hmac=buyer.chat_hmac
 WHERE req.id=p_request AND req.source_hmac=p_event_hmac
  AND buyer.chat_hmac=p_chat_hmac AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND msg.processing_state='needs_review'
  AND req.state='prepared'
  AND req.closes_at+interval '30 days'>clock_timestamp()
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(req.id)
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306 a
    WHERE a.request_id=req.id AND a.source_hmac=msg.message_hmac)
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
    WHERE j.request_id=req.id)
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
    WHERE j.request_id=req.id
     AND (j.state<>'api_accepted' OR j.whapi_message_id IS NULL))
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
    WHERE t.request_id=req.id)
 FOR UPDATE OF req;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible_or_issued');END IF;
 INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091(
  request_id,token_hash,expires_at
 ) VALUES(r.id,p_token_hash,least(r.closes_at+interval '30 days',
    clock_timestamp()+interval '35 days')) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RETURN jsonb_build_object('state','already_issued');END IF;
 RETURN jsonb_build_object('state','issued','request_id',r.id);
END $tracking$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_issue_auto_tracking_mvp306(text,text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_issue_auto_tracking_mvp306(text,text,uuid,text)
 TO service_role;
