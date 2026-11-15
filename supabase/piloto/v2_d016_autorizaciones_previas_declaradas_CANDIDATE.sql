-- PILOTO CANDIDATO, NO DESPLEGAR SIN "PUBLICALO".
-- Dos proveedores YA autorizados según declaración del propietario en esta conversación.
-- Registro auditado de testimonio del PROPIETARIO; no se finge mensaje de WhatsApp
-- ni fecha histórica de aceptación. SOLO la ronda real del 15/11/2026.
DO $pre$ BEGIN
 IF (SELECT count(*) FROM cotironda_piloto_privado.participants p JOIN cotironda_piloto_privado.invitations i ON i.supplier_key=p.key
     WHERE i.request_id='665759f0-251b-4a2b-afb4-d763612366f7'::uuid AND p.key IN('corralon_ailin','corralon_nahuel')
      AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
      AND p.opted_out_at IS NULL AND p.consent_at<=i.created_at)<>2
 THEN RAISE EXCEPTION 'd016_owner_consent_supplier_drift'; END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy WHERE singleton AND enabled=false)
 THEN RAISE EXCEPTION 'd016_owner_consent_policy_drift'; END IF;
END $pre$;
CREATE TABLE cotironda_piloto_privado.v2_d016_owner_original_attestations(
 supplier_key text NOT NULL REFERENCES cotironda_piloto_privado.participants(key),
 request_id uuid NOT NULL REFERENCES cotironda_piloto_privado.requests(id),
 attested_by text NOT NULL CHECK(attested_by='responsable_cotironda'),
 evidence_kind text NOT NULL CHECK(evidence_kind='declaracion_responsable_en_conversacion'),
 consent_scope text NOT NULL CHECK(consent_scope='comprador_original_identificado_y_analisis_v2'),
 declaration_sha256 text NOT NULL CHECK(declaration_sha256 ~ '^[a-f0-9]{64}$'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_at timestamptz,
 PRIMARY KEY(supplier_key,request_id),
 CHECK(revoked_at IS NULL OR revoked_at>=recorded_at)
);
ALTER TABLE cotironda_piloto_privado.v2_d016_owner_original_attestations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_d016_owner_original_attestations FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON cotironda_piloto_privado.v2_d016_owner_original_attestations TO service_role;
-- Constancia inmutable: solo se puede revocar una vez; no borrar, editar ni rehabilitar.
CREATE FUNCTION cotironda_piloto_privado.v2_d016_owner_attestation_immutable_private()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $immutable$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'owner_consent_attestation_cannot_delete'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
   OR NEW.revoked_at<OLD.recorded_at
   OR ROW(NEW.supplier_key,NEW.request_id,NEW.attested_by,NEW.evidence_kind,
          NEW.consent_scope,NEW.declaration_sha256,NEW.recorded_at)
      IS DISTINCT FROM
      ROW(OLD.supplier_key,OLD.request_id,OLD.attested_by,OLD.evidence_kind,
          OLD.consent_scope,OLD.declaration_sha256,OLD.recorded_at)
  THEN RAISE EXCEPTION 'owner_consent_attestation_immutable'; END IF;
 END IF;
 RETURN NEW;
END $immutable$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_d016_owner_attestation_immutable_private()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER v2_d016_owner_attestation_immutable
 BEFORE UPDATE OR DELETE ON cotironda_piloto_privado.v2_d016_owner_original_attestations
 FOR EACH ROW EXECUTE FUNCTION cotironda_piloto_privado.v2_d016_owner_attestation_immutable_private();
CREATE FUNCTION cotironda_piloto_privado.v2_d016_effective_original_consent_private(
 p_supplier_key text,p_request_id uuid,p_chat_hmac text,p_invited_at timestamptz
) RETURNS timestamptz LANGUAGE sql STABLE SET search_path TO '' AS $effective$
SELECT CASE WHEN EXISTS (
 SELECT 1 FROM cotironda_piloto_privado.participants p
 WHERE p.key=p_supplier_key AND p.chat_hmac=p_chat_hmac
  AND p.participant_role='supplier' AND p.consent_at<=p_invited_at AND p.opted_out_at IS NULL
) AND NOT EXISTS (
 SELECT 1 FROM cotironda_piloto_privado.v2_supplier_original_consents revoked
 WHERE revoked.supplier_key=p_supplier_key AND revoked.revoked_at IS NOT NULL
) AND NOT EXISTS(
 SELECT 1 FROM cotironda_piloto_privado.v2_d016_supplier_original_optout_events opt WHERE opt.supplier_key=p_supplier_key
) THEN COALESCE(
 (SELECT c.accepted_at
  FROM cotironda_piloto_privado.v2_supplier_original_consents c
  JOIN cotironda_piloto_privado.whapi_inbox msg ON msg.message_hmac=c.consent_message_hmac
   AND msg.participant_key=c.supplier_key AND msg.chat_hmac=p_chat_hmac
   AND msg.kind='text' AND msg.received_at=c.accepted_at
  JOIN cotironda_piloto_privado.v2_business_policy bp ON bp.singleton AND bp.enabled
  WHERE c.supplier_key=p_supplier_key AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL AND c.accepted_at>=bp.activated_at
   AND c.accepted_at<=p_invited_at LIMIT 1),
 (SELECT att.recorded_at FROM cotironda_piloto_privado.v2_d016_owner_original_attestations att
  WHERE att.supplier_key=p_supplier_key AND att.request_id=p_request_id
   AND att.revoked_at IS NULL AND att.consent_scope='comprador_original_identificado_y_analisis_v2'
   AND att.recorded_at<=clock_timestamp() LIMIT 1)
) ELSE NULL END
$effective$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.v2_d016_effective_original_consent_private(text,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION cotironda_piloto_privado.v2_d016_effective_original_consent_private(text,uuid,text,timestamptz) TO service_role;

DO $patch$ DECLARE v_old text; v_new text; BEGIN
SELECT pg_get_functiondef(p.oid) INTO STRICT v_new FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_responders_private';
IF md5(v_new)<>'ceec899b38d8df2303407196775d1505' THEN RAISE EXCEPTION 'version_drift_cotironda_piloto_v2_d016_responders_private'; END IF;
v_old:=v_new;v_new:=replace(v_new,$find0$  JOIN cotironda_piloto_privado.v2_supplier_original_consents c
   ON c.supplier_key=supplier.key
   AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL
   AND c.accepted_at>=v_activation
   AND c.accepted_at<=inv.created_at
  JOIN cotironda_piloto_privado.whapi_inbox consent_msg
   ON consent_msg.message_hmac=c.consent_message_hmac
   AND consent_msg.participant_key=supplier.key
   AND consent_msg.chat_hmac=supplier.chat_hmac
   AND consent_msg.kind='text'
   AND consent_msg.received_at=c.accepted_at$find0$,$repl0$  JOIN LATERAL (SELECT cotironda_piloto_privado.v2_d016_effective_original_consent_private(supplier.key,r.id,supplier.chat_hmac,inv.created_at) AS accepted_at) c ON c.accepted_at IS NOT NULL$repl0$);
IF v_old=v_new THEN RAISE EXCEPTION 'missing_anchor_cotironda_piloto_v2_d016_responders_private_0'; END IF;
v_old:=v_new;v_new:=replace(v_new,$find1$ IF p_request_id IS NULL OR p_sesion_hmac IS NULL
 THEN RETURN NULL;END IF;$find1$,$repl1$ IF p_request_id IS NULL OR p_sesion_hmac IS NULL
 THEN RETURN NULL;END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy WHERE singleton=true AND enabled=true) THEN RETURN NULL; END IF;$repl1$);
IF v_old=v_new THEN RAISE EXCEPTION 'missing_anchor_cotironda_piloto_v2_d016_responders_private_1'; END IF;
EXECUTE v_new; END $patch$;

DO $patch$ DECLARE v_old text; v_new text; BEGIN
SELECT pg_get_functiondef(p.oid) INTO STRICT v_new FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='cotironda_piloto_v2_d016_original_source_private';
IF md5(v_new)<>'3ed5b9407829f2ad53ba321aee096ef5' THEN RAISE EXCEPTION 'version_drift_cotironda_piloto_v2_d016_original_source_private'; END IF;
v_old:=v_new;v_new:=replace(v_new,$find0$  JOIN cotironda_piloto_privado.v2_supplier_original_consents c
   ON c.supplier_key=supplier.key
   AND c.version='cotironda-originales-v2'
   AND c.revoked_at IS NULL
  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
   AND inv.state='prepared'
   AND c.accepted_at<=inv.created_at$find0$,$repl0$  JOIN cotironda_piloto_privado.invitations inv
   ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
   AND inv.state='prepared'
  JOIN LATERAL (SELECT cotironda_piloto_privado.v2_d016_effective_original_consent_private(supplier.key,link.request_id,supplier.chat_hmac,inv.created_at) AS accepted_at) c ON c.accepted_at IS NOT NULL$repl0$);
IF v_old=v_new THEN RAISE EXCEPTION 'missing_anchor_cotironda_piloto_v2_d016_original_source_private_0'; END IF;
v_old:=v_new;v_new:=replace(v_new,$find1$   JOIN cotironda_piloto_privado.v2_supplier_original_consents c
    ON c.supplier_key=link.supplier_key
    AND c.version='cotironda-originales-v2'
    AND c.revoked_at IS NULL
   JOIN cotironda_piloto_privado.invitations inv
    ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
    AND inv.state='prepared' AND c.accepted_at<=inv.created_at$find1$,$repl1$   JOIN cotironda_piloto_privado.invitations inv
    ON inv.request_id=link.request_id AND inv.supplier_key=link.supplier_key
    AND inv.state='prepared'
   JOIN LATERAL (SELECT cotironda_piloto_privado.v2_d016_effective_original_consent_private(link.supplier_key,link.request_id,m.chat_hmac,inv.created_at) AS accepted_at) c ON c.accepted_at IS NOT NULL$repl1$);
IF v_old=v_new THEN RAISE EXCEPTION 'missing_anchor_cotironda_piloto_v2_d016_original_source_private_1'; END IF;
v_old:=v_new;v_new:=replace(v_new,$find2$ IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;$find2$,$repl2$ IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.v2_original_share_policy WHERE singleton=true AND enabled=true) THEN RETURN NULL; END IF;$repl2$);
IF v_old=v_new THEN RAISE EXCEPTION 'missing_anchor_cotironda_piloto_v2_d016_original_source_private_2'; END IF;
EXECUTE v_new; END $patch$;

-- Una sola constancia del responsable por proveedor y ronda, SIN backdating.
INSERT INTO cotironda_piloto_privado.v2_d016_owner_original_attestations
(supplier_key,request_id,attested_by,evidence_kind,consent_scope,declaration_sha256)
SELECT v.key,'665759f0-251b-4a2b-afb4-d763612366f7'::uuid,'responsable_cotironda',
 'declaracion_responsable_en_conversacion','comprador_original_identificado_y_analisis_v2',
 encode(extensions.digest(convert_to('Ailín y Nahuel ya dieron sus consentimiento avanza','UTF8'),'sha256'),'hex')
FROM (VALUES('corralon_ailin'),('corralon_nahuel')) AS v(key);
UPDATE cotironda_piloto_privado.v2_original_share_policy
SET enabled=true,activated_at=clock_timestamp() WHERE singleton=true AND enabled=false;