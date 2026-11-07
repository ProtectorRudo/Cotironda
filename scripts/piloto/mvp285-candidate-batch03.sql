-- MVP285 CANDIDATE 3/3, SOLO ENSAYO TRANSACCIONAL. NO EJECUTAR SIN ROLLBACK.
-- INICIO mvp266_openai_unknown_persistent_review.sql
-- MVP266: unresolved OpenAI usage cannot expire unnoticed at 24h.
-- Development-only SQL overlay. No cron, deployment, WhatsApp or paid APIs.
DO $gate$ BEGIN
 IF to_regclass('cotironda_piloto_privado.ai_usage_calls_mvp264') IS NULL
 OR to_regclass('cotironda_piloto_privado.supervisor_operators_mvp265') IS NULL
 THEN RAISE EXCEPTION 'mvp266_prerequisites_missing' USING errcode='42501';END IF;
END $gate$;

CREATE TABLE cotironda_piloto_privado.ai_usage_reviews_mvp266(
 message_hmac text NOT NULL,
 call_no smallint NOT NULL CHECK(call_no BETWEEN 1 AND 8),
 operator_ref uuid NOT NULL REFERENCES
  cotironda_piloto_privado.supervisor_operators_mvp265(operator_ref),
 review_basis text NOT NULL CHECK(review_basis IN(
  'provider_usage_reviewed','provider_billing_reviewed',
  'financial_exposure_accepted')),
 evidence_sha256 text NOT NULL CHECK(evidence_sha256~'^[a-f0-9]{64}$'),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(message_hmac,call_no),
 FOREIGN KEY(message_hmac,call_no) REFERENCES
  cotironda_piloto_privado.ai_usage_calls_mvp264(message_hmac,call_no)
  ON DELETE RESTRICT
);
CREATE INDEX ai_usage_reviews_mvp266_operator_24h ON
 cotironda_piloto_privado.ai_usage_reviews_mvp266(operator_ref,reviewed_at DESC);
ALTER TABLE cotironda_piloto_privado.ai_usage_reviews_mvp266
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.ai_usage_reviews_mvp266
 FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the MVP264 HMAC/consent checks and participant lock.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ai_usage_reserve_mvp264(
 p_message_hmac text,p_chat_hmac text,p_call_no integer,p_model text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE v_person text;v_role text;n_ bigint;used_ bigint;unknown_ bigint;written_ int;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_call_no IS NULL OR p_call_no NOT BETWEEN 1 AND 8
 OR p_model IS NULL OR p_model NOT IN ('gpt-6-luna','gpt-6.1-sol')
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 SELECT p.key,p.participant_role INTO v_person,v_role
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants p
  ON p.key=m.participant_key AND p.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
  AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  AND ((
   p.participant_role='buyer' AND p_call_no<=8 AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_central_attempts_mvp226 b
    WHERE b.message_hmac=m.message_hmac AND b.buyer_key=p.key
     AND b.chat_hmac=m.chat_hmac AND b.state='reserved')
  ) OR (
   p.participant_role='supplier' AND p_call_no<=2 AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 q
    WHERE q.message_hmac=m.message_hmac AND q.supplier_key=p.key
     AND q.state='reserved')
  ))
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 a
  WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no)
 THEN RETURN jsonb_build_object('state','already_reserved');END IF;
 -- 24h rolling quotas are separate from persistent unreviewed uncertainty.
 SELECT count(*),
  coalesce(sum(CASE WHEN state='observed' THEN total_tokens ELSE 0 END),0)
 INTO n_,used_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264
 WHERE participant_key=v_person
  AND started_at>=clock_timestamp()-interval '24 hours';
 SELECT count(*) INTO unknown_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 a
 WHERE a.participant_key=v_person AND a.state IN('reserved','unmetered')
  AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_usage_reviews_mvp266 r
   WHERE r.message_hmac=a.message_hmac AND r.call_no=a.call_no
  );
 -- 24 calls maximum per person/24h AND no fresh paid call while previous
 -- request is of UNKNOWN spend. Includes network timeouts and missing usage.
 IF unknown_>0 THEN RETURN jsonb_build_object('state','usage_unknown_blocked');END IF;
 IF n_>=24 OR used_>=200000
 THEN RETURN jsonb_build_object('state','budget_exceeded');END IF;
 INSERT INTO cotironda_piloto_privado.ai_usage_calls_mvp264(
  message_hmac,call_no,participant_key,participant_role,model_code)
 VALUES(p_message_hmac,p_call_no,v_person,v_role,p_model)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS written_=row_count;
 RETURN jsonb_build_object('state',CASE WHEN written_=1 THEN 'reserved'
  ELSE 'already_reserved' END);
END;$fn$;

-- MVP264 finish/summary signatures and grants are unchanged.

