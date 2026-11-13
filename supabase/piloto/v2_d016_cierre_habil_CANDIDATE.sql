-- D016 CIERRE automático PILOTO, CANDIDATO SIN INSTALAR.
-- SOLO r.state=prepared, 2 días hábiles locales, festivos oficiales ya
-- registrados y calendarios año/localidad/revisión aprobados PROSPECTIVAMENTE.
-- SIN calendarios = NULL = ningún cierre. No tocar histórico ni envíos Whapi.
-- Requiere v2_business_calendar, v2_business_holidays, v2_auto_release_policy,
-- v2_business_policy, v2_original_share_policy y requests V2.
CREATE TABLE cotironda_piloto_privado.v2_d016_closure_audit(
 request_id uuid PRIMARY KEY REFERENCES cotironda_piloto_privado.requests(id),
 expected_deadline timestamptz NOT NULL,
 closed_at timestamptz NOT NULL,
 calendar_revision text NOT NULL,
 locality text NOT NULL,
 source text NOT NULL DEFAULT 'v2_d016_close_due_private'
  CHECK(source='v2_d016_close_due_private')
);
ALTER TABLE cotironda_piloto_privado.v2_d016_closure_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_closure_audit
 FROM PUBLIC,anon,authenticated,service_role;
-- Acceso mediante SECURITY DEFINER auditado, jamás SELECT desde navegador.

-- Dos días HÁBILES después de la creación, preservando hora Argentina,
-- consultando todos los años involucrados. No supone feriados por defecto:
-- requiere aprobación del calendario completo; los feriados están en tabla.
CREATE FUNCTION public.cotironda_piloto_v2_d016_expected_close_private(
 p_created_at timestamptz,p_locality text,p_revision text
) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $deadline$
DECLARE v_day date;v_start_year integer;v_count integer:=0;v_step integer;
BEGIN
 IF p_created_at IS NULL OR p_locality IS NULL OR
  length(btrim(p_locality)) NOT BETWEEN 3 AND 100 OR
  p_revision IS NULL OR length(btrim(p_revision)) NOT BETWEEN 3 AND 120
 THEN RETURN NULL;END IF;
 v_day=(p_created_at AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;
 v_start_year=extract(year from v_day)::integer;
 -- Rechazar si el año de inicio no estaba aprobado ANTES del pedido.
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar cal
  WHERE lower(btrim(cal.locality))=lower(btrim(p_locality))
   AND cal.year=v_start_year AND cal.revision=p_revision
   AND cal.approved_at IS NOT NULL AND cal.approved_at<=p_created_at
 ) THEN RETURN NULL;END IF;
 FOR v_step IN 1..370 LOOP
  v_day:=v_day+1;
  IF NOT EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_business_calendar cal
   WHERE lower(btrim(cal.locality))=lower(btrim(p_locality))
    AND cal.year=extract(year from v_day)::integer
    AND cal.revision=p_revision AND cal.approved_at IS NOT NULL
    AND cal.approved_at<=p_created_at
  ) THEN RETURN NULL;END IF;
  IF extract(isodow from v_day)::integer IN (6,7) THEN CONTINUE;END IF;
  IF EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.v2_business_holidays h
   WHERE lower(btrim(h.locality))=lower(btrim(p_locality))
    AND h.day=v_day AND h.calendar_year=extract(year from v_day)::integer
  ) THEN CONTINUE;END IF;
  v_count:=v_count+1;
  IF v_count=2 THEN
   -- El contrato real de requests exige SIEMPRE cierre a las 18:00 AR.
   -- Jamás conservar la hora de ingreso del pedido.
   RETURN (v_day+time '18:00:00') AT TIME ZONE 'America/Argentina/Buenos_Aires';
  END IF;
 END LOOP;
 RETURN NULL;
