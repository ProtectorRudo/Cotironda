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
