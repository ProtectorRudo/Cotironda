// MVP307: PG17 real, transacción sintética con rollback. Compone fixture
// MVP306 y las funciones originales de alta MVP073 / bóveda MVP109.
import './mvp306-generar-fixture-pg17.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const oldFile=root+'supabase/tests/ci/.mvp306-generated-pg17.sql';
const target=root+'supabase/tests/ci/.mvp307-generated-pg17.sql';
const old=readFileSync(oldFile,'utf8');
const extract=(path,name)=>{
 const text=readFileSync(root+path,'utf8');
 const from=text.indexOf('create function public.'+name+'(');
 const end=text.indexOf('to service_role;',from);
 if(from<0||end<from)throw Error('original trusted SQL helper changed '+name);
 return text.slice(from,end+'to service_role;'.length);
};
const oldEnroll=extract('supabase/piloto/mvp073_whapi_private_inbox.sql',
 'cotironda_piloto_enroll_whapi_v1');
const oldBind=extract('supabase/piloto/mvp109_encrypted_contacts_consents.sql',
 'cotironda_piloto_bind_contact_mvp109');
const bootstrap=`
-- Ampliar las tablas del fixture previo a las columnas del esquema real.
ALTER TABLE cotironda_piloto_privado.whapi_inbox
 ADD COLUMN nonce_b64 text,ADD COLUMN ciphertext_b64 text,
 ADD COLUMN source_unix bigint;
-- MVP280 fixture ya incluye integration_flags.whatsapp_inbound_enabled.
ALTER TABLE cotironda_piloto_privado.participant_channels_mvp109
 ADD COLUMN contact_sha256 text,
 ADD COLUMN nonce_b64 text,ADD COLUMN ciphertext_b64 text;
-- El contacto legado de este fixture era una tabla reducida. Simular su
-- sobre AES-GCM verificado: no guardar datos reales ni registrar celulares.
UPDATE cotironda_piloto_privado.participant_channels_mvp109
 SET contact_sha256=repeat('f',64),nonce_b64=repeat('A',16),
  ciphertext_b64=repeat('B',64)
 WHERE participant_key='corralon_ailin';
CREATE TABLE cotironda_piloto_privado.enrollment_codes(
 participant_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 code_hash text NOT NULL,created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,consumed_at timestamptz
);
`;
const extraSql=bootstrap+String.fromCharCode(10)+oldEnroll+String.fromCharCode(10)+oldBind+
 String.fromCharCode(10)+String.fromCharCode(92)+'ir ../../piloto/mvp307_alta_proveedor_contacto_y_ruteo.sql'+String.fromCharCode(10);
