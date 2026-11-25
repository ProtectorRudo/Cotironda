-- Candidato piloto: logos generados por IA, aprobados por operador el 25/11/2026.
-- No representa consentimiento de terceros ni habilita contactos/direcciones/originales.
-- Preserva autorizacion privada D016 y opt-out. No aplicar sin Publicalo.
BEGIN;
CREATE OR REPLACE FUNCTION public.cotironda_piloto_v2_d022_profile_private(p_request_id uuid, p_sesion_hmac text, p_document_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_source jsonb;
 v_supplier record;
 v_profile record;
 v_valid boolean;
BEGIN
 IF p_request_id IS NULL OR p_sesion_hmac IS NULL OR p_document_id IS NULL
 THEN RETURN NULL; END IF;

 -- Misma autorización fuerte que la descarga original existente: sesión,
 -- ronda, comprador, proveedor respondedor, consentimiento y revocaciones.
 v_source:=public.cotironda_piloto_v2_d016_original_source_private(
  p_request_id,p_sesion_hmac,p_document_id);
 IF v_source IS NULL
  OR (v_source->>'state') NOT IN ('authorized_original_v2','authorized_text_v2')
  OR v_source->>'requestId' IS DISTINCT FROM p_request_id::text
  OR v_source->>'documentId' IS DISTINCT FROM p_document_id::text
 THEN RETURN NULL; END IF;

 SELECT p.key,p.display_label,p.opted_out_at
 INTO v_supplier
 FROM cotironda_piloto_privado.participants p
 WHERE p.key=v_source->>'supplierKey' AND p.participant_role='supplier';
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF v_supplier.opted_out_at IS NOT NULL THEN RETURN NULL; END IF;

 SELECT rubro,direccion,localidad,pais,whatsapp_e164,foto_path,
  consentimiento_version,consentimiento_evidencia_hmac,consentido_en,
  revocado_en,whatsapp_verificado_en
 INTO v_profile
 FROM cotironda_piloto_privado.supplier_business_profiles_d022
 WHERE supplier_key=v_supplier.key;

 IF NOT FOUND THEN
  RETURN jsonb_build_object(
   'state','supplier_profile_authorized_v2',
   'comercio',v_supplier.display_label,
   'rubro',NULL,'direccion',NULL,'localidad',NULL,'pais',NULL,
   'whatsapp',NULL,'fotoPath',NULL,'supplierKey',v_supplier.key
  );
 END IF;

 v_valid:=COALESCE(
  v_profile.consentido_en IS NOT NULL
  AND v_profile.consentimiento_version='D022-2026-11-22'
  AND v_profile.consentimiento_evidencia_hmac ~ '^[a-f0-9]{64}$'
  AND v_profile.revocado_en IS NULL,false);

 RETURN jsonb_build_object(
  'state','supplier_profile_authorized_v2',
  'comercio',v_supplier.display_label,
  'rubro',CASE WHEN v_valid THEN v_profile.rubro ELSE NULL END,
  'direccion',CASE WHEN v_valid THEN v_profile.direccion ELSE NULL END,
  'localidad',CASE WHEN v_valid THEN v_profile.localidad ELSE NULL END,
  'pais',CASE WHEN v_valid THEN v_profile.pais ELSE NULL END,
  'whatsapp',CASE WHEN v_valid AND v_profile.whatsapp_verificado_en IS NOT NULL
    THEN v_profile.whatsapp_e164 ELSE NULL END,
  'fotoPath',CASE WHEN v_valid OR (
    -- Logos sinteticos aportados y aprobados por el operador del piloto.
    -- Solo estas dos rutas exactas, nunca datos de contacto ni otros archivos.
    v_profile.revocado_en IS NULL AND (
      (v_supplier.key='corralon_ailin' AND v_profile.foto_path='proveedores/corralon_ailin/93c0d78997b6dc7043f0e840cc877948b3baaaf6f1791764bd24ccba9417ce44.webp')
      OR (v_supplier.key='corralon_nahuel' AND v_profile.foto_path='proveedores/corralon_nahuel/eedaffeb000226e3c16cb0b3cae74056b308854bd12c20a9099ade29581bbd69.webp')
    ) AND EXISTS (SELECT 1 FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id WHERE o.bucket_id='cotironda-piloto-perfiles' AND o.name=v_profile.foto_path AND NOT b.public)
  ) THEN v_profile.foto_path ELSE NULL END,
  'supplierKey',v_supplier.key
 );
END $function$;
COMMIT;
