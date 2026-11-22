-- D022: PG17 aislado y sintético. No toca ninguna base real.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA cotironda_piloto_privado;
CREATE SCHEMA storage;
CREATE TABLE cotironda_piloto_privado.participants (
 key text PRIMARY KEY,display_label text NOT NULL,
 participant_role text NOT NULL,opted_out_at timestamptz
);
CREATE TABLE storage.buckets (
 id text PRIMARY KEY,name text NOT NULL,public boolean NOT NULL,
 file_size_limit bigint,allowed_mime_types text[]
);
-- Simulador de la función existente: la RPC D022 debe invocarla,
-- jamás inventar proveedor por el ID que envíe el navegador.
CREATE FUNCTION public.cotironda_piloto_v2_d016_original_source_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb LANGUAGE sql STABLE AS $stub$
 SELECT CASE WHEN p_sesion_hmac='sesion-autorizada'
  AND p_request_id='11111111-1111-4111-8111-111111111111'::uuid
  AND p_document_id='22222222-2222-4222-8222-222222222222'::uuid
 THEN jsonb_build_object(
  'state','authorized_original_v2','supplierKey','corralon_a',
  'requestId',p_request_id::text,'documentId',p_document_id::text
 ) ELSE NULL END
$stub$;
INSERT INTO cotironda_piloto_privado.participants(key,display_label,participant_role)
 VALUES ('corralon_a','Corralón A','supplier'),('corralon_b','Corralón B','supplier');
COMMIT;
\ir ../../piloto/v2_d022_supplier_business_profiles_CANDIDATE.sql
DO $check$
DECLARE
 rid uuid:='11111111-1111-4111-8111-111111111111';
 doc uuid:='22222222-2222-4222-8222-222222222222';
 res jsonb;
BEGIN
 IF has_table_privilege('anon','cotironda_piloto_privado.supplier_business_profiles_d022','SELECT')
 OR has_function_privilege('anon','public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Public read forbidden';END IF;
 IF (SELECT public FROM storage.buckets WHERE id='cotironda-piloto-perfiles') IS DISTINCT FROM false
 THEN RAISE EXCEPTION 'Storage bucket must remain private';END IF;
 IF public.cotironda_piloto_v2_d022_profile_private(rid,'sesion-invalida',doc) IS NOT NULL
 THEN RAISE EXCEPTION 'Session bypass';END IF;
 IF public.cotironda_piloto_v2_d022_profile_private(rid,'sesion-autorizada','33333333-3333-4333-8333-333333333333'::uuid) IS NOT NULL
 THEN RAISE EXCEPTION 'Document bypass';END IF;
 res:=public.cotironda_piloto_v2_d022_profile_private(rid,'sesion-autorizada',doc);
 IF res->>'comercio' IS DISTINCT FROM 'Corralón A'
 OR res->>'whatsapp' IS NOT NULL OR res->>'direccion' IS NOT NULL
 THEN RAISE EXCEPTION 'No consent must not reveal commercial data';END IF;

 INSERT INTO cotironda_piloto_privado.supplier_business_profiles_d022(
  supplier_key,rubro,direccion,localidad,pais,whatsapp_e164,
  consentimiento_version,consentimiento_evidencia_hmac,consentido_en
 ) VALUES('corralon_a','Materiales para construcción','Calle Falsa 123',
  'La Plata','Argentina','+5492215551234',
  'D022-2026-11-22',repeat('a',64),now());
 res:=public.cotironda_piloto_v2_d022_profile_private(rid,'sesion-autorizada',doc);
 IF res->>'rubro' IS DISTINCT FROM 'Materiales para construcción'
 OR res->>'whatsapp' IS NOT NULL
 THEN RAISE EXCEPTION 'Phone must be explicitly verified';END IF;

 UPDATE cotironda_piloto_privado.supplier_business_profiles_d022
 SET whatsapp_verificado_en=now() WHERE supplier_key='corralon_a';
 res:=public.cotironda_piloto_v2_d022_profile_private(rid,'sesion-autorizada',doc);
 IF res->>'whatsapp' IS DISTINCT FROM '+5492215551234'
 OR res->>'direccion' IS DISTINCT FROM 'Calle Falsa 123'
 OR res->>'comercio' IS DISTINCT FROM 'Corralón A'
 THEN RAISE EXCEPTION 'Valid consented profile should display only own data';END IF;

 UPDATE cotironda_piloto_privado.supplier_business_profiles_d022
 SET revocado_en=now() WHERE supplier_key='corralon_a';
 res:=public.cotironda_piloto_v2_d022_profile_private(rid,'sesion-autorizada',doc);
 IF res->>'whatsapp' IS NOT NULL OR res->>'direccion' IS NOT NULL
 THEN RAISE EXCEPTION 'Revocation not honored';END IF;
 RAISE NOTICE 'D022 synthetic PG17 controls OK';
END;
$check$;
