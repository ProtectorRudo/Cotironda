-- Cotironda D016 P0: seguridad de reserva ligada al LEASE de MVP222.
-- CANDIDATO. No modificar políticas de publicación ni rondas históricas.
-- El contrato viejo de 5 argumentos se revoca para service_role: sólo
-- puede reservar el trabajador que recibió el lease de esa ronda/proveedor.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_original_notice_private(uuid,text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(
 p_request_id uuid,p_supplier_key text,p_chat_hmac text,
 p_notice_body_sha256 text,p_notice_version text,p_lease_token uuid
) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO ''
AS $d016$
DECLARE v_now timestamptz:=clock_timestamp();n integer:=0;
BEGIN
 IF p_request_id IS NULL OR p_supplier_key IS NULL OR
 p_chat_hmac IS NULL OR p_lease_token IS NULL OR
 p_notice_body_sha256 IS NULL OR p_notice_version IS NULL OR
 p_chat_hmac !~ '^[a-f0-9]{64}$' OR
 p_notice_body_sha256 !~ '^[a-f0-9]{64}$' OR
 p_notice_version<>'cotironda-originales-v2-respuesta-20261113'
 THEN RETURN false;END IF;
 INSERT INTO cotironda_piloto_privado.v2_d016_original_notice_ledger
 (request_id,supplier_key,chat_hmac,notice_version,notice_body_sha256,reserved_at)
 SELECT r.id,s.key,s.chat_hmac,p_notice_version,p_notice_body_sha256,v_now
 FROM cotironda_piloto_privado.requests r
 JOIN cotironda_piloto_privado.v2_original_share_policy pol
  ON pol.singleton=true AND pol.enabled=true AND pol.activated_at IS NOT NULL
  AND r.created_at>=pol.activated_at
 JOIN cotironda_piloto_privado.invitations inv
  ON inv.request_id=r.id AND inv.supplier_key=p_supplier_key
  AND inv.state='prepared' AND inv.created_at>=r.created_at
  AND inv.created_at<=v_now
 JOIN cotironda_piloto_privado.participants s
  ON s.key=inv.supplier_key AND s.participant_role='supplier'
  AND s.chat_hmac=p_chat_hmac AND s.consent_at IS NOT NULL
  AND s.consent_at<=v_now AND s.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
  ON j.request_id=r.id AND j.supplier_key=s.key
  AND j.state='leased' AND j.lease_token=p_lease_token
  AND j.leased_at IS NOT NULL
  AND j.leased_at>=inv.created_at AND j.leased_at<=v_now
 WHERE r.id=p_request_id AND s.key=p_supplier_key
  AND r.state='prepared' AND r.closes_at>v_now
  AND NOT EXISTS (
   SELECT 1 FROM cotironda_piloto_privado.v2_d016_original_notice_revocations v
   WHERE v.request_id=r.id AND v.supplier_key=s.key
  )
 ON CONFLICT (request_id,supplier_key) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN n=1;
END;
$d016$;

REVOKE ALL ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(uuid,text,text,text,text,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_v2_d016_reserve_original_notice_lease_private(uuid,text,text,text,text,uuid)
 TO service_role;
