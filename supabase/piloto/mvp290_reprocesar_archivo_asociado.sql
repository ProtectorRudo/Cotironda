-- MVP290: private, source-hash based recovery after a supplier selects a round.
-- A later "COTI <code>" never requests another PDF or creates invitations.
-- Model #2 is staged on original receipt when available. Old archived
-- documents can be reread at most once under explicit document AI gate.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_secondary_mvp290(
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.media_archive_mvp095(message_hmac) ON DELETE RESTRICT,
 content_sha256 text NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
 proposal jsonb NOT NULL,
 stored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(jsonb_typeof(proposal)='object')
);
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_replay_mvp290(
 message_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.media_archive_mvp095(message_hmac) ON DELETE RESTRICT,
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 state text NOT NULL CHECK(state IN('reserved','published','review','uncertain')),
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 finished_at timestamptz,
 reason_code text,
 CHECK ((state='reserved')=(finished_at IS NULL))
);
ALTER TABLE cotironda_piloto_privado.ai_supplier_secondary_mvp290 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotironda_piloto_privado.ai_supplier_replay_mvp290 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_secondary_mvp290 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_replay_mvp290 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_stage_supplier_secondary_mvp290(
 p_message_hmac text,p_chat_hmac text,p_second jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_sha text;v_rows integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_second IS NULL OR jsonb_typeof(p_second)<>'object'
 OR p_second->>'kind'<>'supplier_quote'
 OR p_second->>'status'<>'review_required'
 OR jsonb_typeof(p_second->'lines')<>'array'
 OR jsonb_array_length(p_second->'lines') NOT BETWEEN 1 AND 25
 OR length(p_second::text)>28000
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT a.content_sha256 INTO v_sha
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=a.message_hmac AND m.chat_hmac=a.chat_hmac
  AND m.participant_key=a.participant_key
 JOIN cotironda_piloto_privado.participants s
  ON s.key=a.participant_key AND s.chat_hmac=a.chat_hmac
 WHERE a.message_hmac=p_message_hmac AND a.chat_hmac=p_chat_hmac
  AND a.state='stored' AND a.review_state='suggested_only'
  AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.storage_path='media/'||a.message_hmac
  AND a.proposal->>'kind'='supplier_quote'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND m.kind IN('document','image')
  AND m.processing_state='needs_review'
  AND s.participant_role='supplier' AND s.consent_at IS NOT NULL
  AND s.opted_out_at IS NULL
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_secondary_mvp290(
 message_hmac,content_sha256,proposal)
 VALUES(p_message_hmac,v_sha,p_second)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN v_rows=1 THEN 'staged' ELSE 'already_staged' END);
END $body$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_reserve_supplier_replay_mvp290(
 p_message_hmac text,p_chat_hmac text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE v_source record;v_rows integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT a.content_sha256,a.mime,a.size_bytes,a.proposal,second.proposal AS corroboration
 INTO v_source
 FROM cotironda_piloto_privado.media_archive_mvp095 a
 JOIN cotironda_piloto_privado.whapi_inbox m ON
  m.message_hmac=a.message_hmac AND m.chat_hmac=a.chat_hmac
  AND m.participant_key=a.participant_key AND m.request_id=a.request_id
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link ON
  link.message_hmac=a.message_hmac AND link.request_id=a.request_id
  AND link.supplier_key=a.participant_key
  AND link.source_sha256=a.content_sha256
  AND link.kind=a.kind AND link.association='clarified_supplier_reply'
 JOIN cotironda_piloto_privado.ai_supplier_unresolved_mvp237 unresolved ON
  unresolved.message_hmac=a.message_hmac
  AND unresolved.resolved_request_id=a.request_id
 JOIN cotironda_piloto_privado.ai_supplier_choice_prompts_mvp290 prompt ON
  prompt.source_hmac=a.message_hmac AND prompt.supplier_key=a.participant_key
  AND prompt.state IN('api_accepted','uncertain')
 JOIN cotironda_piloto_privado.participants seller ON
  seller.key=a.participant_key AND seller.chat_hmac=a.chat_hmac
 JOIN cotironda_piloto_privado.requests r ON r.id=a.request_id
 JOIN cotironda_piloto_privado.participants buyer ON buyer.key=r.buyer_key
 JOIN cotironda_piloto_privado.invitations invitation
  ON invitation.request_id=r.id AND invitation.supplier_key=a.participant_key
 LEFT JOIN cotironda_piloto_privado.ai_supplier_secondary_mvp290 second ON
  second.message_hmac=a.message_hmac AND second.content_sha256=a.content_sha256
 WHERE a.message_hmac=p_message_hmac AND a.chat_hmac=p_chat_hmac
  AND a.state='stored' AND a.review_state='suggested_only'
  AND a.request_id IS NOT NULL AND a.content_sha256 ~ '^[a-f0-9]{64}$'
  AND a.storage_path='media/'||a.message_hmac
  AND a.mime IN('application/pdf','image/jpeg','image/png','image/webp',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain','text/csv')
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.proposal->>'kind'='supplier_quote'
  AND a.proposal->>'status'='review_required'
  AND jsonb_typeof(a.proposal->'lines')='array'
  AND jsonb_array_length(a.proposal->'lines') BETWEEN 1 AND 25
  AND m.kind IN('document','image') AND m.processing_state='needs_review'
  AND seller.participant_role='supplier' AND seller.consent_at IS NOT NULL
  AND seller.opted_out_at IS NULL
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND invitation.state='prepared' AND r.state='prepared'
  AND r.closes_at>clock_timestamp()
  AND m.received_at<=r.closes_at
  AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
     WHERE q.message_hmac=a.message_hmac)
 FOR UPDATE OF a;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_eligible');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_replay_mvp290
   WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.ai_supplier_replay_mvp290 q
   WHERE q.reserved_at>clock_timestamp()-interval '24 hours')>=8
 THEN RETURN jsonb_build_object('state','quota');END IF;
 INSERT INTO cotironda_piloto_privado.ai_supplier_replay_mvp290(
  message_hmac,source_sha256,state)
 VALUES(p_message_hmac,v_source.content_sha256,'reserved')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 RETURN jsonb_build_object('state','reserved','sha256',v_source.content_sha256,
  'mime',v_source.mime,'size_bytes',v_source.size_bytes,
  'draft',v_source.proposal,'second',v_source.corroboration);
END $body$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_supplier_replay_mvp290(
 p_message_hmac text,p_state text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $body$
DECLARE n integer;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_state NOT IN('published','review','uncertain')
 OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,60}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 UPDATE cotironda_piloto_privado.ai_supplier_replay_mvp290
 SET state=p_state,reason_code=p_reason,finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac AND state='reserved';
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('state',CASE WHEN n=1 THEN 'recorded' ELSE 'not_reserved' END);
END $body$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_stage_supplier_secondary_mvp290(text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_supplier_replay_mvp290(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_supplier_replay_mvp290(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_stage_supplier_secondary_mvp290(text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_supplier_replay_mvp290(text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_supplier_replay_mvp290(text,text,text) TO service_role;
