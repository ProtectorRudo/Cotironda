-- D016 | PILOTO CANDIDATO | 14 días para el MISMO enlace WhatsApp.
-- NO publicar sin "Publicalo". NO altera consentimientos, originales, RLS ni producción.
-- Permite reabrir el enlace durante 14 días; cada canje rota una única sesión
-- HttpOnly de 14 días. Revocaciones de ticket, comprador y empresa siguen activas.
-- Reutiliza el código y las RPC D016 existentes; no crea rutas, cron ni envíos.

DO $guard$
DECLARE
  v_issue text;
  v_claim text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_issue
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='cotironda_piloto_v2_d016_issue_ticket_private';
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_claim
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='cotironda_piloto_v2_d016_claim_session_private';
  IF md5(v_issue)<>'11c1df2f969457196d3a6fc7aec56dd6'
     OR md5(v_claim)<>'1142247b5130b78db1c8bb2d97940792'
  THEN RAISE EXCEPTION 'd016_14d_rpc_version_drift'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='cotironda_piloto_privado'
      AND t.relname='v2_d016_access_tickets'
      AND c.conname='v2_d016_access_tickets_check'
      AND pg_get_constraintdef(c.oid) LIKE '%00:10:00%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='cotironda_piloto_privado'
      AND t.relname='v2_d016_browser_sessions'
      AND c.conname='v2_d016_browser_sessions_check'
      AND pg_get_constraintdef(c.oid) LIKE '%08:00:00%'
  ) THEN RAISE EXCEPTION 'd016_14d_table_version_drift'; END IF;
END $guard$;

ALTER TABLE cotironda_piloto_privado.v2_d016_access_tickets
  DROP CONSTRAINT v2_d016_access_tickets_check;
ALTER TABLE cotironda_piloto_privado.v2_d016_access_tickets
  ADD CONSTRAINT v2_d016_access_tickets_check
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '14 days');

ALTER TABLE cotironda_piloto_privado.v2_d016_browser_sessions
  DROP CONSTRAINT v2_d016_browser_sessions_check;
ALTER TABLE cotironda_piloto_privado.v2_d016_browser_sessions
  ADD CONSTRAINT v2_d016_browser_sessions_check
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '14 days');

-- Extender la creación del enlace: mantener íntegros todos los guards existentes.
DO $patch_issue$
DECLARE v_source text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='cotironda_piloto_v2_d016_issue_ticket_private';
  IF md5(v_source)<>'11c1df2f969457196d3a6fc7aec56dd6'
  THEN RAISE EXCEPTION 'd016_14d_issue_drift'; END IF;
  v_new:=replace(v_source,
    'v_now,v_now+interval ''10 minutes''',
    'v_now,v_now+interval ''14 days''');
  IF v_new=v_source THEN RAISE EXCEPTION 'd016_14d_issue_anchor_missing'; END IF;
  EXECUTE v_new;
END $patch_issue$;

-- El mismo link debe poder abrirse nuevamente. Un token válido y NO revocado
-- rota la sesión (la cookie anterior deja de servir); nunca da acceso cruzado.
-- El guard de comprador/ronda/Whapi en la RPC original se mantiene sin alterar.
DO $patch_claim$
DECLARE v_source text;v_new text;v_old text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='cotironda_piloto_v2_d016_claim_session_private';
  IF md5(v_source)<>'1142247b5130b78db1c8bb2d97940792'
  THEN RAISE EXCEPTION 'd016_14d_claim_drift'; END IF;

  v_old:='UPDATE cotironda_piloto_privado.v2_d016_access_tickets t
  SET consumed_at=v_now
  WHERE t.ticket_hmac=p_ticket_hmac
   AND t.consumed_at IS NULL AND t.revoked_at IS NULL';
  v_new:=replace(v_source,v_old,
    'SELECT t.ticket_hmac,t.buyer_key,t.request_id,t.chat_hmac
  FROM cotironda_piloto_privado.v2_d016_access_tickets t
  WHERE t.ticket_hmac=p_ticket_hmac
   AND t.revoked_at IS NULL');
  IF v_new=v_source THEN RAISE EXCEPTION 'd016_14d_claim_select_anchor_missing'; END IF;

  v_source:=v_new;
  v_new:=replace(v_source,
    'RETURNING t.ticket_hmac,t.buyer_key,t.request_id,t.chat_hmac',
    'FOR UPDATE OF t');
  IF v_new=v_source THEN RAISE EXCEPTION 'd016_14d_claim_lock_anchor_missing'; END IF;

  v_source:=v_new;
  v_new:=replace(v_source,
    'c.chat_hmac,v_now,v_now+interval ''8 hours''
 FROM claimed c
 RETURNING sesion_hmac INTO v_created;',
    'c.chat_hmac,v_now,v_now+interval ''14 days''
 FROM claimed c
 ON CONFLICT (ticket_hmac) DO UPDATE SET
  sesion_hmac=EXCLUDED.sesion_hmac,
  created_at=EXCLUDED.created_at,
  expires_at=EXCLUDED.expires_at,
  revoked_at=NULL
 RETURNING sesion_hmac INTO v_created;
 IF v_created IS NOT NULL THEN
  UPDATE cotironda_piloto_privado.v2_d016_access_tickets
  SET consumed_at=COALESCE(consumed_at,v_now)
  WHERE ticket_hmac=p_ticket_hmac;
 END IF;');
  IF v_new=v_source THEN RAISE EXCEPTION 'd016_14d_claim_upsert_anchor_missing'; END IF;
  EXECUTE v_new;
END $patch_claim$;

-- Recupera solamente el enlace YA ENTREGADO de la ronda real de piloto:
-- mismo HMAC, sin otro WhatsApp y sin tocar las siete rondas históricas.
UPDATE cotironda_piloto_privado.v2_d016_access_tickets
 SET expires_at=created_at+interval '14 days'
 WHERE request_id='665759f0-251b-4a2b-afb4-d763612366f7'::uuid
   AND revoked_at IS NULL
   AND expires_at=created_at+interval '10 minutes';

-- Todas las funciones permanecen exclusivamente server-side.
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_issue_ticket_private(
 text,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d016_claim_session_private(
 text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_issue_ticket_private(
 text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d016_claim_session_private(
 text,text) TO service_role;
