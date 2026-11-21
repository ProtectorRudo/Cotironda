-- ROLLBACK DE EMERGENCIA: revertir SOLO las dos condiciones de cobertura V2.
-- Fecha: 2026-11-18. NO desplegar sin «Publicalo». No genera mensajes.
-- Guarda la lista completa del comprador. Los PDF de cada proveedor se forman
-- SOLO con invitation_lines_mvp099, que deriva de coincidencias reales.
-- V1 y cualquier ronda que no sea V2 con calendario acreditado siguen bloqueando
-- si falta cubrir un artículo. No se cambian consentimientos, autenticación,
-- integridad de fuentes, RLS, deduplicación ni locks de publicación.
-- Source SHA verificado por lectura SQL de cotironda-piloto, sin datos privados.
-- Si cualquier función cambió, ERROR y transacción abortada: cero escritura.
DO $v2_partial_release$
DECLARE
 old_approve text;
 old_publish text;
 new_approve text;
 new_publish text;
 a_select_from text := $sel_a_from$ SELECT r.id,r.buyer_key,r.source_hmac,b.chat_hmac,
  r.timing_mode,r.round_days,r.v2_calendar_revision INTO v$sel_a_from$;
 a_select_to text := $sel_a_to$ SELECT r.id,r.buyer_key,r.source_hmac,b.chat_hmac INTO v$sel_a_to$;
 a_guard_from text := $guard_a_from$ OR (NOT (v.timing_mode IS NOT DISTINCT FROM 'business_two_days'
   AND v.round_days IS NOT DISTINCT FROM 2
   AND v.v2_calendar_revision IS NOT NULL)
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
   WHERE l.request_id=v.id AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    WHERE d.request_id=l.request_id AND d.line_no=l.line_no)))$guard_a_from$;
 a_guard_to text := $guard_a_to$ OR EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
   WHERE l.request_id=v.id AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
    WHERE d.request_id=l.request_id AND d.line_no=l.line_no))$guard_a_to$;
 p_select_from text := $sel_p_from$ SELECT r.id,r.state,r.buyer_key,r.source_hmac,r.original_request,
  r.delivery_city,r.closes_at,r.timing_mode,r.round_days,r.v2_calendar_revision$sel_p_from$;
 p_select_to text := $sel_p_to$ SELECT r.id,r.state,r.buyer_key,r.source_hmac,r.original_request,
  r.delivery_city,r.closes_at$sel_p_to$;
 p_guard_from text := $guard_p_from$ IF NOT (v_round.timing_mode IS NOT DISTINCT FROM 'business_two_days'
  AND v_round.round_days IS NOT DISTINCT FROM 2
  AND v_round.v2_calendar_revision IS NOT NULL)
 AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
  WHERE l.request_id=v_round.id AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
   WHERE d.request_id=l.request_id AND d.line_no=l.line_no))
 THEN RETURN jsonb_build_object('state','uncovered_items'); END IF;$guard_p_from$;
 p_guard_to text := $guard_p_to$ IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.request_lines l
  WHERE l.request_id=v_round.id AND NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.ai_shadow_destinos_mvp221 d
   WHERE d.request_id=l.request_id AND d.line_no=l.line_no))
 THEN RETURN jsonb_build_object('state','uncovered_items'); END IF;$guard_p_to$;
BEGIN
 IF to_regprocedure('public.cotironda_piloto_ia_auto_release_mvp306(text,text)') IS NULL
 OR to_regprocedure('public.cotironda_piloto_ia_publish_mvp222(uuid)') IS NULL
 THEN RAISE EXCEPTION 'v2_partial_functions_missing'; END IF;
 SELECT pg_get_functiondef('public.cotironda_piloto_ia_auto_release_mvp306(text,text)'::regprocedure) INTO old_approve;
 SELECT pg_get_functiondef('public.cotironda_piloto_ia_publish_mvp222(uuid)'::regprocedure) INTO old_publish;
 IF encode(extensions.digest(convert_to(old_approve,'UTF8'),'sha256'),'hex')
    <> '64e2e0451193992d7b6aa0239ba1ec84644f302c596e110fe1f232c48a549424'
 OR encode(extensions.digest(convert_to(old_publish,'UTF8'),'sha256'),'hex')
    <> 'd0187d53d37f9624167401df449f1d46e98e983d8d8ad33ced2f78e18bdff1e0'
 THEN RAISE EXCEPTION 'v2_partial_source_drifted'; END IF;
 IF length(old_approve)-length(replace(old_approve,a_select_from,''))<>length(a_select_from)
 OR length(old_approve)-length(replace(old_approve,a_guard_from,''))<>length(a_guard_from)
 OR length(old_publish)-length(replace(old_publish,p_select_from,''))<>length(p_select_from)
 OR length(old_publish)-length(replace(old_publish,p_guard_from,''))<>length(p_guard_from)
 THEN RAISE EXCEPTION 'v2_partial_anchors_not_unique'; END IF;
 new_approve:=replace(replace(old_approve,a_select_from,a_select_to),a_guard_from,a_guard_to);
 new_publish:=replace(replace(old_publish,p_select_from,p_select_to),p_guard_from,p_guard_to);
 IF new_approve=old_approve OR new_publish=old_publish
 OR encode(extensions.digest(convert_to(new_approve,'UTF8'),'sha256'),'hex')
    <> '90422ee23d4fd48821b86f06d7d31843696f5641d6dc870019bf741e278e25a1'
 OR encode(extensions.digest(convert_to(new_publish,'UTF8'),'sha256'),'hex')
    <> '1901c5fc122ff246312024d60ba39db0f595d9d50f6001d43c6a56c9d911703f'
 THEN RAISE EXCEPTION 'v2_partial_new_sha_mismatch'; END IF;
 -- CREATE OR REPLACE mantiene propietarios y permisos; nunca DROP/GRANT.
 EXECUTE new_approve;
 EXECUTE new_publish;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(
     'public.cotironda_piloto_ia_auto_release_mvp306(text,text)'::regprocedure),'UTF8'),'sha256'),'hex')
    <> '90422ee23d4fd48821b86f06d7d31843696f5641d6dc870019bf741e278e25a1'
 OR encode(extensions.digest(convert_to(pg_get_functiondef(
     'public.cotironda_piloto_ia_publish_mvp222(uuid)'::regprocedure),'UTF8'),'sha256'),'hex')
    <> '1901c5fc122ff246312024d60ba39db0f595d9d50f6001d43c6a56c9d911703f'
 OR has_function_privilege('anon','public.cotironda_piloto_ia_auto_release_mvp306(text,text)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_auto_release_mvp306(text,text)','EXECUTE')
 OR has_function_privilege('anon','public.cotironda_piloto_ia_publish_mvp222(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.cotironda_piloto_ia_publish_mvp222(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'v2_partial_postcheck_failed'; END IF;
END
$v2_partial_release$;