-- Future independently authenticated administrative backend only.
-- Operator UUID alone does not authenticate a human.
-- A SHA identifies evidence, but does not attest its truth.
-- Financial exposure acceptance is NOT billing or token verification.
CREATE FUNCTION public.cotironda_piloto_ai_usage_manual_review_mvp266(
 p_message_hmac text,p_call_no integer,p_operator_ref uuid,
 p_basis text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE person_ text;usage_state_ text;started_ timestamptz;reviews_ bigint;
BEGIN
 IF p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_call_no IS NULL OR p_call_no NOT BETWEEN 1 AND 8
 OR p_operator_ref IS NULL
 OR p_basis IS NULL OR p_basis NOT IN(
  'provider_usage_reviewed','provider_billing_reviewed',
  'financial_exposure_accepted')
 OR p_evidence_sha256 IS NULL OR p_evidence_sha256 !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 -- Serialize the operator's 100-reviews/24h quota and revocation checks.
 PERFORM 1 FROM cotironda_piloto_privado.supervisor_operators_mvp265 o
 WHERE o.operator_ref=p_operator_ref AND o.active AND o.revoked_at IS NULL
  AND o.role='incident_manager'
 FOR UPDATE;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('state','operator_not_authorized');END IF;
 -- Serialize manual review against concurrent AI call reservations.
 SELECT p.key INTO person_
 FROM cotironda_piloto_privado.participants p
 JOIN cotironda_piloto_privado.ai_usage_calls_mvp264 a
  ON a.participant_key=p.key
 WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no
 FOR UPDATE OF p;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 SELECT a.state,a.started_at INTO usage_state_,started_
 FROM cotironda_piloto_privado.ai_usage_calls_mvp264 a
 WHERE a.message_hmac=p_message_hmac AND a.call_no=p_call_no FOR UPDATE;
 IF usage_state_ NOT IN('reserved','unmetered')
 THEN RETURN jsonb_build_object('state','not_unknown');END IF;
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_usage_reviews_mvp266 r
  WHERE r.message_hmac=p_message_hmac AND r.call_no=p_call_no
 ) THEN RETURN jsonb_build_object('state','already_reviewed');END IF;
 IF usage_state_='reserved' AND
  started_>clock_timestamp()-interval '30 minutes'
 THEN RETURN jsonb_build_object('state','still_in_flight');END IF;
 SELECT count(*) INTO reviews_
 FROM cotironda_piloto_privado.ai_usage_reviews_mvp266 r
 WHERE r.operator_ref=p_operator_ref
  AND r.reviewed_at>=clock_timestamp()-interval '24 hours';
 IF reviews_>=100 THEN
  RETURN jsonb_build_object('state','operator_review_cap');END IF;
 INSERT INTO cotironda_piloto_privado.ai_usage_reviews_mvp266(
  message_hmac,call_no,operator_ref,review_basis,evidence_sha256)
 VALUES(p_message_hmac,p_call_no,p_operator_ref,p_basis,p_evidence_sha256);
 RETURN jsonb_build_object('state','reviewed_private',
  'usage_observed',false,'monetary_cost_verified',false,
  'unknown_usage_is_zero',false,'messages_sent',false);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ai_usage_manual_review_mvp266(
 text,integer,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ai_usage_manual_review_mvp266(
 text,integer,uuid,text,text) TO service_role;

-- FIN mvp266_openai_unknown_persistent_review.sql

-- INICIO mvp267_operator_supabase_auth_mfa_bridge.sql
-- MVP267: operator identity from a LIVE Supabase Auth session, never a caller UUID.
-- Development overlay AFTER MVP264, MVP265, MVP266. No operators provisioned.
-- The project's JWT verifier (PostgREST) must validate its signature first.
DO $dependencies$ BEGIN
 IF to_regclass('auth.users') IS NULL
 OR to_regclass('auth.sessions') IS NULL
 OR to_regclass('cotironda_piloto_privado.supervisor_operators_mvp265') IS NULL
 OR to_regclass('cotironda_piloto_privado.ai_usage_reviews_mvp266') IS NULL
 THEN RAISE EXCEPTION 'mvp267_missing_dependency' USING errcode='42501';END IF;
END $dependencies$;

-- Mapping is administrative-only. No automatic assignment based on signup,
-- user_metadata, email, phone, request parameters or business membership.
ALTER TABLE cotironda_piloto_privado.supervisor_operators_mvp265
 ADD COLUMN auth_user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT;

-- Internal resolver, never an exposed RPC. Even a VALID unexpired JWT is
-- insufficient if the Auth session was revoked or the operator was disabled.
-- AAL2 means a second authentication factor was verified by Supabase Auth.
CREATE FUNCTION cotironda_piloto_privado.operator_session_mvp267()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 SELECT o.operator_ref
 FROM cotironda_piloto_privado.supervisor_operators_mvp265 o
 JOIN auth.users u ON u.id=o.auth_user_id
 JOIN auth.sessions sess ON sess.user_id=u.id
 WHERE o.active=true AND o.revoked_at IS NULL
  AND o.role='incident_manager'
  AND u.id=auth.uid()
  AND u.deleted_at IS NULL
  AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp())
  AND u.is_anonymous IS FALSE
  AND (auth.jwt()->>'iss')=
    'https://ilggkalaafhtiysyzlmg.supabase.co/auth/v1'
  AND (auth.jwt()->>'role')='authenticated'
  AND (auth.jwt()->>'aal')='aal2'
  AND (auth.jwt()->>'sub')=u.id::text
  AND (auth.jwt()->>'session_id')~*
    '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  AND sess.id=CASE
    WHEN (auth.jwt()->>'session_id')~*
      '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    THEN (auth.jwt()->>'session_id')::uuid
    ELSE NULL::uuid END
  AND (sess.not_after IS NULL OR sess.not_after>clock_timestamp())
  AND (auth.jwt()->>'exp')~'^[0-9]{9,11}$'
  AND CASE WHEN (auth.jwt()->>'exp')~'^[0-9]{9,11}$'
    THEN (auth.jwt()->>'exp')::bigint>
      extract(epoch FROM clock_timestamp())::bigint
    ELSE false END
 LIMIT 1;
$fn$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.operator_session_mvp267()
 FROM PUBLIC,anon,authenticated,service_role;

-- Read-only private incident queue. No identities or economic details.
CREATE FUNCTION public.cotironda_piloto_operator_queue_auth_mvp267()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path='' AS $fn$
BEGIN
 IF cotironda_piloto_privado.operator_session_mvp267() IS NULL
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 RETURN public.cotironda_piloto_supervisor_case_queue_mvp265();
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_operator_queue_auth_mvp267()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_operator_queue_auth_mvp267()
 TO authenticated;

