-- MVP340: ledger durable para lotes IA de presupuestos vinculados.
-- SOLO DESARROLLO: no ejecutar sobre cotironda-piloto sin "Publicalo".
-- No contiene material comercial, texto cifrado, montos ni identidades públicas.
-- No modifica funciones antiguas, cron, WhatsApp o columnas existentes.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340(
 source_hmac text PRIMARY KEY REFERENCES cotironda_piloto_privado.media_archive_mvp095(message_hmac) ON DELETE RESTRICT,
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id) ON DELETE RESTRICT,
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key) ON DELETE RESTRICT,
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 source_sha256 text NOT NULL CHECK(source_sha256 ~ '^[a-f0-9]{64}$'),
 plan_sha256 text NOT NULL CHECK(plan_sha256 ~ '^[a-f0-9]{64}$'),
 receipt uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
 planned_rows int NOT NULL CHECK(planned_rows BETWEEN 1 AND 1200),
 planned_lots int NOT NULL CHECK(planned_lots BETWEEN 1 AND 60),
 max_model_calls int NOT NULL CHECK(max_model_calls BETWEEN 2 AND 120),
 max_input_chars int NOT NULL CHECK(max_input_chars BETWEEN 2 AND 900000),
 model_calls int NOT NULL DEFAULT 0 CHECK(model_calls BETWEEN 0 AND 120),
 agreed_rows int NOT NULL DEFAULT 0 CHECK(agreed_rows BETWEEN 0 AND 1200),
 state text NOT NULL DEFAULT 'leased'
  CHECK(state IN('leased','analysis_ready_private','review_required')),
 reason_code text CHECK(reason_code ~ '^[a-z_]{3,64}$'),
 reserved_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 finished_at timestamptz,
 FOREIGN KEY(request_id,supplier_key)
  REFERENCES cotironda_piloto_privado.invitations(request_id,supplier_key) ON DELETE RESTRICT,
 CHECK(planned_lots >= (planned_rows + 19)/20),
 CHECK(max_model_calls = planned_lots*2),
 CHECK(max_input_chars >= planned_rows*2),
 CHECK(model_calls <= max_model_calls),
 CHECK(agreed_rows <= planned_rows),
 CHECK((state='leased') = (finished_at IS NULL)),
 CHECK((state='leased') = (reason_code IS NULL)),
 CHECK(state <> 'analysis_ready_private' OR
  (agreed_rows=planned_rows AND model_calls=max_model_calls))
);
CREATE INDEX IF NOT EXISTS ai_supplier_lot_ledger_mvp340_quota_idx
 ON cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
 (supplier_key,reserved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ai_supplier_lot_ledger_mvp340_receipt_idx
 ON cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340(receipt);
ALTER TABLE cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
 FROM PUBLIC,anon,authenticated,service_role;

-- Solo interno. El navegador jamás puede reservar ni finalizar análisis.
-- La identidad HMAC/UUID y la invitación ya enviada se comprueban contra SQL.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_reserve_supplier_lots_mvp340(
 p_round_id uuid,p_supplier_key text,p_message_hmac text,
 p_chat_hmac text,p_source_sha256 text,p_plan_sha256 text,
 p_total_rows int,p_total_lots int,p_max_model_calls int,
 p_max_input_chars int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp340$
DECLARE v_scope record;v_locked integer;v_rows integer;v_daily bigint;v_receipt uuid;
BEGIN
 IF p_round_id IS NULL OR p_supplier_key IS NULL
 OR p_supplier_key !~ '^[a-z][a-z0-9_-]{2,90}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_plan_sha256 IS NULL OR p_plan_sha256 !~ '^[a-f0-9]{64}$'
 OR p_total_rows IS NULL OR p_total_rows NOT BETWEEN 1 AND 1200
 OR p_total_lots IS NULL OR p_total_lots NOT BETWEEN 1 AND 60
 OR p_total_lots < (p_total_rows+19)/20
 OR p_max_model_calls IS NULL OR p_max_model_calls<>p_total_lots*2
 OR p_max_input_chars IS NULL OR p_max_input_chars NOT BETWEEN 2 AND 900000
 OR p_max_input_chars<p_total_rows*2
 THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;

 -- Lock the real supplier row, serializing budget checks across requests.
 SELECT 1 INTO v_locked FROM cotironda_piloto_privado.participants supplier
 WHERE supplier.key=p_supplier_key AND supplier.participant_role='supplier'
  AND supplier.consent_at IS NOT NULL AND supplier.opted_out_at IS NULL
 FOR UPDATE;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;

 -- UNIQUE source_hmac means once leased, never charged again blindly.
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
  WHERE source_hmac=p_message_hmac)
 THEN RETURN pg_catalog.jsonb_build_object('state','already_processed');END IF;

 SELECT m.message_hmac,a.content_sha256,a.mime INTO v_scope
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
  AND a.participant_key=m.participant_key
 JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
  ON link.message_hmac=m.message_hmac
  AND link.request_id=m.request_id
  AND link.supplier_key=m.participant_key
  AND link.source_sha256=a.content_sha256
 JOIN cotironda_piloto_privado.requests r
  ON r.id=link.request_id
 JOIN cotironda_piloto_privado.invitations i
  ON i.request_id=r.id AND i.supplier_key=m.participant_key
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key
 WHERE m.message_hmac=p_message_hmac
  AND m.chat_hmac=p_chat_hmac AND m.participant_key=p_supplier_key
  AND m.kind='document' AND m.processing_state='needs_review'
  AND m.request_id=p_round_id
  AND a.request_id=p_round_id
  AND a.state='stored' AND a.review_state='suggested_only'
  AND a.content_sha256=p_source_sha256
  AND a.storage_path='media/'||m.message_hmac
  AND a.size_bytes BETWEEN 8 AND 8388608
  AND a.mime IN(
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'text/plain','text/csv')
  AND r.id=p_round_id AND r.state='prepared'
  AND r.created_at<=m.received_at AND r.closes_at>m.received_at
  AND r.closes_at>pg_catalog.clock_timestamp()
  AND i.state='prepared'
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_auto_correlation_mvp291 decision
   WHERE decision.source_hmac=m.message_hmac
    AND decision.source_sha256=a.content_sha256
    AND decision.supplier_key=m.participant_key
    AND decision.selected_request_id=r.id
    AND decision.state='linked')
  AND (
   EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
    WHERE d.request_id=r.id AND d.supplier_key=m.participant_key
     AND d.state='api_accepted' AND d.whapi_message_id IS NOT NULL
     AND d.finished_at IS NOT NULL AND d.finished_at<=m.received_at)
   OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.whapi_outbox o
    WHERE o.request_id=r.id AND o.supplier_key=m.participant_key
     AND o.state='api_accepted' AND o.whapi_message_id IS NOT NULL
     AND o.sent_at IS NOT NULL AND o.sent_at<=m.received_at)
  )
 FOR UPDATE OF m,a;
 IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;

 -- No guarantee of token price at SQL level; this reserves max request calls.
 -- A separate per-company billing cap remains necessary before live inference.
 SELECT pg_catalog.coalesce(pg_catalog.sum(max_model_calls),0)
 INTO v_daily
 FROM cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340
 WHERE supplier_key=p_supplier_key
  AND reserved_at>pg_catalog.clock_timestamp()-INTERVAL '24 hours';
 IF v_daily+p_max_model_calls>160
 THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible','reason','daily_call_budget');END IF;

 INSERT INTO cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340(
  source_hmac,request_id,supplier_key,chat_hmac,
  source_sha256,plan_sha256,planned_rows,planned_lots,max_model_calls,max_input_chars)
 VALUES(p_message_hmac,p_round_id,p_supplier_key,p_chat_hmac,
  p_source_sha256,p_plan_sha256,p_total_rows,p_total_lots,
  p_max_model_calls,p_max_input_chars)
 ON CONFLICT(source_hmac) DO NOTHING
 RETURNING receipt INTO v_receipt;
 GET DIAGNOSTICS v_rows=ROW_COUNT;
 IF v_rows<>1
 THEN RETURN pg_catalog.jsonb_build_object('state','already_processed');END IF;

 -- No identities, quotes or source text returned. Receipt is confidential.
 RETURN pg_catalog.jsonb_build_object(
  'state','reserved','receipt',pg_catalog.replace(v_receipt::text,'-',''),
  'roundId',p_round_id::text,'supplierKey',p_supplier_key,
  'messageHmac',p_message_hmac,'chatHmac',p_chat_hmac,
  'sourceSha256',p_source_sha256);
