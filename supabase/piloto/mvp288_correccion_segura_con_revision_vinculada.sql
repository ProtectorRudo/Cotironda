-- MVP288: private buyer-request correction linkage. OFF until published.
-- Replaces only one buyer review explicitly referenced by its exact code.
-- Original requests and audit artifacts remain immutable; no supplier
-- messaging, no source rewrites, no requeue from SQL.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_review_replacements_mvp288(
 old_request_id uuid PRIMARY KEY REFERENCES
  cotironda_piloto_privado.ai_buyer_review_mvp279(request_id)
  ON DELETE RESTRICT,
 new_request_id uuid NOT NULL UNIQUE REFERENCES
  cotironda_piloto_privado.ai_buyer_review_mvp279(request_id)
  ON DELETE RESTRICT,
 buyer_key text NOT NULL REFERENCES
  cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(old_request_id<>new_request_id)
);
ALTER TABLE cotironda_piloto_privado.ai_review_replacements_mvp288
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.ai_review_replacements_mvp288
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_review_issue_mvp279(
 p_chat_hmac text,p_source_hmac text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $issue$
DECLARE r record;snapshot jsonb;items jsonb;code text;digest text;
 counter int;sup_count int;total int;issued_at timestamptz;
 v_correction text[];v_old_request uuid;
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
  request.original_request,request.created_at,buyer.chat_hmac INTO r
 FROM cotironda_piloto_privado.requests request
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=request.buyer_key AND buyer.chat_hmac=p_chat_hmac
 WHERE request.source_hmac=p_source_hmac AND request.state='draft'
  AND request.closes_at>clock_timestamp()+interval '1 hour'
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND cotironda_piloto_privado.fuente_revisable_mvp280(request.id)
 FOR UPDATE OF request;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279
   WHERE request_id=r.id)
 THEN RETURN jsonb_build_object('state','already_issued');END IF;
 snapshot:=cotironda_piloto_privado.ai_buyer_snapshot_mvp279(r.id);
 items:=snapshot->'items';
 IF snapshot IS NULL OR jsonb_typeof(items)<>'array'
 OR jsonb_array_length(items) NOT BETWEEN 1 AND 25
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
 -- An explicit full corrected WhatsApp request may supersede exactly
 -- one prior review, but never an unrelated quote or a sent request.
 -- Its reference code is inside the newly authenticated immutable source.
 IF r.original_request ~* '^CORREGIR COTI' THEN
  v_correction:=regexp_match(btrim(r.original_request),
   '^CORREGIR COTI ([a-f0-9]{16}):[[:space:]]*','i');
  IF v_correction IS NULL THEN
   RETURN jsonb_build_object('state','correction_command_invalid');END IF;
  SELECT old_review.request_id INTO v_old_request
  FROM cotironda_piloto_privado.ai_buyer_review_mvp279 old_review
  JOIN cotironda_piloto_privado.requests older
   ON older.id=old_review.request_id
  WHERE old_review.code_sha256=encode(sha256(convert_to(
       upper(v_correction[1]),'UTF8')),'hex')
   AND old_review.buyer_key=r.buyer_key
   AND old_review.chat_hmac=r.chat_hmac
   AND old_review.state='api_accepted'
   AND old_review.expires_at>clock_timestamp()
   AND older.state='draft'
   AND older.created_at<r.created_at
   AND NOT EXISTS(SELECT 1 FROM
     cotironda_piloto_privado.ai_review_replacements_mvp288 prior
     WHERE prior.old_request_id=older.id)
   AND NOT EXISTS(SELECT 1 FROM
     cotironda_piloto_privado.ai_dispatch_jobs_mvp222 job
     WHERE job.request_id=older.id)
  FOR UPDATE OF old_review;
  IF v_old_request IS NULL THEN
   RETURN jsonb_build_object('state','correction_target_not_active');END IF;
 END IF;
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
 IF v_old_request IS NOT NULL THEN
  -- Both writes commit atomically with the NEW signed review. The former
  -- CONFIRMAR COTI code becomes invalid due to its expired snapshot.
  INSERT INTO cotironda_piloto_privado.ai_review_replacements_mvp288(
   old_request_id,new_request_id,buyer_key)
  VALUES(v_old_request,r.id,r.buyer_key);
  UPDATE cotironda_piloto_privado.ai_buyer_review_mvp279
  SET expires_at=issued_at
  WHERE request_id=v_old_request AND state='api_accepted'
   AND expires_at>issued_at;
  IF NOT FOUND THEN
   RAISE EXCEPTION 'mvp288_old_review_race_requires_rollback';END IF;
 END IF;
 RETURN jsonb_build_object('state','issued',
  'request_id',r.id,'code',code,
  'city',snapshot->'city','note',snapshot->'note',
  'items',items,'items_count',jsonb_array_length(items),
  'deadline',snapshot->'deadline');
END
$issue$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_review_issue_mvp279(text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_review_issue_mvp279(text,text)
 TO service_role;