-- Read-only aggregated tokens, never prompt or participant identity.
CREATE FUNCTION public.cotironda_piloto_operator_usage_auth_mvp267(
 p_window_hours integer DEFAULT 24
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path='' AS $fn$
BEGIN
 IF cotironda_piloto_privado.operator_session_mvp267() IS NULL
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 IF p_window_hours IS NULL OR p_window_hours NOT BETWEEN 1 AND 168
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 RETURN public.cotironda_piloto_ai_usage_summary_mvp264(p_window_hours);
END;$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_operator_usage_auth_mvp267(integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_operator_usage_auth_mvp267(integer)
 TO authenticated;

-- Operator UUID is deliberately NOT accepted from the caller.
CREATE FUNCTION public.cotironda_piloto_operator_case_action_auth_mvp267(
 p_signal_code text,p_episode_started_at timestamptz,
 p_action_code text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE v_operator uuid;
BEGIN
 v_operator:=cotironda_piloto_privado.operator_session_mvp267();
 IF v_operator IS NULL
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 RETURN public.cotironda_piloto_supervisor_case_action_mvp265(
  p_signal_code,p_episode_started_at,v_operator,
  p_action_code,p_evidence_sha256);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_operator_case_action_auth_mvp267(
 text,timestamptz,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_operator_case_action_auth_mvp267(
 text,timestamptz,text,text) TO authenticated;

-- Never turn an unresolved OpenAI bill into a zero-cost charge. This wrapper
-- calls the existing durable review ledger but supplies only a verified actor.
CREATE FUNCTION public.cotironda_piloto_operator_usage_review_auth_mvp267(
 p_message_hmac text,p_call_no integer,
 p_basis text,p_evidence_sha256 text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path='' AS $fn$
DECLARE v_operator uuid;
BEGIN
 v_operator:=cotironda_piloto_privado.operator_session_mvp267();
 IF v_operator IS NULL
 THEN RETURN jsonb_build_object('state','not_authorized');END IF;
 RETURN public.cotironda_piloto_ai_usage_manual_review_mvp266(
  p_message_hmac,p_call_no,v_operator,p_basis,p_evidence_sha256);
END;$fn$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_operator_usage_review_auth_mvp267(
 text,integer,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_operator_usage_review_auth_mvp267(
 text,integer,text,text) TO authenticated;

-- Default remains CLOSED until a trusted DBA separately provisions
-- an Auth user with verified AAL2 and links it to a single inactive operator,
-- then explicitly enables that operator under an authorized procedure.

-- FIN mvp267_operator_supabase_auth_mfa_bridge.sql

-- INICIO mvp274_continuous_pilot_optional_off.sql
-- MVP274 — PILOTO CONTINUO DE COSTO CERO, SOLO esquema; OFF por defecto.
-- 06/11/2026: se conserva el control de consentimiento, doble gate IA,
-- puerta de despacho, cuotas, limites de archivos, dedupe y reintentos.
-- No activa la prueba, Whapi, cron, ni modifica pedidos existentes.
-- El operador puede configurar expires_at=NULL SOLO al activar con
-- autorizacion especifica. Valor por defecto: enabled=false.
-- Modo legacy con expires_at mantiene MAXIMO 4 horas intacto.
-- Precaucion: esto no habilita uso ilimitado de OpenAI/Whapi.
ALTER TABLE cotironda_piloto_privado.ai_trial_control_mvp229
 DROP CONSTRAINT ai_trial_control_mvp229_check;
ALTER TABLE cotironda_piloto_privado.ai_trial_control_mvp229
 ADD CONSTRAINT ai_trial_control_mvp229_check CHECK (
  (enabled IS FALSE AND activated_at IS NULL AND expires_at IS NULL)
  OR (enabled IS TRUE AND activated_at IS NOT NULL AND
   (expires_at IS NULL OR (expires_at>activated_at
    AND expires_at<=activated_at+interval '4 hours')))
 );

-- Reusar la asociacion segura MVP230: proveedores con invitacion
-- entregada mantienen continuidad incluso si se apaga el modo,
-- solo durante el plazo y sin permitir nuevos envios.
-- MVP230: Durante prueba temporal, los PERMISOS DE ENVIO vencen,
-- pero un proveedor ya invitado puede cotizar hasta el cierre de su ronda.
-- Ninguna acción de creación/publicación/dispatch se activa aquí.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(
 p_chat_hmac text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
DECLARE
 v_trial_active boolean:=false;
 v_buyer boolean:=false;
 v_dispatch boolean:=false;
 v_quote boolean:=false;
 v_role text;
 v_supplier text;
 v_inbound boolean:=false;
 v_outbound boolean:=false;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 SELECT p.participant_role,p.key INTO v_role,v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.chat_hmac=p_chat_hmac
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
   AND ((p.participant_role='buyer' AND p.key='arquitecto')
    OR (p.participant_role='supplier'
      AND p.key IN('corralon_ailin','corralon_nahuel')));
 IF NOT FOUND THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 SELECT t.enabled AND t.activated_at<=clock_timestamp()
  AND (t.expires_at IS NULL OR t.expires_at>clock_timestamp())
 INTO v_trial_active
 FROM cotironda_piloto_privado.ai_trial_control_mvp229 t WHERE t.only_row;
 SELECT f.whatsapp_inbound_enabled,f.whatsapp_outbound_enabled
 INTO v_inbound,v_outbound FROM cotironda_piloto_privado.integration_flags f
 WHERE f.only_row;
 IF NOT coalesce(v_inbound,false)
 THEN RETURN jsonb_build_object('state','inactive',
  'buyer',false,'dispatch',false,'quote_link',false,'quote_analysis',false);END IF;
 -- SOLO compradores con modo piloto vigente pueden iniciar nuevas rondas
 -- y solo si todas las autorizaciones de despacho siguen activadas.
 v_buyer:=coalesce(v_trial_active,false) AND coalesce(v_outbound,false)
  AND v_role='buyer'
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226 g
   WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 v_dispatch:=v_buyer
  AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 g
   WHERE g.only_row AND g.enabled AND g.activated_at IS NOT NULL);
 -- Un proveedor autorizado conserva el derecho a RESPONDER a una
 -- solicitud efectivamente entregada, sin necesidad de activar envío.
 -- Nunca habilitar pendientes, leased, inciertos ni rondas legacy.
 v_quote:=v_role='supplier' AND EXISTS(
  SELECT 1
  FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
  JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sr
   ON sr.request_id=r.id AND sr.source_hmac=r.source_hmac
  WHERE j.supplier_key=v_supplier
    AND j.state='api_accepted'
    AND j.whapi_message_id IS NOT NULL
    AND j.finished_at IS NOT NULL
    AND r.state='prepared' AND r.closes_at>clock_timestamp()
    AND r.created_at<=j.finished_at
 );
 RETURN jsonb_build_object(
  'state',CASE WHEN coalesce(v_trial_active,false) THEN 'active'
    WHEN v_quote THEN 'continuation' ELSE 'inactive' END,
  'buyer',v_buyer,'dispatch',v_dispatch,
  'quote_link',v_quote,'quote_analysis',v_quote);
END
$fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 TO service_role;

-- No se cambia la ACL: verificar explicitamente que solo service_role
-- pueda invocar el RPC; revocar de nuevo como defensa contra drift.
REVOKE ALL ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_ia_trial_flags_mvp229(text)
 TO service_role;

-- FIN mvp274_continuous_pilot_optional_off.sql

-- INICIO mvp276_comprador_archivo_txt_csv_autoridad_sha.sql
-- MVP276 PILOTO: document buyer source stays original and authenticated.
-- Covers TXT/CSV with SHA-256 byte-for-byte matching; no PDF/Excel/image.
-- Four existing text-only RPCs preserve their original text branch exactly.
-- Installation is ONLY by separate authorized PILOTO deployment with all gates OFF.
-- No new message, invitation, cost, cron, or public privilege.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.fuente_original_documental_mvp276(
 p_message_hmac text,p_chat_hmac text,p_buyer_key text,p_source_sha256 text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $source$
 SELECT p_message_hmac ~ '^[a-f0-9]{64}$'
  AND p_chat_hmac ~ '^[a-f0-9]{64}$'
  AND p_source_sha256 ~ '^[a-f0-9]{64}$'
  AND EXISTS(
   SELECT 1
   FROM cotironda_piloto_privado.whapi_inbox m
   JOIN cotironda_piloto_privado.participants p
    ON p.key=m.participant_key AND p.chat_hmac=m.chat_hmac
   JOIN cotironda_piloto_privado.media_archive_mvp095 a
    ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
    AND a.participant_key=m.participant_key
   WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
    AND m.participant_key=p_buyer_key
    AND m.kind='document' AND m.processing_state='needs_review'
    AND p.participant_role='buyer' AND p.consent_at IS NOT NULL
    AND p.opted_out_at IS NULL
    AND a.kind='document' AND a.state='stored'
    AND a.mime IN('text/plain','text/csv')
    AND a.size_bytes BETWEEN 10 AND 4096
    AND a.content_sha256=p_source_sha256
    AND a.storage_path='media/'||p_message_hmac
    AND a.finished_at IS NOT NULL
    AND (a.request_id IS NULL OR a.request_id=m.request_id)
  )
$source$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.fuente_original_documental_mvp276(text,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.fuente_original_documental_mvp276(text,text,text,text)
 TO service_role;


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
   AND m.processing_state='needs_review'
   AND ((m.kind='text' AND m.plaintext_sha256=p_source_sha256)
      OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,p_source_sha256)))
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

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_shadow_prepare_mvp221(
 p_buyer_chat_hmac text, p_message_hmac text,
 p_original_text text, p_city text,
 p_items jsonb, p_destinos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_buyer text;
 v_source cotironda_piloto_privado.whapi_inbox%ROWTYPE;
 v_request uuid;
 v_item jsonb;
 v_destination jsonb;
 v_match jsonb;
 v_index bigint;
 v_number bigint;
 v_line_count integer;
 v_dest_count integer:=0;
 v_original_catalogue text;
 v_supplier text;
 v_rubro text;
 v_description text;
 v_evidence text;
 v_qty text;
 v_unit text;
 v_num numeric;
BEGIN
 IF p_buyer_chat_hmac IS NULL OR p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_original_text IS NULL OR length(p_original_text) NOT BETWEEN 10 AND 4000
  OR p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 3 AND 80
  OR p_city ~ '[[:cntrl:]]'
 THEN RETURN jsonb_build_object('state','invalid_input');END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN
  RETURN jsonb_build_object('state','invalid_items');END IF;
 v_line_count:=jsonb_array_length(p_items);
 IF v_line_count NOT BETWEEN 1 AND 200 THEN
  RETURN jsonb_build_object('state','capacity_requires_batches');END IF;
 IF p_destinos IS NULL OR jsonb_typeof(p_destinos)<>'array' THEN
  RETURN jsonb_build_object('state','invalid_destinations');END IF;
 IF jsonb_array_length(p_destinos) NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','invalid_destinations');END IF;

 -- Validar el MISMO mensaje que Whapi autenticó y archivó cifrado.
 SELECT m.* INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=m.participant_key AND buyer.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_buyer_chat_hmac
  AND m.request_id IS NULL AND m.processing_state='needs_review'
  AND ((m.kind='text' AND m.plaintext_sha256=
    encode(sha256(convert_to(p_original_text,'UTF8')),'hex'))
   OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,encode(sha256(convert_to(p_original_text,'UTF8')),'hex'))))
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND m.received_at>clock_timestamp()-interval '48 hours'
 FOR UPDATE OF m;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
    WHERE r.source_hmac=p_message_hmac) THEN
   RETURN jsonb_build_object('state','already_staged');
  END IF;
  RETURN jsonb_build_object('state','source_not_authorized');
 END IF;
 v_buyer:=v_source.participant_key;

 -- Verificar TODAS las líneas antes de escribir ninguna.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN
   RETURN jsonb_build_object('state','invalid_item_schema');END IF;
  v_description:=v_item->>'descripcion';
  v_evidence:=v_item->>'evidencia';
  v_qty:=v_item->>'cantidad';
  v_unit:=v_item->>'unidad';
  v_rubro:=v_item->>'rubro';
  IF v_description IS NULL OR length(v_description) NOT BETWEEN 3 AND 500
   OR v_evidence IS NULL OR length(v_evidence) NOT BETWEEN 2 AND 1500
   OR position(v_evidence IN p_original_text)=0
   OR v_qty IS NULL OR v_qty !~ '^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,3})?$'
   OR v_unit IS NULL OR v_unit NOT IN
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
   OR v_rubro IS NULL OR v_rubro NOT IN
    ('obra_gruesa','pintura','electricidad','construccion_seca',
     'sanitarios','ferreteria','otros')
  THEN RETURN jsonb_build_object('state','invalid_item_data');END IF;
  v_num:=v_qty::numeric;
  IF v_num<=0 OR v_num>1000000 THEN
   RETURN jsonb_build_object('state','invalid_quantity');END IF;
 END LOOP;

 -- Propuesta IA: proveedor EXISTENTE, consentido, sin repetir índice y
 -- con catálogo que coincida BYTE-A-BYTE con la versión que vio el modelo.
 FOR v_destination IN SELECT value FROM jsonb_array_elements(p_destinos) LOOP
  v_supplier:=v_destination->>'proveedor';
  IF jsonb_typeof(v_destination)<>'object' OR v_supplier IS NULL
   OR v_supplier !~ '^[a-z][a-z0-9_]{2,63}$'
   OR jsonb_typeof(v_destination->'correspondencias')<>'array'
   OR jsonb_array_length(v_destination->'correspondencias') NOT BETWEEN 1 AND v_line_count
  THEN RETURN jsonb_build_object('state','invalid_supplier_plan');END IF;
  IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participants p
   WHERE p.key=v_supplier AND p.participant_role='supplier'
    AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
    AND p.opted_out_at IS NULL
    AND lower(btrim(p.delivery_city))=lower(btrim(p_city))
  ) THEN RETURN jsonb_build_object('state','supplier_not_authorized');END IF;
  FOR v_match IN SELECT value FROM jsonb_array_elements(v_destination->'correspondencias')
  LOOP
   IF jsonb_typeof(v_match)<>'object'
    OR (v_match->>'indicePedido') !~ '^[0-9]{1,3}$'
    OR (v_match->>'numeroCatalogo') !~ '^[0-9]{1,3}$'
    OR v_match->>'tipo' NOT IN ('producto_declarado','alternativa_razonable')
    OR length(coalesce(v_match->>'explicacion','')) NOT BETWEEN 3 AND 240
   THEN RETURN jsonb_build_object('state','invalid_catalogue_match');END IF;
   v_index:=(v_match->>'indicePedido')::bigint;
   v_number:=(v_match->>'numeroCatalogo')::bigint;
   v_original_catalogue:=v_match->>'descripcionCatalogo';
   IF v_index NOT BETWEEN 0 AND v_line_count-1 OR v_number NOT BETWEEN 1 AND 500
    OR v_original_catalogue IS NULL
    OR v_match->>'rubroCatalogo' IS DISTINCT FROM
       p_items->(v_index::integer)->>'rubro'
   THEN RETURN jsonb_build_object('state','catalogue_not_verifiable');END IF;
   IF NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.catalogue_lines c
    JOIN cotironda_piloto_privado.participants p ON p.key=c.participant_key
    WHERE c.participant_key=v_supplier AND c.line_no=v_number
      AND c.literal_description=v_original_catalogue
      -- Comparar la descripción fuente exacta: no inventar catálogo.
   ) THEN RETURN jsonb_build_object('state','catalogue_changed');END IF;
   v_dest_count:=v_dest_count+1;
  END LOOP;
 END LOOP;
 IF v_dest_count=0 THEN
  RETURN jsonb_build_object('state','no_valid_destinations');END IF;

 -- A partir de aquí, cualquier error SQL aborta toda la transacción.
 -- NO insertar invitaciones: los triggers heredados crearían mensajes.
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES(v_buyer,btrim(p_city),p_original_text,p_message_hmac,'draft')
 RETURNING id INTO v_request;
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 SELECT v_request,idx,(value->>'descripcion'),
  (value->>'cantidad')::numeric,(value->>'unidad'),NULL::text
 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,idx);
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(v_request,p_message_hmac);
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 SELECT v_request,idx,value->>'rubro',value->>'evidencia'
 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,idx);
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion)
 SELECT v_request,d->>'proveedor',
  ((m->>'indicePedido')::integer+1)::smallint,
  (m->>'numeroCatalogo')::smallint,m->>'descripcionCatalogo',
  m->>'tipo',m->>'explicacion'
 FROM jsonb_array_elements(p_destinos) d
 CROSS JOIN LATERAL jsonb_array_elements(d->'correspondencias') m;
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_request WHERE message_hmac=p_message_hmac;

 RETURN jsonb_build_object(
  'state','shadow_staged','request_id',v_request,
  'items_staged',v_line_count,'matches_staged',v_dest_count,
  'invitations_sent',0,'outbox_sent',0);
