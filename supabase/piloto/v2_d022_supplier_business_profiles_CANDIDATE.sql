-- D022 · Ficha comercial para un proveedor QUE RESPONDIO a la ronda.
-- CANDIDATE ONLY: no ejecutar ni publicar hasta autorizar deploy PILOTO.
-- No migrar contactos internos Whapi a perfiles. Solo datos comerciales
-- que el proveedor autorizo expresamente a mostrar al comprador.
BEGIN;

CREATE TABLE IF NOT EXISTS cotironda_piloto_privado.supplier_business_profiles_d022 (
 supplier_key text PRIMARY KEY REFERENCES cotironda_piloto_privado.participants(key),
 rubro text,
 direccion text,
 localidad text,
 pais text DEFAULT 'Argentina',
 whatsapp_e164 text,
 foto_path text,
 consentimiento_version text,
 consentimiento_evidencia_hmac text,
 consentido_en timestamptz,
 revocado_en timestamptz,
 whatsapp_verificado_en timestamptz,
 actualizado_en timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT d022_rubro CHECK (rubro IS NULL OR (length(rubro) BETWEEN 2 AND 90 AND rubro !~ '[<>[:cntrl:]]')),
 CONSTRAINT d022_direccion CHECK (direccion IS NULL OR (length(direccion) BETWEEN 5 AND 190 AND direccion !~ '[<>[:cntrl:]]')),
 CONSTRAINT d022_localidad CHECK (localidad IS NULL OR (length(localidad) BETWEEN 2 AND 90 AND localidad !~ '[<>[:cntrl:]]')),
 CONSTRAINT d022_pais CHECK (pais IS NULL OR (length(pais) BETWEEN 2 AND 70 AND pais !~ '[<>[:cntrl:]]')),
 CONSTRAINT d022_whatsapp CHECK (whatsapp_e164 IS NULL OR whatsapp_e164 ~ '^\+[1-9][0-9]{6,14}$'),
 CONSTRAINT d022_foto CHECK (foto_path IS NULL OR foto_path ~ '^proveedores/[a-z0-9_-]{3,100}/[a-f0-9]{64}\.(jpg|png|webp)$'),
 CONSTRAINT d022_consent CHECK (
  (consentido_en IS NULL AND consentimiento_version IS NULL AND consentimiento_evidencia_hmac IS NULL)
  OR (consentido_en IS NOT NULL AND consentimiento_version='D022-2026-11-22'
   AND consentimiento_evidencia_hmac ~ '^[a-f0-9]{64}
);
ALTER TABLE cotironda_piloto_privado.supplier_business_profiles_d022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.supplier_business_profiles_d022 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE cotironda_piloto_privado.supplier_business_profiles_d022 TO service_role;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('cotironda-piloto-perfiles','cotironda-piloto-perfiles',false,1048576,
 ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- Storage es PRIVADO; no crear politicas anon/authenticated.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d022_profile_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE v_source jsonb;v_supplier record;v_profile record;v_valid boolean;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL THEN RETURN NULL;END IF;
 -- Reutiliza la comprobacion autentica de sesion, ronda, archivo,
 -- proveedor respondedor, permiso de original, revocacion y SHA.
 v_source:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_source IS NULL OR (v_source->>'state') NOT IN
  ('authorized_original_v2','authorized_text_v2')
  OR v_source->>'requestId' IS DISTINCT FROM p_request_id::text
  OR v_source->>'documentId' IS DISTINCT FROM p_document_id::text
 THEN RETURN NULL;END IF;
 SELECT p.key,p.display_label,p.delivery_city,p.opted_out_at
 INTO v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_source->>'supplierKey' AND p.participant_role='supplier';
 IF NOT FOUND OR v_supplier.opted_out_at IS NOT NULL THEN RETURN NULL;END IF;
 SELECT rubro,direccion,localidad,pais,whatsapp_e164,foto_path,
  consentido_en,revocado_en,consentimiento_version,consentimiento_evidencia_hmac,
  whatsapp_verificado_en INTO v_profile
 FROM cotironda_piloto_privado.supplier_business_profiles_d022
 WHERE supplier_key=v_supplier.key;
 v_valid:=FOUND AND v_profile.consentido_en IS NOT NULL
  AND v_profile.consentimiento_version='D022-2026-11-22'
  AND v_profile.consentimiento_evidencia_hmac ~ '^[a-f0-9]{64}
 -- El perfil sin consentimiento no expone contactos, direcciones ni foto.
 RETURN jsonb_build_object(
  'state','supplier_profile_authorized_v2',
  'comercio',v_supplier.display_label,
  'rubro',CASE WHEN v_valid THEN v_profile.rubro ELSE NULL END,
  'direccion',CASE WHEN v_valid THEN v_profile.direccion ELSE NULL END,
  'localidad',CASE WHEN v_valid THEN v_profile.localidad ELSE NULL END,
  'pais',CASE WHEN v_valid THEN v_profile.pais ELSE NULL END,
  'whatsapp',CASE WHEN v_valid AND v_profile.whatsapp_verificado_en IS NOT NULL
    THEN v_profile.whatsapp_e164 ELSE NULL END,
  'fotoPath',CASE WHEN v_valid THEN v_profile.foto_path ELSE NULL END,
  'supplierKey',v_supplier.key
 );
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 TO service_role;
COMMIT;

-- Alta comercial: cargar SOLO con prueba de consentimiento informada y vigente.
-- Ningun upload de foto ni numero se infiere de mensajes de cotizacion.
)
 ),
 CONSTRAINT d022_revocacion CHECK (revocado_en IS NULL OR consentido_en IS NOT NULL),
 CONSTRAINT d022_telefono_verificado CHECK (whatsapp_verificado_en IS NULL OR whatsapp_e164 IS NOT NULL)
);
ALTER TABLE cotironda_piloto_privado.supplier_business_profiles_d022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.supplier_business_profiles_d022 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE cotironda_piloto_privado.supplier_business_profiles_d022 TO service_role;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('cotironda-piloto-perfiles','cotironda-piloto-perfiles',false,1048576,
 ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- Storage es PRIVADO; no crear politicas anon/authenticated.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d022_profile_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE v_source jsonb;v_supplier record;v_profile record;v_valid boolean;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL THEN RETURN NULL;END IF;
 -- Reutiliza la comprobacion autentica de sesion, ronda, archivo,
 -- proveedor respondedor, permiso de original, revocacion y SHA.
 v_source:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_source IS NULL OR (v_source->>'state') NOT IN
  ('authorized_original_v2','authorized_text_v2')
  OR v_source->>'requestId' IS DISTINCT FROM p_request_id::text
  OR v_source->>'documentId' IS DISTINCT FROM p_document_id::text
 THEN RETURN NULL;END IF;
 SELECT p.key,p.display_label,p.delivery_city,p.opted_out_at
 INTO v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_source->>'supplierKey' AND p.participant_role='supplier';
 IF NOT FOUND OR v_supplier.opted_out_at IS NOT NULL THEN RETURN NULL;END IF;
 SELECT rubro,direccion,localidad,pais,whatsapp_e164,foto_path,
  consentido_en,revocado_en INTO v_profile
 FROM cotironda_piloto_privado.supplier_business_profiles_d022
 WHERE supplier_key=v_supplier.key;
 v_valid:=FOUND AND v_profile.consentido_en IS NOT NULL
  AND v_profile.revocado_en IS NULL;
 -- El perfil sin consentimiento no expone contactos, direcciones ni foto.
 RETURN jsonb_build_object(
  'state','supplier_profile_authorized_v2',
  'comercio',v_supplier.display_label,
  'rubro',CASE WHEN v_valid THEN v_profile.rubro ELSE NULL END,
  'direccion',CASE WHEN v_valid THEN v_profile.direccion ELSE NULL END,
  'localidad',CASE WHEN v_valid THEN v_profile.localidad ELSE NULL END,
  'pais',CASE WHEN v_valid THEN v_profile.pais ELSE NULL END,
  'whatsapp',CASE WHEN v_valid THEN v_profile.whatsapp_e164 ELSE NULL END,
  'fotoPath',CASE WHEN v_valid THEN v_profile.foto_path ELSE NULL END,
  'supplierKey',v_supplier.key
 );
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 TO service_role;
COMMIT;

-- Alta comercial: cargar SOLO con prueba de consentimiento informada y vigente.
-- Ningun upload de foto ni numero se infiere de mensajes de cotizacion.

  AND v_profile.revocado_en IS NULL;
 -- El perfil sin consentimiento no expone contactos, direcciones ni foto.
 RETURN jsonb_build_object(
  'state','supplier_profile_authorized_v2',
  'comercio',v_supplier.display_label,
  'rubro',CASE WHEN v_valid THEN v_profile.rubro ELSE NULL END,
  'direccion',CASE WHEN v_valid THEN v_profile.direccion ELSE NULL END,
  'localidad',CASE WHEN v_valid THEN v_profile.localidad ELSE NULL END,
  'pais',CASE WHEN v_valid THEN v_profile.pais ELSE NULL END,
  'whatsapp',CASE WHEN v_valid THEN v_profile.whatsapp_e164 ELSE NULL END,
  'fotoPath',CASE WHEN v_valid THEN v_profile.foto_path ELSE NULL END,
  'supplierKey',v_supplier.key
 );
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 TO service_role;
COMMIT;

-- Alta comercial: cargar SOLO con prueba de consentimiento informada y vigente.
-- Ningun upload de foto ni numero se infiere de mensajes de cotizacion.
)
 ),
 CONSTRAINT d022_revocacion CHECK (revocado_en IS NULL OR consentido_en IS NOT NULL),
 CONSTRAINT d022_telefono_verificado CHECK (whatsapp_verificado_en IS NULL OR whatsapp_e164 IS NOT NULL)
);
ALTER TABLE cotironda_piloto_privado.supplier_business_profiles_d022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE cotironda_piloto_privado.supplier_business_profiles_d022 FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE cotironda_piloto_privado.supplier_business_profiles_d022 TO service_role;

