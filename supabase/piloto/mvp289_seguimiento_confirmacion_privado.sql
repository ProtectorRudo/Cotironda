-- MVP289: private, exactly-once buyer tracking after confirmed supplier dispatch.
-- NO pilot deployment without separate authorization. No resend or supplier writes.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_issue_confirmed_tracking_mvp289(
 p_chat_hmac text,p_event_hmac text,p_request uuid,p_token_hash text,
 p_mode text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $tracking$
DECLARE r record; v_written integer; v_expiry timestamptz;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_event_hmac IS NULL OR p_event_hmac !~ '^[a-f0-9]{64}$'
 OR p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 OR p_mode NOT IN ('confirmed','recovery')
 OR (p_mode='confirmed' AND p_request IS NULL)
 OR (p_mode='recovery' AND p_request IS NOT NULL)
 THEN RETURN jsonb_build_object('state','invalid'); END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_outbound_enabled)
 THEN RETURN jsonb_build_object('state','transport_disabled'); END IF;
 -- A live signed inbound must already be archived with this buyer's chat;
 -- confirmed mode binds to the exact prior confirmation, recovery to an
 -- explicit request from the same verified buyer. No plaintext in logs.
 IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.whapi_inbox i
   JOIN cotironda_piloto_privado.participants b ON b.key=i.participant_key
   WHERE i.message_hmac=p_event_hmac AND i.chat_hmac=p_chat_hmac
   AND b.participant_role='buyer' AND b.chat_hmac=p_chat_hmac
   AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
   AND i.kind='text' AND i.processing_state='needs_review'
   AND (p_mode='confirmed' OR i.plaintext_sha256=
      encode(sha256(convert_to('SEGUIMIENTO COTI','UTF8')),'hex'))
 ) THEN RETURN jsonb_build_object('state','not_authorized'); END IF;

 SELECT req.id,req.closes_at INTO r
 FROM cotironda_piloto_privado.requests req
 JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 review
  ON review.request_id=req.id
 JOIN cotironda_piloto_privado.participants b
  ON b.key=req.buyer_key AND b.chat_hmac=p_chat_hmac
 WHERE req.state='prepared' AND review.state='confirmed'
  AND review.buyer_key=req.buyer_key AND review.chat_hmac=p_chat_hmac
  AND req.closes_at+interval '30 days'>clock_timestamp()
  AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
  AND b.opted_out_at IS NULL
  AND ((p_mode='confirmed' AND req.id=p_request
    AND review.confirmed_reply_hmac=p_event_hmac)
   OR (p_mode='recovery'
    AND (SELECT count(*) FROM cotironda_piloto_privado.requests q
     JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 a ON a.request_id=q.id
     WHERE q.buyer_key=b.key AND q.state='prepared' AND a.state='confirmed'
      AND q.closes_at+interval '30 days'>clock_timestamp()
      AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
       WHERE t.request_id=q.id))=1
    AND req.id=(
      SELECT q.id FROM cotironda_piloto_privado.requests q
      JOIN cotironda_piloto_privado.ai_buyer_review_mvp279 a
       ON a.request_id=q.id
      WHERE q.buyer_key=b.key AND q.state='prepared'
       AND a.state='confirmed'
       AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
                      WHERE t.request_id=q.id)
      ORDER BY q.created_at DESC LIMIT 1
   )))
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
             WHERE d.request_id=req.id)
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
                 WHERE d.request_id=req.id AND
                    (d.state<>'api_accepted' OR d.whapi_message_id IS NULL))
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
                 WHERE t.request_id=req.id)
 FOR UPDATE OF req;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible_or_issued');END IF;
 v_expiry:=least(r.closes_at+interval '30 days',
                  clock_timestamp()+interval '35 days');
 INSERT INTO cotironda_piloto_privado.buyer_tracking_mvp091(
  request_id,token_hash,expires_at)
 VALUES(r.id,p_token_hash,v_expiry)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_written=ROW_COUNT;
 IF v_written<>1 THEN RETURN jsonb_build_object('state','already_issued');END IF;
 RETURN jsonb_build_object('state','issued','request_id',r.id);
END
$tracking$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_issue_confirmed_tracking_mvp289(text,text,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_issue_confirmed_tracking_mvp289(text,text,uuid,text,text)
 TO service_role;