const tests=`
DO $mvp307$
DECLARE
 code text:='0123456789abcdef0123456789abcdef';
 h text:=repeat('c',64);mh text:=repeat('beef',16);
 phrase text; digest text;result jsonb;catalog jsonb;n int;
BEGIN
 -- Usuario ya inscripto como comprador nunca puede aceptar como proveedor.
 INSERT INTO cotironda_piloto_privado.enrollment_codes
  (participant_key,code_hash,created_at,expires_at)
 VALUES('arquitecto',repeat('0',64),clock_timestamp(),clock_timestamp()+interval '1 hour');
 INSERT INTO cotironda_piloto_privado.participants(
  key,participant_role,delivery_city,chat_hmac,consent_at,
  opted_out_at,catalogue_confirmed_at,display_label
 ) VALUES('pintureria_norte','supplier','La Plata',NULL,NULL,NULL,
  clock_timestamp(),'Pinturería Norte');
 INSERT INTO cotironda_piloto_privado.catalogue_lines(
  participant_key,line_no,literal_description,family_code,recognition_state
 ) VALUES('pintureria_norte',1,'Latex interior 20L','pintura_latex','curated_family');
 INSERT INTO cotironda_piloto_privado.enrollment_codes(
  participant_key,code_hash,created_at,expires_at)
 VALUES('pintureria_norte',
  encode(sha256(convert_to(code,'UTF8')),'hex'),
  clock_timestamp(),clock_timestamp()+interval '1 hour');
 phrase:='COTI ALTA '||code||' CONTACTOS SI';
 digest:=encode(sha256(convert_to(phrase,'UTF8')),'hex');
 IF has_function_privilege('anon',
  'public.cotironda_piloto_supplier_enroll_contacts_mvp307(text,text,text,text,text,text,bigint,text,text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'mvp307_public_enroll_leak';END IF;
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('pintureria_norte')
 THEN RAISE EXCEPTION 'mvp307_without_enrollment_eligible';END IF;
 IF public.cotironda_piloto_supplier_enroll_contacts_mvp307(
  code,h,mh,repeat('A',16),repeat('B',64),repeat('9',64),
  extract(epoch from clock_timestamp())::bigint,
  repeat('7',64),repeat('C',16),repeat('D',64)
 )->>'state'<>'invalid_phrase'
 THEN RAISE EXCEPTION 'mvp307_wrong_phrase_accepted';END IF;
 IF EXISTS(SELECT 1 FROM cotironda_piloto_privado.participants
  WHERE key='pintureria_norte' AND chat_hmac IS NOT NULL)
 THEN RAISE EXCEPTION 'mvp307_invalid_phrase_mutated_identity';END IF;
 result:=public.cotironda_piloto_supplier_enroll_contacts_mvp307(
  code,h,mh,repeat('A',16),repeat('B',64),digest,
  extract(epoch from clock_timestamp())::bigint,
  repeat('7',64),repeat('C',16),repeat('D',64));
 IF result->>'state'<>'enrolled_with_contact'
 THEN RAISE EXCEPTION 'mvp307_valid_onboarding: %',result;END IF;
 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307('pintureria_norte')
 THEN RAISE EXCEPTION 'mvp307_contact_not_eligible';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.whapi_inbox
  WHERE message_hmac=mh AND plaintext_sha256=digest)<>1
 THEN RAISE EXCEPTION 'mvp307_proof_not_archived';END IF;
 IF (SELECT consumed_at IS NOT NULL FROM cotironda_piloto_privado.enrollment_codes
  WHERE participant_key='pintureria_norte') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'mvp307_code_not_consumed';END IF;
 result:=public.cotironda_piloto_supplier_enroll_contacts_mvp307(
  code,h,mh,repeat('A',16),repeat('B',64),digest,
  extract(epoch from clock_timestamp())::bigint,
  repeat('7',64),repeat('C',16),repeat('D',64));
 IF result->>'state'='enrolled_with_contact'
 THEN RAISE EXCEPTION 'mvp307_replay_allowed';END IF;
 IF (SELECT count(*) FROM cotironda_piloto_privado.supplier_enrollment_contact_proof_mvp307
  WHERE supplier_key='pintureria_norte')<>1
 THEN RAISE EXCEPTION 'mvp307_duplicate_proof';END IF;
 -- La selección no ve negocios sin permiso comercial.
 UPDATE cotironda_piloto_privado.ai_auto_release_gate_mvp306
  SET enabled=false,activated_at=NULL WHERE only_row;
 catalog:=public.cotironda_piloto_ia_catalogo_mvp220(repeat('a',64),'La Plata');
 IF catalog->>'state'<>'catalogue_snapshot'
 THEN RAISE EXCEPTION 'mvp307_catalogue_legacy_gate_off: %',catalog;END IF;
 UPDATE cotironda_piloto_privado.ai_auto_release_gate_mvp306
  SET enabled=true,activated_at=transaction_timestamp() WHERE only_row;
 catalog:=public.cotironda_piloto_ia_catalogo_mvp220(repeat('a',64),'La Plata');
 IF catalog->>'state'<>'catalogue_snapshot'
 THEN RAISE EXCEPTION 'mvp307_catalogue_gate_on: %',catalog;END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'proveedores') s
  WHERE s->>'clave'='pintureria_norte')
 THEN RAISE EXCEPTION 'mvp307_consented_supplier_missing';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'proveedores') s
  WHERE s->>'clave'='sin_confirmar')
 THEN RAISE EXCEPTION 'mvp307_nonconsented_supplier_leaked_to_ai';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'proveedores') s
  WHERE s->>'clave'='electricidad_gamma')
 THEN RAISE EXCEPTION 'mvp307_nonconsented_electricity_leaked';END IF;
 -- La revocación es inmediata aunque el catálogo ya esté guardado.
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
 SET revoked_at=clock_timestamp() WHERE participant_key='pintureria_norte';
 IF cotironda_piloto_privado.proveedor_contactable_mvp307('pintureria_norte')
 THEN RAISE EXCEPTION 'mvp307_revocation_ignored';END IF;
 catalog:=public.cotironda_piloto_ia_catalogo_mvp220(repeat('a',64),'La Plata');
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'proveedores') s
  WHERE s->>'clave'='pintureria_norte')
 THEN RAISE EXCEPTION 'mvp307_revoked_supplier_still_routed';END IF;
 -- Restaurar como solo simulacion, la transacción íntegra termina en rollback.
 UPDATE cotironda_piloto_privado.contact_reveal_consents_mvp109
 SET revoked_at=NULL WHERE participant_key='pintureria_norte';
 IF NOT cotironda_piloto_privado.proveedor_contactable_mvp307('pintureria_norte')
 THEN RAISE EXCEPTION 'mvp307_reaccept_verified_proof_denied';END IF;
END $mvp307$;
`;
if(!old.trimEnd().endsWith('ROLLBACK;'))throw Error('MVP306 fixture final changed');
const cut=old.lastIndexOf('ROLLBACK;');
writeFileSync(target,old.slice(0,cut)+extraSql+String.fromCharCode(10)+tests+String.fromCharCode(10)+'ROLLBACK;'+String.fromCharCode(10),'utf8');
console.log('MVP307 fixture generated for PostgreSQL17 with rollback.');