END
$f$;

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
    m.message_hmac,m.chat_hmac,m.participant_key,encode(sha256(convert_to(v_round.original_request,'UTF8')),'hex'))));
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
  AND r.created_at>clock_timestamp()-interval '30 minutes'
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.processing_state='needs_review'
  AND ((src.kind='text' AND src.plaintext_sha256=
   encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))
   OR (src.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    src.message_hmac,src.chat_hmac,src.participant_key,encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))));
 IF n=0 THEN RETURN jsonb_build_object('state','empty');END IF;
 IF n<>1 THEN RETURN jsonb_build_object('state','ambiguous');END IF;
 RETURN jsonb_build_object('state','ready','request_id',rid);
END;
$lookup$;


-- RPCs may be invoked only by server service_role; no anon auth grant.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 TO service_role;

-- FIN mvp276_comprador_archivo_txt_csv_autoridad_sha.sql

-- INICIO mvp278_autorizacion_binarios_lectura_independiente.sql
-- MVP278 PILOTO — attestation from ORIGINAL PDF/DOCX/XLSX bytes, with
-- independently derived text hashed separately. NOT enabled or installed.
-- Never forge kind=text or equate original binary SHA to derived text SHA.
--
-- TRUST BOUNDARY: the trusted Edge worker runs MVP277 independent byte
-- verification. SQL checks archive/Storage presence, immutable attest
-- digest, identity/consent, text hash and item count; SQL CANNOT parse PDF.
CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278(
 message_hmac text PRIMARY KEY
  REFERENCES cotironda_piloto_privado.whapi_inbox(message_hmac)
  ON DELETE RESTRICT,
 chat_hmac text NOT NULL CHECK(chat_hmac ~ '^[a-f0-9]{64}$'),
 buyer_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 mime text NOT NULL CHECK(mime IN(
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 )),
 original_sha256 text NOT NULL CHECK(original_sha256 ~ '^[a-f0-9]{64}$'),
 derived_text_sha256 text NOT NULL CHECK(derived_text_sha256 ~ '^[a-f0-9]{64}$'),
 derived_text_length integer NOT NULL CHECK(derived_text_length BETWEEN 10 AND 4000),
 verified_items smallint NOT NULL CHECK(verified_items BETWEEN 1 AND 25),
 verifier_version text NOT NULL DEFAULT 'buyer_binaries_mvp277_v1'
  CHECK(verifier_version='buyer_binaries_mvp277_v1'),
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278
 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278
 FROM PUBLIC,anon,authenticated,service_role;

-- SQL itself does not know PDF text; this RPC is callable ONLY by a
-- private service worker after MVP277 has independently matched ALL rows.
-- No model-supplied field may directly invoke it. No plaintext stored.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_attest_binary_mvp278(
 p_chat_hmac text,p_message_hmac text,p_original_sha256 text,
 p_derived_text text,p_mime text,p_verified_items integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $attest$
DECLARE v_buyer text;v_derived_sha text;v_existing record;v_added int;
BEGIN
 IF p_chat_hmac IS NULL OR p_chat_hmac !~ '^[a-f0-9]{64}$'
 OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
 OR p_original_sha256 IS NULL OR p_original_sha256 !~ '^[a-f0-9]{64}$'
 OR p_derived_text IS NULL OR length(p_derived_text) NOT BETWEEN 10 AND 4000
 OR p_verified_items IS NULL OR p_verified_items NOT BETWEEN 1 AND 25
 OR p_mime IS NULL OR p_mime NOT IN(
   'application/pdf',
   'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
   'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
 )
 OR regexp_replace(p_derived_text,E'[\n\r\t]','','g') ~ '[[:cntrl:]]'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.ai_central_control_mvp226
  WHERE only_row AND enabled AND activated_at IS NOT NULL
 ) OR NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.integration_flags
  WHERE only_row AND whatsapp_inbound_enabled
 ) THEN RETURN jsonb_build_object('state','disabled');END IF;

 -- Lock the original inbound message and ensure the privately stored
 -- binary object still exists. Metadata SHA is bound to the bytes saved
 -- by verified media archive; do NOT trust a text from the language model.
 SELECT m.participant_key INTO v_buyer
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=m.participant_key AND buyer.chat_hmac=m.chat_hmac
 JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac
  AND a.chat_hmac=m.chat_hmac AND a.participant_key=m.participant_key
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
  AND m.kind='document' AND m.processing_state='needs_review'
  AND m.received_at>clock_timestamp()-interval '10 minutes'
  AND buyer.participant_role='buyer' AND buyer.consent_at IS NOT NULL
  AND buyer.opted_out_at IS NULL
  AND a.state='stored' AND a.kind='document'
  AND a.mime=p_mime AND a.size_bytes BETWEEN 120 AND 3145728
  AND a.content_sha256=p_original_sha256 AND a.finished_at IS NOT NULL
  AND a.storage_path='media/'||p_message_hmac
  AND (a.request_id IS NULL OR a.request_id=m.request_id)
  AND EXISTS(
   SELECT 1 FROM storage.objects o
   WHERE o.bucket_id='cotironda-piloto-originals'
    AND o.name=a.storage_path
  )
 FOR UPDATE OF m;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','source_not_authorized');END IF;
 v_derived_sha:=encode(sha256(convert_to(p_derived_text,'UTF8')),'hex');
 SELECT e.* INTO v_existing
 FROM cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e
 WHERE e.message_hmac=p_message_hmac;
 IF FOUND THEN
  IF v_existing.chat_hmac=p_chat_hmac AND v_existing.buyer_key=v_buyer
   AND v_existing.mime=p_mime
   AND v_existing.original_sha256=p_original_sha256
   AND v_existing.derived_text_sha256=v_derived_sha
   AND v_existing.verified_items=p_verified_items
   AND v_existing.derived_text_length=length(p_derived_text)
  THEN RETURN jsonb_build_object('state','already_attested');END IF;
  RETURN jsonb_build_object('state','conflicting_evidence');
 END IF;

 INSERT INTO cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278(
  message_hmac,chat_hmac,buyer_key,mime,
  original_sha256,derived_text_sha256,derived_text_length,verified_items
 ) VALUES(
  p_message_hmac,p_chat_hmac,v_buyer,p_mime,
  p_original_sha256,v_derived_sha,length(p_derived_text),p_verified_items
 ) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 RETURN jsonb_build_object('state',
  CASE WHEN v_added=1 THEN 'attested' ELSE 'concurrent_attestation_review' END);
