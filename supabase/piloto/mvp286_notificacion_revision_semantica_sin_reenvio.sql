-- MVP286: resultado seguro a comprador cuando IA Central no logra validar.
-- No despacha solicitudes, no repite IA, no envía WhatsApps por SQL.
-- La reserva es de un solo uso por mensaje original y exige identidad real.
CREATE TABLE cotironda_piloto_privado.ai_buyer_review_notice_mvp286(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac)
  ON DELETE RESTRICT,
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN ('leased','api_accepted','uncertain')),
 whapi_message_id text CHECK(whapi_message_id IS NULL OR
   (length(whapi_message_id) BETWEEN 8 AND 160
    AND whapi_message_id ~ '^[A-Za-z0-9._:-]+$')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 CHECK (
  (state='leased' AND finished_at IS NULL AND whapi_message_id IS NULL)
  OR (state='uncertain' AND finished_at IS NOT NULL
      AND whapi_message_id IS NULL)
  OR (state='api_accepted' AND finished_at IS NOT NULL
      AND whapi_message_id IS NOT NULL)
 )
);
CREATE INDEX ai_buyer_review_notice_mvp286_chat_recent
 ON cotironda_piloto_privado.ai_buyer_review_notice_mvp286
 (chat_hmac,created_at DESC);
ALTER TABLE cotironda_piloto_privado.ai_buyer_review_notice_mvp286 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_buyer_review_notice_mvp286
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_reserve_review_notice_mvp286(
 p_chat_hmac text,p_message_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.integration_flags
   WHERE only_row AND whatsapp_inbound_enabled AND whatsapp_outbound_enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
   WHERE only_row AND enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222
   WHERE only_row AND enabled)
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_trial_control_mvp229
   WHERE only_row AND enabled AND
    (expires_at IS NULL OR expires_at>clock_timestamp()))
 OR NOT EXISTS (SELECT 1 FROM cotironda_piloto_privado.ai_review_launch_mvp285
   WHERE only_row AND enabled)
 THEN RETURN jsonb_build_object('state','inactive');END IF;
 -- Only the buyer's signed, immutable, recently archived original.
 PERFORM 1 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.whapi_inbox m ON
   m.participant_key=p.key AND m.chat_hmac=p.chat_hmac
 JOIN cotironda_piloto_privado.ai_central_attempts_mvp226 a ON
   a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
 WHERE p.key='arquitecto' AND p.participant_role='buyer'
  AND p.chat_hmac=p_chat_hmac AND p.consent_at IS NOT NULL
  AND p.opted_out_at IS NULL
  AND m.message_hmac=p_message_hmac AND m.kind='text'
  AND m.processing_state='needs_review' AND m.request_id IS NULL
  AND m.received_at>clock_timestamp()-interval '10 minutes'
  AND a.state='review' AND a.finished_at IS NOT NULL
  AND a.source_sha256=m.plaintext_sha256
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 -- Maximum two review notices per buyer per day and no duplicate per source.
 SELECT count(*) INTO n
 FROM cotironda_piloto_privado.ai_buyer_review_notice_mvp286
 WHERE chat_hmac=p_chat_hmac
   AND created_at>=clock_timestamp()-interval '24 hours';
 IF n>=2 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_buyer_review_notice_mvp286(
  message_hmac,chat_hmac)
 VALUES(p_message_hmac,p_chat_hmac) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN n=1 THEN 'leased' ELSE 'already_reserved' END);
END $fn$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_review_notice_mvp286(
 p_chat_hmac text,p_message_hmac text,p_state text,
 p_whapi_message_id text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE n integer;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('api_accepted','uncertain')
 OR (p_state='api_accepted' AND (p_whapi_message_id IS NULL OR
    length(p_whapi_message_id) NOT BETWEEN 8 AND 160 OR
    p_whapi_message_id !~ '^[A-Za-z0-9._:-]+$'))
 OR (p_state='uncertain' AND p_whapi_message_id IS NOT NULL)
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.ai_buyer_review_notice_mvp286
 SET state=p_state,whapi_message_id=p_whapi_message_id,
     finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac AND chat_hmac=p_chat_hmac
  AND state='leased';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END $fn$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_review_notice_mvp286(text,text),
 public.cotironda_piloto_ia_finish_review_notice_mvp286(text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_review_notice_mvp286(text,text),
 public.cotironda_piloto_ia_finish_review_notice_mvp286(text,text,text,text)
 TO service_role;