END $mvp340$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_finish_supplier_lots_mvp340(
 p_round_id uuid,p_supplier_key text,p_message_hmac text,
 p_chat_hmac text,p_source_sha256 text,p_plan_sha256 text,
 p_receipt text,p_state text,p_reason text,p_model_calls int,
 p_agreed_rows int,p_total_rows int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $mvp340$
DECLARE v_count integer;
BEGIN
 IF p_round_id IS NULL OR p_supplier_key IS NULL
 OR p_supplier_key !~ '^[a-z][a-z0-9_-]{2,90}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_source_sha256 IS NULL OR p_source_sha256 !~ '^[a-f0-9]{64}$'
 OR p_plan_sha256 IS NULL OR p_plan_sha256 !~ '^[a-f0-9]{64}$'
 OR p_receipt IS NULL OR p_receipt !~ '^[a-f0-9]{32}$'
 OR p_state NOT IN('analysis_ready_private','review_required')
 OR p_reason IS NULL OR p_reason !~ '^[a-z_]{3,64}$'
 OR p_model_calls IS NULL OR p_model_calls NOT BETWEEN 0 AND 120
 OR p_agreed_rows IS NULL OR p_agreed_rows NOT BETWEEN 0 AND 1200
 OR p_total_rows IS NULL OR p_total_rows NOT BETWEEN 1 AND 1200
 THEN RETURN pg_catalog.jsonb_build_object('state','not_eligible');END IF;

 UPDATE cotironda_piloto_privado.ai_supplier_lot_ledger_mvp340 ledger
 SET state=p_state,reason_code=p_reason,model_calls=p_model_calls,
  agreed_rows=p_agreed_rows,finished_at=pg_catalog.clock_timestamp()
 WHERE ledger.source_hmac=p_message_hmac
  AND ledger.request_id=p_round_id AND ledger.supplier_key=p_supplier_key
  AND ledger.chat_hmac=p_chat_hmac
  AND ledger.source_sha256=p_source_sha256 AND ledger.plan_sha256=p_plan_sha256
  AND pg_catalog.replace(ledger.receipt::text,'-','')=p_receipt
  AND ledger.state='leased'
  AND ledger.planned_rows=p_total_rows
  AND p_model_calls<=ledger.max_model_calls
  AND p_agreed_rows<=ledger.planned_rows
  AND (p_state='review_required' OR
   (p_model_calls=ledger.max_model_calls AND p_agreed_rows=ledger.planned_rows))
  AND EXISTS(SELECT 1
   FROM cotironda_piloto_privado.media_archive_mvp095 source
   JOIN cotironda_piloto_privado.whapi_inbox m
    ON m.message_hmac=source.message_hmac
   JOIN cotironda_piloto_privado.ai_supplier_links_mvp225 link
    ON link.message_hmac=source.message_hmac
   WHERE source.message_hmac=ledger.source_hmac
    AND source.chat_hmac=ledger.chat_hmac
    AND source.participant_key=ledger.supplier_key
    AND source.request_id=ledger.request_id
    AND source.content_sha256=ledger.source_sha256
    AND source.state='stored'
    AND m.chat_hmac=ledger.chat_hmac
    AND m.request_id=ledger.request_id
    AND link.request_id=ledger.request_id
    AND link.supplier_key=ledger.supplier_key
    AND link.source_sha256=ledger.source_sha256)
 RETURNING 1 INTO v_count;
 IF v_count IS NULL
 THEN RETURN pg_catalog.jsonb_build_object('state','not_leased');END IF;
 RETURN pg_catalog.jsonb_build_object('state','recorded');
END $mvp340$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_reserve_supplier_lots_mvp340(
 uuid,text,text,text,text,text,int,int,int,int)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_finish_supplier_lots_mvp340(
 uuid,text,text,text,text,text,text,text,text,int,int,int)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_reserve_supplier_lots_mvp340(
 uuid,text,text,text,text,text,int,int,int,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_finish_supplier_lots_mvp340(
 uuid,text,text,text,text,text,text,text,text,int,int,int) TO service_role;