END
$attest$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_attest_binary_mvp278(text,text,text,text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_attest_binary_mvp278(text,text,text,text,text,integer)
 TO service_role;

-- Used at reserve, staging, publish and dispatch. All four gates re-check
-- the SAME derived text SHA against original binary SHA and verified count.
CREATE OR REPLACE FUNCTION
 cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
 p_message_hmac text,p_chat_hmac text,p_buyer_key text,
 p_derived_text_sha256 text,p_expected_items integer DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $source$
 SELECT coalesce(
  p_message_hmac ~ '^[a-f0-9]{64}$'
  AND p_chat_hmac ~ '^[a-f0-9]{64}$'
  AND p_derived_text_sha256 ~ '^[a-f0-9]{64}$'
  AND (p_expected_items IS NULL OR p_expected_items BETWEEN 1 AND 25)
  AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.whapi_inbox m
    JOIN cotironda_piloto_privado.participants buyer
     ON buyer.key=m.participant_key AND buyer.chat_hmac=m.chat_hmac
    JOIN cotironda_piloto_privado.media_archive_mvp095 a
     ON a.message_hmac=m.message_hmac AND a.chat_hmac=m.chat_hmac
      AND a.participant_key=m.participant_key
    JOIN cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e
     ON e.message_hmac=m.message_hmac AND e.chat_hmac=m.chat_hmac
      AND e.buyer_key=m.participant_key
    WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_chat_hmac
     AND m.participant_key=p_buyer_key
     AND m.kind='document' AND m.processing_state='needs_review'
     AND buyer.participant_role='buyer'
     AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
     AND a.kind='document' AND a.state='stored'
     AND a.mime=e.mime AND a.content_sha256=e.original_sha256
     AND a.finished_at IS NOT NULL AND a.size_bytes BETWEEN 120 AND 3145728
     AND a.storage_path='media/'||p_message_hmac
     AND (a.request_id IS NULL OR a.request_id=m.request_id)
     AND e.derived_text_sha256=p_derived_text_sha256
     AND (p_expected_items IS NULL OR e.verified_items=p_expected_items)
     AND EXISTS(
      SELECT 1 FROM storage.objects o
      WHERE o.bucket_id='cotironda-piloto-originals'
       AND o.name=a.storage_path
     )
  ),false
 )
