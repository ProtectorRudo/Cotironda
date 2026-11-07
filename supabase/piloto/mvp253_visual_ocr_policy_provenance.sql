-- MVP253: SQL-only OCR authorization, quota and immutable-source provenance.
-- PILOTO schema, but NOT deployed by this PR. No remote OCR or publication.
-- Every row stays PRIVATE; only service_role may execute the two RPCs.
DO $gate$
BEGIN
 IF to_regclass('cotironda_piloto_privado.participants') IS NULL
 OR to_regclass('cotironda_piloto_privado.media_archive_mvp095') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_media_quotes_mvp098') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_reading_checks_mvp102') IS NULL
 OR to_regclass('cotironda_piloto_privado.supplier_amount_checks_mvp103') IS NULL
 THEN RAISE EXCEPTION 'mvp253_wrong_database' USING errcode='42501';
 END IF;
END $gate$;

-- Operational setting: disabled, ZERO pages and ZERO spend by default.
-- Managed only by authorized database operator (never buyer/provider).
CREATE TABLE cotironda_piloto_privado.visual_ocr_control_mvp253(
 only_row boolean PRIMARY KEY DEFAULT true CHECK (only_row),
 enabled boolean NOT NULL DEFAULT false,
 monthly_page_limit integer NOT NULL DEFAULT 0
  CHECK(monthly_page_limit BETWEEN 0 AND 50000),
 supplier_monthly_page_limit integer NOT NULL DEFAULT 0
  CHECK(supplier_monthly_page_limit BETWEEN 0 AND 10000),
 monthly_cost_micro_usd_limit bigint NOT NULL DEFAULT 0
  CHECK(monthly_cost_micro_usd_limit BETWEEN 0 AND 1000000000),
 reserved_cost_micro_usd_per_page integer NOT NULL DEFAULT 1500
  CHECK(reserved_cost_micro_usd_per_page BETWEEN 1500 AND 100000),
 updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO cotironda_piloto_privado.visual_ocr_control_mvp253(only_row)
 VALUES(true);
ALTER TABLE cotironda_piloto_privado.visual_ocr_control_mvp253
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.visual_ocr_control_mvp253
 FROM public,anon,authenticated,service_role;

-- Consent EXPLICITLY to send a participant's data to external Vision OCR.
-- General Cotironda/WhatsApp consent is never sufficient.
-- Grant manually after evidence of an actual, scoped external-processing opt-in.
CREATE TABLE cotironda_piloto_privado.visual_ocr_consent_mvp253(
 participant_key text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.participants(key),
 provider text NOT NULL DEFAULT 'google_cloud_vision'
  CHECK(provider='google_cloud_vision'),
 proof_sha256 text NOT NULL CHECK(proof_sha256 ~ '^[a-f0-9]{64}$'),
 granted_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 CHECK (expires_at>granted_at),
 CHECK (revoked_at IS NULL OR revoked_at>=granted_at)
);
ALTER TABLE cotironda_piloto_privado.visual_ocr_consent_mvp253
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.visual_ocr_consent_mvp253
 FROM public,anon,authenticated,service_role;

-- One immutable reservation per ORIGINAL WhatsApp HMAC/SHA.
-- Reserve the WORST-CASE page count for PDFs (5); a call can never be retried
-- automatically, even when Google timed out and may have billed.
CREATE TABLE cotironda_piloto_privado.visual_ocr_attempt_mvp253(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.supplier_media_quotes_mvp098(message_hmac),
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 mime text NOT NULL CHECK(mime IN(
  'application/pdf','image/jpeg','image/png','image/webp')),
 provider text NOT NULL DEFAULT 'google_cloud_vision'
  CHECK(provider='google_cloud_vision'),
 reservation_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reserved_pages smallint NOT NULL CHECK(reserved_pages BETWEEN 1 AND 5),
 reserved_cost_micro_usd bigint NOT NULL CHECK(reserved_cost_micro_usd>=1500),
 state text NOT NULL DEFAULT 'reserved'
  CHECK(state IN('reserved','covered_private','needs_review')),
 finished_at timestamptz,
 reason text CHECK(reason ~ '^[a-z][a-z0-9_]{2,63}$'),
 pages_seen smallint CHECK(pages_seen BETWEEN 0 AND 5),
 min_confidence_milli smallint CHECK(min_confidence_milli BETWEEN 0 AND 1000),
 ocr_text_sha256 text CHECK(ocr_text_sha256 ~ '^[a-f0-9]{64}$'),
 CHECK((state='reserved')=(finished_at IS NULL)),
 CHECK(state <> 'covered_private' OR (
  pages_seen IS NOT NULL AND pages_seen>=1 AND
  min_confidence_milli>=900 AND ocr_text_sha256 IS NOT NULL AND
  reason='ocr_text_lines_covered'
 )),
 CHECK(pages_seen IS NULL OR pages_seen<=reserved_pages)
);
ALTER TABLE cotironda_piloto_privado.visual_ocr_attempt_mvp253
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.visual_ocr_attempt_mvp253
 FROM public,anon,authenticated,service_role;
CREATE INDEX visual_ocr_attempt_month_mvp253
 ON cotironda_piloto_privado.visual_ocr_attempt_mvp253(reserved_at,supplier_key);

-- This function is the mandatory third gate after the two disabled-by-default
-- environment flags. No customer-facing function can grant authorization.
CREATE FUNCTION public.cotironda_piloto_visual_ocr_permission_mvp252(
 p_message_hmac text,p_source_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 policy_ record;
 target_ record;
 prior_ record;
 cost_ bigint;
 units_ integer;
 used_pages_ bigint;
 used_cost_ bigint;
 supplier_pages_ bigint;
 month_start_ timestamptz;
 token_ uuid;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- Serialize all quota reservations and avoid races across suppliers.
 SELECT * INTO policy_
 FROM cotironda_piloto_privado.visual_ocr_control_mvp253
 WHERE only_row=true FOR UPDATE;
 IF NOT FOUND OR policy_.enabled IS DISTINCT FROM true
 THEN RETURN jsonb_build_object('state','disabled');END IF;
 IF policy_.monthly_page_limit=0 OR policy_.supplier_monthly_page_limit=0
 OR policy_.monthly_cost_micro_usd_limit=0
 THEN RETURN jsonb_build_object('state','quota_disabled');END IF;

 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
  WHERE message_hmac=p_message_hmac)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;

 SELECT q.request_id,q.supplier_key,r.buyer_key,m.mime,m.content_sha256
 INTO target_
 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 JOIN cotironda_piloto_privado.media_archive_mvp095 m
  ON m.message_hmac=q.message_hmac
   AND m.request_id=q.request_id AND m.participant_key=q.supplier_key
   AND m.content_sha256=q.source_sha256
 JOIN cotironda_piloto_privado.requests r
  ON r.id=q.request_id AND r.state='prepared'
  AND r.closes_at>clock_timestamp()
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=q.request_id AND inv.supplier_key=q.supplier_key
  AND inv.state='prepared'
 JOIN cotironda_piloto_privado.participants supplier
  ON supplier.key=q.supplier_key AND supplier.chat_hmac=m.chat_hmac
  AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.supplier_reading_checks_mvp102 dual
  ON dual.message_hmac=q.message_hmac
  AND dual.source_sha256=q.source_sha256
  AND dual.state='model_readings_match'
 JOIN cotironda_piloto_privado.supplier_amount_checks_mvp103 amounts
  ON amounts.message_hmac=q.message_hmac
  AND amounts.source_sha256=q.source_sha256
  AND amounts.state='balanced'
 WHERE q.message_hmac=p_message_hmac
 AND q.state='awaiting_fidelity_check'
 AND q.source_sha256=p_source_sha256
 AND q.line_count BETWEEN 1 AND 25
 AND m.state='stored' AND m.review_state='suggested_only'
 AND m.size_bytes BETWEEN 12 AND 3145728
 AND m.mime IN('application/pdf','image/jpeg','image/png','image/webp')
 AND m.proposal->>'kind'='supplier_quote'
 AND m.proposal->'unanswered'='[]'::jsonb
 AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=supplier.key
  AND c.provider='google_cloud_vision'
  AND c.granted_at<=clock_timestamp()
  AND c.expires_at>clock_timestamp()
  AND c.revoked_at IS NULL
 )
 AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=buyer.key
  AND c.provider='google_cloud_vision'
  AND c.granted_at<=clock_timestamp()
  AND c.expires_at>clock_timestamp()
  AND c.revoked_at IS NULL
 );
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;

 units_:=CASE WHEN target_.mime='application/pdf' THEN 5 ELSE 1 END;
 cost_:=units_::bigint*policy_.reserved_cost_micro_usd_per_page;
 month_start_:=date_trunc('month',clock_timestamp(),'UTC');
 SELECT COALESCE(SUM(reserved_pages),0),
        COALESCE(SUM(reserved_cost_micro_usd),0)
 INTO used_pages_,used_cost_
 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
 WHERE reserved_at>=month_start_ AND
  reserved_at<month_start_+interval '1 month';
 SELECT COALESCE(SUM(reserved_pages),0) INTO supplier_pages_
 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
 WHERE reserved_at>=month_start_
 AND reserved_at<month_start_+interval '1 month'
 AND supplier_key=target_.supplier_key;
 IF used_pages_+units_>policy_.monthly_page_limit
 OR supplier_pages_+units_>policy_.supplier_monthly_page_limit
 OR used_cost_+cost_>policy_.monthly_cost_micro_usd_limit
 THEN RETURN jsonb_build_object('state','quota_exceeded');END IF;

 INSERT INTO cotironda_piloto_privado.visual_ocr_attempt_mvp253(
  message_hmac,request_id,supplier_key,buyer_key,
  source_sha256,mime,reserved_pages,reserved_cost_micro_usd)
 VALUES(p_message_hmac,target_.request_id,target_.supplier_key,
  target_.buyer_key,p_source_sha256,target_.mime,units_,cost_)
 RETURNING reservation_token INTO token_;
 RETURN jsonb_build_object(
  'state','approved_for_private_processing',
  'source_sha256',p_source_sha256,
  'reservation_token',token_,
  'reserved_pages',units_);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_visual_ocr_permission_mvp252(text,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_visual_ocr_permission_mvp252(text,text)
 TO service_role;

-- Durable result, no raw OCR text, prices, file URLs, keys or personal data.
-- Never modifies the MVP106 / MVP107 publication gates.
CREATE FUNCTION public.cotironda_piloto_visual_ocr_finish_mvp253(
 p_message_hmac text,p_source_sha256 text,p_reservation_token uuid,
 p_state text,p_reason text,p_pages integer,
 p_min_confidence_milli integer,p_ocr_text_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE
 attempt_ record;
 permitted_ boolean;
 final_state_ text;
 final_reason_ text;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_reservation_token IS NULL
 OR p_state NOT IN('covered_private','needs_review')
 OR p_reason IS NULL OR p_reason !~ '^[a-z][a-z0-9_]{2,63}$'
 OR p_pages IS NULL OR p_pages NOT BETWEEN 0 AND 5
 OR (p_min_confidence_milli IS NOT NULL AND
     p_min_confidence_milli NOT BETWEEN 0 AND 1000)
 OR (p_ocr_text_sha256 IS NOT NULL AND
     p_ocr_text_sha256 !~ '^[a-f0-9]{64}$')
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 SELECT * INTO attempt_
 FROM cotironda_piloto_privado.visual_ocr_attempt_mvp253
 WHERE message_hmac=p_message_hmac FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF attempt_.source_sha256<>p_source_sha256
 OR attempt_.reservation_token<>p_reservation_token
 OR p_pages>attempt_.reserved_pages
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF attempt_.state<>'reserved'
 THEN RETURN jsonb_build_object('state','already_finalized');END IF;
 IF p_state='covered_private' AND (
  p_pages<1 OR p_reason<>'ocr_text_lines_covered'
  OR p_ocr_text_sha256 IS NULL OR
  p_min_confidence_milli IS NULL OR
  p_min_confidence_milli<900)
 THEN RETURN jsonb_build_object('state','invalid');END IF;

 -- A revocation between booking and receipt never creates a covered status.
 SELECT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=attempt_.supplier_key
   AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
 ) AND EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.visual_ocr_consent_mvp253 c
  WHERE c.participant_key=attempt_.buyer_key
   AND c.revoked_at IS NULL AND c.expires_at>clock_timestamp()
 ) INTO permitted_;
 final_state_:=CASE WHEN permitted_ THEN p_state ELSE 'needs_review' END;
 final_reason_:=CASE WHEN permitted_ THEN p_reason ELSE 'consent_revoked' END;
 UPDATE cotironda_piloto_privado.visual_ocr_attempt_mvp253
 SET state=final_state_,reason=final_reason_,pages_seen=p_pages,
  min_confidence_milli=CASE WHEN final_state_='covered_private'
   THEN p_min_confidence_milli ELSE NULL END,
  ocr_text_sha256=CASE WHEN final_state_='covered_private'
   THEN p_ocr_text_sha256 ELSE NULL END,
  finished_at=clock_timestamp()
 WHERE message_hmac=p_message_hmac;
 RETURN jsonb_build_object('state','saved_private',
  'result',final_state_,'publication_allowed',false);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_visual_ocr_finish_mvp253(
 text,text,uuid,text,text,integer,integer,text)
 FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_visual_ocr_finish_mvp253(
 text,text,uuid,text,text,integer,integer,text)
 TO service_role;
