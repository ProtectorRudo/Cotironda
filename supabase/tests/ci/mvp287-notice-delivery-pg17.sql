-- MVP287: A delivery status is NOT implied by API acceptance.
-- Must originate from Whapi's authenticated statuses webhook for exactly
-- one buyer notice and the correct recipient chat HMAC.
DO $test$
DECLARE r jsonb; stamp bigint:=extract(epoch from clock_timestamp())::bigint;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_notice_mvp286
  WHERE whapi_message_id='whapi-mvp286-review-1' AND state='api_accepted')
 THEN RAISE EXCEPTION 'mvp287_fixture_notice_missing';END IF;
 r:=public.cotironda_piloto_record_delivery_mvp119(
  'whapi-mvp286-review-1','delivered',3,repeat('2',64),stamp);
 IF r->>'state'<>'unmatched'
 THEN RAISE EXCEPTION 'mvp287_wrong_recipient_accepted: %',r;END IF;
 r:=public.cotironda_piloto_record_delivery_mvp119(
  'whapi-mvp286-review-1','delivered',3,repeat('a',64),stamp);
 IF r->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp287_valid_notice_status_not_recorded: %',r;END IF;
 r:=public.cotironda_piloto_record_delivery_mvp119(
  'whapi-mvp286-review-1','read',4,repeat('a',64),stamp);
 IF r->>'state'<>'advanced'
 THEN RAISE EXCEPTION 'mvp287_read_status_not_advanced: %',r;END IF;
 r:=public.cotironda_piloto_record_delivery_mvp119(
  'whapi-mvp286-review-1','pending',1,repeat('a',64),stamp);
 IF r->>'state'<>'unchanged'
 THEN RAISE EXCEPTION 'mvp287_rolled_back_delivery_state: %',r;END IF;
 r:=public.cotironda_piloto_record_delivery_mvp119(
  'whapi-mvp286-review-2','sent',2,repeat('a',64),stamp);
 IF r->>'state'<>'unmatched'
 THEN RAISE EXCEPTION 'mvp287_uncertain_without_id_recorded: %',r;END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.delivery_receipts_mvp119
   WHERE source_kind='buyer_review_notice' AND state='read')<>1
 THEN RAISE EXCEPTION 'mvp287_delivery_evidence_inconsistent';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.delivery_receipts_mvp119
   WHERE source_kind='buyer_review_notice' AND request_id IS NOT NULL)
 THEN RAISE EXCEPTION 'mvp287_notice_incorrectly_linked_to_round';END IF;
 RAISE NOTICE 'MVP287 PASS: buyer notice delivered/read requires real matching status webhook, no duplicate or stale rank';
END $test$;