$source$;

REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.fuente_binaria_comprador_mvp278(text,text,text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.fuente_binaria_comprador_mvp278(text,text,text,text,integer)
 TO service_role;

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
   AND m.processing_state='needs_review'
   AND ((m.kind='text' AND m.plaintext_sha256=p_source_sha256)
      OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,p_source_sha256))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      p_source_sha256,NULL)))
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

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_shadow_prepare_mvp221(
 p_buyer_chat_hmac text, p_message_hmac text,
 p_original_text text, p_city text,
 p_items jsonb, p_destinos jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $f$
DECLARE
 v_buyer text;
 v_source cotironda_piloto_privado.whapi_inbox%ROWTYPE;
 v_request uuid;
 v_item jsonb;
 v_destination jsonb;
 v_match jsonb;
 v_index bigint;
 v_number bigint;
 v_line_count integer;
 v_dest_count integer:=0;
 v_original_catalogue text;
 v_supplier text;
 v_rubro text;
 v_description text;
 v_evidence text;
 v_qty text;
 v_unit text;
 v_num numeric;
BEGIN
 IF p_buyer_chat_hmac IS NULL OR p_buyer_chat_hmac !~ '^[a-f0-9]{64}$'
  OR p_message_hmac IS NULL OR p_message_hmac !~ '^[a-f0-9]{64}$'
  OR p_original_text IS NULL OR length(p_original_text) NOT BETWEEN 10 AND 4000
  OR p_city IS NULL OR length(btrim(p_city)) NOT BETWEEN 3 AND 80
  OR p_city ~ '[[:cntrl:]]'
 THEN RETURN jsonb_build_object('state','invalid_input');END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' THEN
  RETURN jsonb_build_object('state','invalid_items');END IF;
 v_line_count:=jsonb_array_length(p_items);
 IF v_line_count NOT BETWEEN 1 AND 200 THEN
  RETURN jsonb_build_object('state','capacity_requires_batches');END IF;
 IF p_destinos IS NULL OR jsonb_typeof(p_destinos)<>'array' THEN
  RETURN jsonb_build_object('state','invalid_destinations');END IF;
 IF jsonb_array_length(p_destinos) NOT BETWEEN 1 AND 25 THEN
  RETURN jsonb_build_object('state','invalid_destinations');END IF;

 -- Validar el MISMO mensaje que Whapi autenticó y archivó cifrado.
 SELECT m.* INTO v_source
 FROM cotironda_piloto_privado.whapi_inbox m
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=m.participant_key AND buyer.chat_hmac=m.chat_hmac
 WHERE m.message_hmac=p_message_hmac AND m.chat_hmac=p_buyer_chat_hmac
  AND m.request_id IS NULL AND m.processing_state='needs_review'
  AND ((m.kind='text' AND m.plaintext_sha256=
    encode(sha256(convert_to(p_original_text,'UTF8')),'hex'))
   OR (m.kind='document' AND
   cotironda_piloto_privado.fuente_original_documental_mvp276(
    m.message_hmac,m.chat_hmac,m.participant_key,encode(sha256(convert_to(p_original_text,'UTF8')),'hex')))
   OR (m.kind='document' AND
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
      m.message_hmac,m.chat_hmac,m.participant_key,
      encode(sha256(convert_to(p_original_text,'UTF8')),'hex'),jsonb_array_length(p_items))))
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND m.received_at>clock_timestamp()-interval '48 hours'
 FOR UPDATE OF m;
 IF NOT FOUND THEN
  IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
    WHERE r.source_hmac=p_message_hmac) THEN
   RETURN jsonb_build_object('state','already_staged');
  END IF;
  RETURN jsonb_build_object('state','source_not_authorized');
 END IF;
 v_buyer:=v_source.participant_key;

 -- Verificar TODAS las líneas antes de escribir ninguna.
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(v_item)<>'object' THEN
   RETURN jsonb_build_object('state','invalid_item_schema');END IF;
  v_description:=v_item->>'descripcion';
  v_evidence:=v_item->>'evidencia';
  v_qty:=v_item->>'cantidad';
  v_unit:=v_item->>'unidad';
  v_rubro:=v_item->>'rubro';
  IF v_description IS NULL OR length(v_description) NOT BETWEEN 3 AND 500
   OR v_evidence IS NULL OR length(v_evidence) NOT BETWEEN 2 AND 1500
   OR position(v_evidence IN p_original_text)=0
   OR v_qty IS NULL OR v_qty !~ '^(?:0|[1-9][0-9]{0,5})(?:\.[0-9]{1,3})?$'
   OR v_unit IS NULL OR v_unit NOT IN
    ('unit','bag','box','kg','g','l','ml','m','m2','m3','roll','pack')
   OR v_rubro IS NULL OR v_rubro NOT IN
    ('obra_gruesa','pintura','electricidad','construccion_seca',
     'sanitarios','ferreteria','otros')
  THEN RETURN jsonb_build_object('state','invalid_item_data');END IF;
  v_num:=v_qty::numeric;
  IF v_num<=0 OR v_num>1000000 THEN
   RETURN jsonb_build_object('state','invalid_quantity');END IF;
 END LOOP;

 -- Propuesta IA: proveedor EXISTENTE, consentido, sin repetir índice y
 -- con catálogo que coincida BYTE-A-BYTE con la versión que vio el modelo.
 FOR v_destination IN SELECT value FROM jsonb_array_elements(p_destinos) LOOP
  v_supplier:=v_destination->>'proveedor';
  IF jsonb_typeof(v_destination)<>'object' OR v_supplier IS NULL
   OR v_supplier !~ '^[a-z][a-z0-9_]{2,63}$'
   OR jsonb_typeof(v_destination->'correspondencias')<>'array'
   OR jsonb_array_length(v_destination->'correspondencias') NOT BETWEEN 1 AND v_line_count
  THEN RETURN jsonb_build_object('state','invalid_supplier_plan');END IF;
  IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participants p
   WHERE p.key=v_supplier AND p.participant_role='supplier'
    AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
    AND p.opted_out_at IS NULL
    AND lower(btrim(p.delivery_city))=lower(btrim(p_city))
  ) THEN RETURN jsonb_build_object('state','supplier_not_authorized');END IF;
  FOR v_match IN SELECT value FROM jsonb_array_elements(v_destination->'correspondencias')
  LOOP
   IF jsonb_typeof(v_match)<>'object'
    OR (v_match->>'indicePedido') !~ '^[0-9]{1,3}$'
    OR (v_match->>'numeroCatalogo') !~ '^[0-9]{1,3}$'
    OR v_match->>'tipo' NOT IN ('producto_declarado','alternativa_razonable')
    OR length(coalesce(v_match->>'explicacion','')) NOT BETWEEN 3 AND 240
   THEN RETURN jsonb_build_object('state','invalid_catalogue_match');END IF;
   v_index:=(v_match->>'indicePedido')::bigint;
   v_number:=(v_match->>'numeroCatalogo')::bigint;
   v_original_catalogue:=v_match->>'descripcionCatalogo';
   IF v_index NOT BETWEEN 0 AND v_line_count-1 OR v_number NOT BETWEEN 1 AND 500
    OR v_original_catalogue IS NULL
    OR v_match->>'rubroCatalogo' IS DISTINCT FROM
       p_items->(v_index::integer)->>'rubro'
   THEN RETURN jsonb_build_object('state','catalogue_not_verifiable');END IF;
   IF NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.catalogue_lines c
    JOIN cotironda_piloto_privado.participants p ON p.key=c.participant_key
    WHERE c.participant_key=v_supplier AND c.line_no=v_number
      AND c.literal_description=v_original_catalogue
      -- Comparar la descripción fuente exacta: no inventar catálogo.
   ) THEN RETURN jsonb_build_object('state','catalogue_changed');END IF;
   v_dest_count:=v_dest_count+1;
  END LOOP;
 END LOOP;
 IF v_dest_count=0 THEN
  RETURN jsonb_build_object('state','no_valid_destinations');END IF;

 -- A partir de aquí, cualquier error SQL aborta toda la transacción.
 -- NO insertar invitaciones: los triggers heredados crearían mensajes.
 INSERT INTO cotironda_piloto_privado.requests(
  buyer_key,delivery_city,original_request,source_hmac,state)
 VALUES(v_buyer,btrim(p_city),p_original_text,p_message_hmac,'draft')
 RETURNING id INTO v_request;
 INSERT INTO cotironda_piloto_privado.request_lines(
  request_id,line_no,original_description,quantity,unit,family_code)
 SELECT v_request,idx,(value->>'descripcion'),
  (value->>'cantidad')::numeric,(value->>'unidad'),NULL::text
 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,idx);
 INSERT INTO cotironda_piloto_privado.ai_shadow_requests_mvp221(
  request_id,source_hmac) VALUES(v_request,p_message_hmac);
 INSERT INTO cotironda_piloto_privado.ai_shadow_rubros_mvp221(
  request_id,line_no,rubro,evidencia)
 SELECT v_request,idx,value->>'rubro',value->>'evidencia'
 FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(value,idx);
 INSERT INTO cotironda_piloto_privado.ai_shadow_destinos_mvp221(
  request_id,supplier_key,line_no,catalogue_line_no,
  catalogue_description,tipo,explicacion)
 SELECT v_request,d->>'proveedor',
  ((m->>'indicePedido')::integer+1)::smallint,
  (m->>'numeroCatalogo')::smallint,m->>'descripcionCatalogo',
  m->>'tipo',m->>'explicacion'
 FROM jsonb_array_elements(p_destinos) d
 CROSS JOIN LATERAL jsonb_array_elements(d->'correspondencias') m;
 UPDATE cotironda_piloto_privado.whapi_inbox
 SET request_id=v_request WHERE message_hmac=p_message_hmac;

 RETURN jsonb_build_object(
  'state','shadow_staged','request_id',v_request,
  'items_staged',v_line_count,'matches_staged',v_dest_count,
  'invitations_sent',0,'outbox_sent',0);
