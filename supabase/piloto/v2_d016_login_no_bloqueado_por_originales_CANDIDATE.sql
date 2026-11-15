-- COTIRONDA V2 D016 — CANDIDATO PARA PILOTO, NO PUBLICAR SIN «PUBLICALO».
-- Unicamente separa la autenticacion del comprador del permiso global
-- para ver originales. No habilita envios, rondas, proveedores ni documentos.
-- Para mostrar un original sigue siendo obligatorio el consentimiento
-- INDIVIDUAL V2 del proveedor + evidencia Whapi + sesion + ronda + SHA.
--
-- Esta operacion solo puede aplicarse al Supabase PILOTO exacto despues de
-- verificar nuevamente el estado del release. PostgreSQL aplica el DO
-- atomicamente: si cambia una funcion inesperadamente, aborta todo.
-- Validado previamente en cotironda-piloto dentro de BEGIN/ROLLBACK
-- sin original_share_policy y con acceso vacio y descarga bloqueada.

DO $cotironda_d016_login$
DECLARE
  rec record;
  sql_before text;
  sql_after text;
  old_gate constant text := 'cotironda_piloto_privado.v2_original_share_policy policy';
  new_gate constant text := 'cotironda_piloto_privado.v2_business_policy policy';
BEGIN
  IF to_regclass('cotironda_piloto_privado.v2_original_share_policy') IS NULL
  OR to_regclass('cotironda_piloto_privado.v2_business_policy') IS NULL
  OR to_regclass('cotironda_piloto_privado.v2_supplier_original_consents') IS NULL
  THEN
    RAISE EXCEPTION 'd016_login_required_policies_missing';
  END IF;

  -- Cambiar el criterio de acceso al portal no implica activar originales.
  IF NOT EXISTS (
    SELECT 1
    FROM cotironda_piloto_privado.v2_original_share_policy
    WHERE singleton=true AND enabled=false
  ) THEN
    RAISE EXCEPTION 'd016_login_originals_must_remain_disabled';
  END IF;

  FOR rec IN
    SELECT p.oid,p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
    AND p.proname IN (
      'cotironda_piloto_v2_d016_prepare_whapi_link_private',
      'cotironda_piloto_v2_d016_responders_private'
    )
    ORDER BY p.proname
  LOOP
    sql_before:=pg_get_functiondef(rec.oid);
    IF (
      rec.proname='cotironda_piloto_v2_d016_prepare_whapi_link_private'
      AND md5(sql_before)<>'d57eba11deb241070559be00320ff7dc'
    ) OR (
      rec.proname='cotironda_piloto_v2_d016_responders_private'
      AND md5(sql_before)<>'69cfb8ed42ed7a106f50e2596e957268'
    ) THEN
      RAISE EXCEPTION 'd016_login_function_version_mismatch:%',rec.proname;
    END IF;
    IF length(sql_before)-length(replace(sql_before,old_gate,''))
       <>length(old_gate) THEN
      RAISE EXCEPTION 'd016_login_unexpected_policy_gate:%',rec.proname;
    END IF;
    IF rec.proname='cotironda_piloto_v2_d016_responders_private'
       AND position('v2_supplier_original_consents c' IN sql_before)=0 THEN
      RAISE EXCEPTION 'd016_login_per_supplier_consent_missing';
    END IF;
    sql_after:=replace(sql_before,old_gate,new_gate);
    EXECUTE sql_after;

    IF EXISTS (
      SELECT 1 FROM pg_proc p
      WHERE p.oid=rec.oid
      AND (has_function_privilege('anon',p.oid,'EXECUTE')
        OR has_function_privilege('authenticated',p.oid,'EXECUTE')
        OR NOT has_function_privilege('service_role',p.oid,'EXECUTE'))
    ) THEN
      RAISE EXCEPTION 'd016_login_acl_regression:%',rec.proname;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n
      ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN (
        'cotironda_piloto_v2_d016_prepare_whapi_link_private',
        'cotironda_piloto_v2_d016_responders_private'))<>2
  THEN RAISE EXCEPTION 'd016_login_missing_functions';END IF;

  -- Explicitamente NO cambiar aqui v2_auto_release_d013:
  -- el despachador comercial mantiene sus barreras vigentes.
END $cotironda_d016_login$;