END $deadline$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_expected_close_private(
 timestamptz,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_expected_close_private(
 timestamptz,text,text) TO service_role;

CREATE FUNCTION public.cotironda_piloto_v2_d016_close_due_private(
 p_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $close$
DECLARE v_rec record;v_expected timestamptz;
 v_closed integer:=0;v_skipped integer:=0;
 v_now timestamptz:=clock_timestamp();
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5
 THEN RETURN jsonb_build_object('state','invalid_limit','closed',0);END IF;
 -- Garantía comercial: cinco flags V2 independientes deben estar activos
 -- antes de modificar rondas. No habilita flags ni aprueba calendarios.
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.v2_business_policy b
  JOIN cotironda_piloto_privado.v2_original_share_policy s
   ON s.singleton=true AND s.enabled=true AND s.activated_at IS NOT NULL
  JOIN cotironda_piloto_privado.v2_auto_release_policy a
   ON a.singleton=true AND a.enabled=true AND a.activated_at IS NOT NULL
  WHERE b.singleton=true AND b.enabled=true AND b.activated_at IS NOT NULL
 ) THEN RETURN jsonb_build_object('state','disabled','closed',0);END IF;

 FOR v_rec IN
  SELECT r.id,r.created_at,r.closes_at,r.delivery_city,
   r.v2_calendar_revision
  FROM cotironda_piloto_privado.requests r
  JOIN cotironda_piloto_privado.v2_business_policy b
   ON b.singleton=true AND b.enabled=true AND b.activated_at IS NOT NULL
   AND b.activated_at<=r.created_at
  JOIN cotironda_piloto_privado.v2_original_share_policy s
   ON s.singleton=true AND s.enabled=true AND s.activated_at IS NOT NULL
   AND s.activated_at<=r.created_at
  JOIN cotironda_piloto_privado.v2_auto_release_policy a
   ON a.singleton=true AND a.enabled=true AND a.activated_at IS NOT NULL
   AND a.activated_at<=r.created_at
  JOIN cotironda_piloto_privado.participants buyer
   ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.consent_at<=r.created_at
   AND buyer.opted_out_at IS NULL
  JOIN cotironda_piloto_privado.participant_channels_mvp109 channel
   ON channel.participant_key=buyer.key AND channel.chat_hmac=buyer.chat_hmac
  JOIN cotironda_piloto_privado.whapi_inbox proof
   ON proof.message_hmac=channel.authenticated_message_hmac
   AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
  WHERE r.state='prepared' AND r.timing_mode='business_two_days'
   AND r.round_days=2 AND r.v2_calendar_revision IS NOT NULL
   AND r.closes_at IS NOT NULL AND r.closes_at<=v_now
   AND r.closes_at>r.created_at
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 x
    JOIN cotironda_piloto_privado.participants other
     ON other.key=x.participant_key
    WHERE x.contact_sha256=channel.contact_sha256
     AND x.participant_key<>buyer.key
     AND other.participant_role='buyer' AND other.opted_out_at IS NULL
   )
  ORDER BY r.closes_at,r.id
  FOR UPDATE OF r SKIP LOCKED LIMIT p_limit
 LOOP
  v_expected:=public.cotironda_piloto_v2_d016_expected_close_private(
   v_rec.created_at,v_rec.delivery_city,v_rec.v2_calendar_revision);
  IF v_expected IS NULL OR v_expected<>v_rec.closes_at OR v_expected>v_now
  THEN v_skipped:=v_skipped+1;CONTINUE;END IF;
  UPDATE cotironda_piloto_privado.requests
  SET state='closed',closed_at=v_now
  WHERE id=v_rec.id AND state='prepared'
   AND timing_mode='business_two_days' AND round_days=2
   AND closes_at=v_expected;
  IF FOUND THEN
   INSERT INTO cotironda_piloto_privado.v2_d016_closure_audit(
    request_id,expected_deadline,closed_at,calendar_revision,locality
   ) VALUES(v_rec.id,v_expected,v_now,v_rec.v2_calendar_revision,
    v_rec.delivery_city);
   v_closed:=v_closed+1;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('state','checked','closed',v_closed,
  'skipped',v_skipped);
END $close$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_close_due_private(
 integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_close_due_private(
 integer) TO service_role;