END
$f$;

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
  AND r.created_at>clock_timestamp()-interval '30 minutes'
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.processing_state='needs_review'
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

-- No new public access to the original four IA Central functions.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_reserve_buyer_mvp226(text,text,text),
 public.cotironda_piloto_ia_shadow_prepare_mvp221(text,text,text,text,jsonb,jsonb),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text)
 TO service_role;

-- FIN mvp278_autorizacion_binarios_lectura_independiente.sql

-- INICIO mvp279_revision_confirmacion_whatsapp_binarios.sql
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

-- FIN mvp279_revision_confirmacion_whatsapp_binarios.sql

-- INICIO mvp280_confirmacion_unificada_comprador.sql
-- MVP280: UNIFIED buyer confirmation for original text, TXT/CSV and PDF/DOCX/XLSX.
-- Only after MVP276 + MVP278 + MVP279; all gates OFF on installation.
-- No frontend-accessible grants and no deletion of evidence.

-- MVP280: A reviewable source is the ACTUAL recorded buyer text, the
-- exact TXT/CSV byte file, or the independently verified PDF/DOCX/XLSX.
-- Never turn model output into a fake text-kind WhatsApp message.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.fuente_revisable_mvp280(
 p_request uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $source$
 SELECT coalesce(EXISTS(
 SELECT 1 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key
 JOIN cotironda_piloto_privado.whapi_inbox msg
  ON msg.message_hmac=r.source_hmac
  AND msg.request_id=r.id
  AND msg.participant_key=buyer.key AND msg.chat_hmac=buyer.chat_hmac
 WHERE r.id=p_request AND r.state IN('draft','prepared')
  AND r.closes_at>clock_timestamp()
  AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
  AND msg.processing_state='needs_review'
  AND (SELECT count(*) FROM cotironda_piloto_privado.request_lines l
       WHERE l.request_id=r.id) BETWEEN 1 AND 25
  AND (
   (msg.kind='text' AND msg.plaintext_sha256=
     encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))
   OR (msg.kind='document' AND (
    cotironda_piloto_privado.fuente_original_documental_mvp276(
     msg.message_hmac,msg.chat_hmac,msg.participant_key,
     encode(sha256(convert_to(r.original_request,'UTF8')),'hex'))
    OR
    cotironda_piloto_privado.fuente_binaria_comprador_mvp278(
     msg.message_hmac,msg.chat_hmac,msg.participant_key,
     encode(sha256(convert_to(r.original_request,'UTF8')),'hex'),
     (SELECT count(*)::integer FROM cotironda_piloto_privado.request_lines l
      WHERE l.request_id=r.id))
   )
   AND EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.media_archive_mvp095 a
    JOIN storage.objects o ON o.bucket_id='cotironda-piloto-originals'
     AND o.name=a.storage_path
    WHERE a.message_hmac=msg.message_hmac AND a.chat_hmac=msg.chat_hmac
     AND a.participant_key=msg.participant_key AND a.state='stored'
   ))
  )
 ),false);
