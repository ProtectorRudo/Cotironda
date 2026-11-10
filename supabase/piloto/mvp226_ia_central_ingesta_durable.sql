-- MVP226: UN SOLO DUEÑO del mensaje entrante WhatsApp.
-- Control OFF por defecto en SQL + segundo flag OFF en Edge.
-- Requiere MVP220, MVP221, MVP222, MVP223, MVP224 y MVP225.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_central_control_mvp226(
 only_row boolean PRIMARY KEY DEFAULT true CHECK(only_row),
 enabled boolean NOT NULL DEFAULT false,
 activated_at timestamptz,
 CHECK((enabled=false AND activated_at IS NULL)
   OR (enabled=true AND activated_at IS NOT NULL))
);
INSERT INTO cotironda_piloto_privado.ai_central_control_mvp226(
 only_row,enabled) VALUES(true,false) ON CONFLICT(only_row) DO NOTHING;
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_central_attempts_mvp226(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac)
  ON DELETE RESTRICT,
 buyer_key text NOT NULL
  REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'reserved'
  CHECK(state IN('reserved','staged','prepared','needs_zone','review','failed')),
 failure_code text CHECK(failure_code IS NULL OR
  failure_code ~ '^[a-z_]{3,64}$'),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK ((state='reserved' AND finished_at IS NULL) OR
        (state<>'reserved' AND finished_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ai_central_attempts_mvp226_buyer_window
 ON cotironda_piloto_privado.ai_central_attempts_mvp226(buyer_key,created_at DESC);
ALTER TABLE cotironda_piloto_privado.ai_central_control_mvp226 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.ai_central_attempts_mvp226 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
 cotironda_piloto_privado.ai_central_control_mvp226,
 cotironda_piloto_privado.ai_central_attempts_mvp226
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_buyer_mvp226(
 p_chat_hmac text,p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_buyer text;v_count integer;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL)
 OR NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled)
 THEN RETURN jsonb_build_object('state','disabled');END IF;

 SELECT p.key INTO v_buyer FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
 WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='buyer'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
   AND m.plaintext_sha256=p_source_sha256
   AND m.kind='text' AND m.processing_state='needs_review'
   AND m.request_id IS NULL
   AND m.received_at>clock_timestamp()-interval '10 minutes'
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 SELECT count(*) INTO v_count
 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
 WHERE a.buyer_key=v_buyer AND a.created_at>clock_timestamp()-interval '24 hours';
 -- Each request may trigger 4 AI calls; hard rate limit to contain costs.
 IF v_count>=6 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_central_attempts_mvp226(
  message_hmac,buyer_key,chat_hmac,source_sha256)
 VALUES(p_message_hmac,v_buyer,p_chat_hmac,p_source_sha256)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'reserved' ELSE 'already_reserved' END);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_lookup_round_mvp226(
 p_chat_hmac text,p_message_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_id uuid;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT r.id INTO v_id
 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 a
 JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=a.message_hmac AND m.chat_hmac=a.chat_hmac
 JOIN cotironda_piloto_privado.requests r
   ON r.id=m.request_id AND r.source_hmac=m.message_hmac
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh
   ON sh.request_id=r.id AND sh.source_hmac=m.message_hmac
 JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.key=a.buyer_key
 WHERE a.message_hmac=p_message_hmac AND a.chat_hmac=p_chat_hmac
   AND a.state IN('reserved','staged','prepared')
   AND buyer.chat_hmac=p_chat_hmac AND buyer.consent_at IS NOT NULL
   AND buyer.opted_out_at IS NULL AND buyer.participant_role='buyer'
   AND r.state IN('draft','prepared') AND r.closes_at>clock_timestamp();
 IF v_id IS NULL THEN RETURN jsonb_build_object('state','not_found');END IF;
 RETURN jsonb_build_object('state','linked','request_id',v_id);
END
$fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_buyer_mvp226(
 p_chat_hmac text,p_message_hmac text,p_state text,p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE v_id uuid;v_rows integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('staged','prepared','needs_zone','review','failed')
 OR (p_reason IS NOT NULL AND p_reason !~ '^[a-z_]{3,64}$')
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT r.id INTO v_id
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 a
  ON a.request_id=r.id
 WHERE r.source_hmac=p_message_hmac
   AND r.buyer_key=(SELECT key FROM cotironda_piloto_privado.participants
      WHERE chat_hmac=p_chat_hmac AND participant_role='buyer'
      AND consent_at IS NOT NULL AND opted_out_at IS NULL);
 IF p_state IN('staged','prepared') AND v_id IS NULL
 THEN RETURN jsonb_build_object('state','missing_round');END IF;
 IF p_state='prepared' AND NOT EXISTS(SELECT 1 FROM
   cotironda_piloto_privado.requests r WHERE r.id=v_id AND r.state='prepared')
 THEN RETURN jsonb_build_object('state','not_published');END IF;
 IF p_state IN('failed','review','needs_zone') AND v_id IS NOT NULL
 THEN RETURN jsonb_build_object('state','cannot_discard_staged_round');END IF;
 UPDATE cotironda_piloto_privado.ai_central_attempts_mvp226
 SET state=p_state,failure_code=p_reason,finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac AND chat_hmac=p_chat_hmac
  AND state='reserved';
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_rows=1 THEN 'finished' ELSE 'already_finalized' END);
END
$fn$;

-- Cuando el proveedor participa simultáneamente en el sistema antiguo
-- y el nuevo, la atribución automática de una cotización sin cita
-- resulta peligrosa. El webhook fuerza el camino de asociación estricto.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_is_supplier_mvp226(
 p_chat_hmac text
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
 SELECT jsonb_build_object('state',
  CASE WHEN EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 g
    WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL)
   AND EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participants p
   JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j ON j.supplier_key=p.key
   JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
   WHERE p.chat_hmac=p_chat_hmac AND p.participant_role='supplier'
     AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
     AND r.state='prepared' AND r.closes_at>clock_timestamp()
     AND j.state IN('pending','leased','api_accepted')
  ) THEN 'central_supplier' ELSE 'not_central_supplier' END);
$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_lookup_round_mvp226(text,text),
 public.cotironda_piloto_ia_finish_buyer_mvp226(text,text,text,text),
 public.cotironda_piloto_ia_is_supplier_mvp226(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_lookup_round_mvp226(text,text),
 public.cotironda_piloto_ia_finish_buyer_mvp226(text,text,text,text),
 public.cotironda_piloto_ia_is_supplier_mvp226(text)
 TO service_role;
