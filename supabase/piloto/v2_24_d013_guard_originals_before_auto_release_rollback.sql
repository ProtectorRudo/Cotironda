-- Cotironda V2 PILOTO — reversión de emergencia, NO aplicar de rutina.
-- Solo para la función V2 D013 exacta; no altera policy, datos, permisos ni V1.
DO $v2_release_restore$
DECLARE
 v_prev text; v_new text;
 v_a text:=$a$ IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_policy
  WHERE singleton AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','calendar_disabled');END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy
  WHERE singleton AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','originals_disabled');END IF;$a$;
 v_b text:=$b$ IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_business_policy
  WHERE singleton AND enabled AND activated_at IS NOT NULL)
 THEN RETURN jsonb_build_object('state','calendar_disabled');END IF;$b$;
 v_c text:=$c$ JOIN cotironda_piloto_privado.v2_auto_release_policy policy
  ON policy.singleton AND policy.enabled AND r.created_at>=policy.activated_at
 JOIN cotironda_piloto_privado.v2_original_share_policy originals
  ON originals.singleton AND originals.enabled
  AND originals.activated_at IS NOT NULL
  AND r.created_at>=originals.activated_at
 WHERE r.source_hmac=p_source_hmac$c$;
 v_d text:=$d$ JOIN cotironda_piloto_privado.v2_auto_release_policy policy
  ON policy.singleton AND policy.enabled AND r.created_at>=policy.activated_at
 WHERE r.source_hmac=p_source_hmac$d$;
BEGIN
 IF to_regprocedure('public.cotironda_piloto_v2_auto_release_d013(text,text)') IS NULL
 THEN RAISE EXCEPTION 'V2 D013 rollback target missing';END IF;
 SELECT pg_get_functiondef('public.cotironda_piloto_v2_auto_release_d013(text,text)'::regprocedure)
 INTO v_prev;
 IF encode(extensions.digest(convert_to(v_prev,'UTF8'),'sha256'),'hex')
  <> 'b55b3bc7e5942d153feec417b8807c48c50cddea9a7d48b8ad5c020e812e7ca8'
 THEN RAISE EXCEPTION 'V2 D013 rollback source drifted';END IF;
 IF length(v_prev)-length(replace(v_prev,v_a,''))<>length(v_a)
 OR length(v_prev)-length(replace(v_prev,v_c,''))<>length(v_c)
 THEN RAISE EXCEPTION 'V2 D013 rollback anchors missing/duplicated';END IF;
 v_new:=replace(replace(v_prev,v_a,v_b),v_c,v_d);
 IF v_new=v_prev OR position(v_c IN v_new)>0
 THEN RAISE EXCEPTION 'V2 D013 rollback substitution invalid';END IF;
 EXECUTE v_new;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_v2_auto_release_d013(text,text)'::regprocedure
 ),'UTF8'),'sha256'),'hex')
 <> 'f25432a1d3b1b74a494a426f1ecbf54536cc9c6df2450d7a435266f6f2361da3'
 THEN RAISE EXCEPTION 'V2 D013 rollback SHA mismatch';END IF;
END $v2_release_restore$;