INSERT INTO storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
VALUES ('cotironda-piloto-perfiles','cotironda-piloto-perfiles',false,1048576,
 ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;
-- Storage es PRIVADO; no crear politicas anon/authenticated.

CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d022_profile_private(
 p_request_id uuid,p_sesion_hmac text,p_document_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE v_source jsonb;v_supplier record;v_profile record;v_valid boolean;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL THEN RETURN NULL;END IF;
 -- Reutiliza la comprobacion autentica de sesion, ronda, archivo,
 -- proveedor respondedor, permiso de original, revocacion y SHA.
 v_source:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_source IS NULL OR (v_source->>'state') NOT IN
  ('authorized_original_v2','authorized_text_v2')
  OR v_source->>'requestId' IS DISTINCT FROM p_request_id::text
  OR v_source->>'documentId' IS DISTINCT FROM p_document_id::text
 THEN RETURN NULL;END IF;
 SELECT p.key,p.display_label,p.delivery_city,p.opted_out_at
 INTO v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_source->>'supplierKey' AND p.participant_role='supplier';
 IF NOT FOUND OR v_supplier.opted_out_at IS NOT NULL THEN RETURN NULL;END IF;
 SELECT rubro,direccion,localidad,pais,whatsapp_e164,foto_path,
  consentido_en,revocado_en INTO v_profile
 FROM cotironda_piloto_privado.supplier_business_profiles_d022
 WHERE supplier_key=v_supplier.key;
 v_valid:=FOUND AND v_profile.consentido_en IS NOT NULL
  AND v_profile.revocado_en IS NULL;
 -- El perfil sin consentimiento no expone contactos, direcciones ni foto.
 RETURN jsonb_build_object(
  'state','supplier_profile_authorized_v2',
  'comercio',v_supplier.display_label,
  'rubro',CASE WHEN v_valid THEN v_profile.rubro ELSE NULL END,
  'direccion',CASE WHEN v_valid THEN v_profile.direccion ELSE NULL END,
  'localidad',CASE WHEN v_valid THEN v_profile.localidad ELSE NULL END,
  'pais',CASE WHEN v_valid THEN v_profile.pais ELSE NULL END,
  'whatsapp',CASE WHEN v_valid THEN v_profile.whatsapp_e164 ELSE NULL END,
  'fotoPath',CASE WHEN v_valid THEN v_profile.foto_path ELSE NULL END,
  'supplierKey',v_supplier.key
 );
END $fn$;

REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_d022_profile_private(uuid,text,uuid)
 TO service_role;
COMMIT;

-- Alta comercial: cargar SOLO con prueba de consentimiento informada y vigente.
-- Ningun upload de foto ni numero se infiere de mensajes de cotizacion.