$source$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.fuente_revisable_mvp280(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.fuente_revisable_mvp280(uuid)
 TO service_role;


CREATE OR REPLACE FUNCTION cotironda_piloto_privado.ai_buyer_snapshot_mvp279(
 p_request uuid
) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO ''
AS $snapshot$
 SELECT jsonb_build_object(
  'requestId',r.id::text,'buyer',r.buyer_key,'source',r.source_hmac,
  'originalTextHash',encode(sha256(convert_to(r.original_request,'UTF8')),'hex'),
  'sourceKind',m.kind,'sourceMime',a.mime,
  'originalDocumentHash',a.content_sha256,
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
 JOIN cotironda_piloto_privado.whapi_inbox m
  ON m.message_hmac=r.source_hmac AND m.request_id=r.id
   AND m.participant_key=r.buyer_key
 LEFT JOIN cotironda_piloto_privado.media_archive_mvp095 a
  ON a.message_hmac=m.message_hmac AND a.participant_key=m.participant_key
 LEFT JOIN cotironda_piloto_privado.ai_buyer_binary_evidence_mvp278 e
  ON e.message_hmac=m.message_hmac AND e.buyer_key=r.buyer_key
 WHERE r.id=p_request
  AND cotironda_piloto_privado.fuente_revisable_mvp280(r.id);
$snapshot$;

-- Approval applies to ALL three real formats through one immutable
-- review ledger, with separate signed identity and source re-validation.
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
 ),false);
$approved$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.confirmada_comprador_mvp280(uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 cotironda_piloto_privado.confirmada_comprador_mvp280(uuid)
 TO service_role;


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
 IF NOT cotironda_piloto_privado.confirmada_comprador_mvp280(v_round.id)
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
    AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)))
  AND b.participant_role='buyer'
  AND b.chat_hmac=p_buyer_chat_hmac
  AND b.consent_at IS NOT NULL AND b.opted_out_at IS NULL
  AND src.processing_state='needs_review'
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
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
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
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
  AND cotironda_piloto_privado.confirmada_comprador_mvp280(r.id)
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

-- Keep the four dispatch gates and review issue restricted to server.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_review_issue_mvp279(text,text),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text),
 public.cotironda_piloto_ia_claim_mvp222(uuid),
 public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_review_issue_mvp279(text,text),
 public.cotironda_piloto_ia_publish_mvp222(uuid),
 public.cotironda_piloto_ia_ready_for_chat_mvp223(text),
 public.cotironda_piloto_ia_claim_mvp222(uuid),
 public.cotironda_piloto_ia_pdf_snapshot_mvp222(uuid,text,uuid)
 TO service_role;


-- MVP284: a Whapi API acceptance without a usable message ID cannot
-- associate a supplier reply to a specific invitation. Fail closed:
-- preserve the leased job if the caller lies, then allow an explicit
-- 'uncertain' terminal state with NO automatic retry. This overrides the
-- older MVP222 RPC already present on cotironda-piloto at schema install.
CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_finish_mvp222(
 p_request uuid,p_supplier text,p_lease uuid,p_state text,
 p_message_id text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $finish$
DECLARE n integer;
BEGIN
 IF p_request IS NULL OR p_supplier IS NULL OR p_lease IS NULL
 OR p_state NOT IN('api_accepted','uncertain')
 OR (p_state='api_accepted' AND
   (p_message_id IS NULL OR length(p_message_id) NOT BETWEEN 8 AND 160
    OR p_message_id !~ '^[A-Za-z0-9._:-]+$'))
 OR (p_state='uncertain' AND p_message_id IS NOT NULL)
 THEN RETURN false;END IF;
 UPDATE cotironda_piloto_privado.ai_dispatch_jobs_mvp222
 SET state=p_state,
     whapi_message_id=CASE WHEN p_state='api_accepted'
       THEN p_message_id ELSE NULL END,
     finished_at=clock_timestamp()
 WHERE request_id=p_request AND supplier_key=p_supplier
   AND state='leased' AND lease_token=p_lease;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END
$finish$;
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_finish_mvp222(uuid,text,uuid,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_finish_mvp222(uuid,text,uuid,text,text)
 TO service_role;

-- FIN mvp280_confirmacion_unificada_comprador.sql