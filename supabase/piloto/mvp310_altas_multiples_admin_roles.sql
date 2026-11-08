-- Cotironda MVP310: múltiples compradores/proveedores con autorización ya
-- declarada por administrador. Desarrollo y pruebas; NO desplegar con Luz verde.
-- Requiere MVP072 + las alteraciones vigentes + MVP308 y MVP309.
-- Conserva identidades anteriores, privados y registro comercial preexistente.

-- El MVP072 limitaba el piloto a tres claves y hacía equivaler "comprador"
-- con la clave literal "arquitecto". Sustituir por una validación de rol real.
ALTER TABLE cotironda_piloto_privado.participants
 DROP CONSTRAINT participants_key_check;
ALTER TABLE cotironda_piloto_privado.participants
 DROP CONSTRAINT participants_check;
ALTER TABLE cotironda_piloto_privado.participants
 ADD CONSTRAINT participants_key_mvp310
 CHECK(key ~ '^[a-z][a-z0-9_]{2,60}$');
ALTER TABLE cotironda_piloto_privado.participants
 ADD CONSTRAINT participants_role_city_mvp310
 CHECK(
  (participant_role='buyer' AND delivery_city IS NULL) OR
  (participant_role='supplier' AND delivery_city IS NOT NULL)
 );

CREATE OR REPLACE FUNCTION cotironda_piloto_privado.reject_role_mutation_mvp310()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $immutable_role$
BEGIN
 IF NEW.key IS DISTINCT FROM OLD.key OR
    NEW.participant_role IS DISTINCT FROM OLD.participant_role
 THEN RAISE EXCEPTION 'mvp310_participant_role_immutable' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $immutable_role$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.reject_role_mutation_mvp310()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER participant_role_immutable_mvp310
 BEFORE UPDATE OF key,participant_role
 ON cotironda_piloto_privado.participants
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.reject_role_mutation_mvp310();

-- El comprador se determina por su rol REAL y vinculación autenticada.
-- Nunca aceptar un proveedor como buyer_key al abrir ni transferir la ronda.
ALTER TABLE cotironda_piloto_privado.requests
 DROP CONSTRAINT requests_buyer_key_check;
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.verify_request_buyer_mvp310()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $buyer$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.participants p
  WHERE p.key=NEW.buyer_key AND p.participant_role='buyer'
   AND p.chat_hmac IS NOT NULL AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
 ) THEN RAISE EXCEPTION 'mvp310_buyer_not_verified' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $buyer$;
REVOKE ALL ON FUNCTION cotironda_piloto_privado.verify_request_buyer_mvp310()
 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER requests_buyer_verified_mvp310
 BEFORE INSERT OR UPDATE OF buyer_key
 ON cotironda_piloto_privado.requests
 FOR EACH ROW EXECUTE FUNCTION
 cotironda_piloto_privado.verify_request_buyer_mvp310();

-- Una declaración corresponde a un participante, no puede utilizarse para
-- crear cuentas duplicadas bajo la misma instrucción del responsable.
CREATE UNIQUE INDEX admin_auth_source_unique_mvp310
 ON cotironda_piloto_privado.admin_authorizations_mvp309(source_reference);

-- SOLO SQL Editor con una sesión postgres real; no hay alta abierta
-- desde browser, webhook ni service_role. El número nunca se recibe aquí.
-- El HMAC/canal WhatsApp cifrado debe verificarse después en una ruta segura.
CREATE OR REPLACE FUNCTION cotironda_piloto_privado.admin_create_participant_mvp310(
 p_role text,p_display_label text,p_supplier_city text,p_source_reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=''
AS $create$
DECLARE v_key text;v_label text;v_city text;v_old record;v_result jsonb;
BEGIN
 IF current_user<>'postgres' OR session_user<>'postgres'
 THEN RAISE EXCEPTION 'mvp310_admin_session_required' USING ERRCODE='42501';END IF;
 IF p_role NOT IN ('buyer','supplier')
  OR p_display_label IS NULL OR
   length(pg_catalog.btrim(p_display_label)) NOT BETWEEN 3 AND 80
  OR p_display_label ~ '[[:cntrl:]<>]' OR p_display_label ~ '[0-9]{8,}'
  OR p_source_reference IS NULL OR
   p_source_reference !~ '^[a-z0-9][a-z0-9:_-]{11,119}$'
 THEN RETURN jsonb_build_object('state','invalid');END IF;
 v_label:=pg_catalog.btrim(p_display_label);
 v_city:=pg_catalog.nullif(pg_catalog.btrim(p_supplier_city),'');
 IF p_role='buyer' THEN
  IF v_city IS NOT NULL THEN RETURN jsonb_build_object('state','buyer_city_not_allowed');END IF;
 ELSE
  IF v_city IS NULL OR length(v_city) NOT BETWEEN 3 AND 80
   OR v_city ~ '[[:cntrl:]<>]'
  THEN RETURN jsonb_build_object('state','invalid_supplier_city');END IF;
  IF EXISTS(
   SELECT 1 FROM cotironda_piloto_privado.participants p
   WHERE p.participant_role='supplier' AND p.opted_out_at IS NULL
    AND pg_catalog.lower(pg_catalog.btrim(p.display_label))
     =pg_catalog.lower(v_label)
    AND pg_catalog.lower(pg_catalog.btrim(p.delivery_city))
     =pg_catalog.lower(v_city)
  ) THEN RETURN jsonb_build_object('state','duplicate_supplier_label_city');END IF;
 END IF;

 -- Serialize retries by source reference, even with concurrent operators.
 PERFORM pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended(p_source_reference,310));
 SELECT p.key,p.participant_role,p.display_label,p.delivery_city
 INTO v_old
 FROM cotironda_piloto_privado.admin_authorizations_mvp309 a
 JOIN cotironda_piloto_privado.participants p ON p.key=a.participant_key
 WHERE a.source_reference=p_source_reference;
 IF FOUND THEN
  IF v_old.participant_role<>p_role OR v_old.display_label<>v_label
    OR v_old.delivery_city IS DISTINCT FROM v_city
  THEN RETURN jsonb_build_object('state','source_reference_conflict');END IF;
  IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.admin_authorization_revocations_mvp309
    WHERE participant_key=v_old.key)
  THEN RETURN jsonb_build_object('state','revoked');END IF;
  RETURN jsonb_build_object('state','already_created','participant_key',v_old.key);
 END IF;

 v_key:=p_role||'_'||pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-','');
 INSERT INTO cotironda_piloto_privado.participants(
  key,display_label,participant_role,delivery_city
 ) VALUES(v_key,v_label,p_role,v_city);
 v_result:=cotironda_piloto_privado.admin_record_permission_mvp309(
  v_key,p_role,p_source_reference);
 IF v_result->>'state'<>'recorded'
 THEN RAISE EXCEPTION 'mvp310_operator_attestation_failed' USING ERRCODE='23514';END IF;
 RETURN jsonb_build_object('state','created','participant_key',v_key,
  'role',p_role,'terms_authority','operator_statement',
  'whatsapp_linked',false,'contact_disclosed',false);
END $create$;
REVOKE ALL ON FUNCTION
 cotironda_piloto_privado.admin_create_participant_mvp310(text,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
