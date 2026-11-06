-- MVP248: PostgreSQL 17 isolated source publisher safety smoke.
-- This DOES NOT create rounds, participants, media, outbox or send WhatsApp.
BEGIN;
DO $boot$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon')
 THEN CREATE ROLE anon NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated')
 THEN CREATE ROLE authenticated NOLOGIN;END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role')
 THEN CREATE ROLE service_role NOLOGIN;END IF;
END $boot$;
CREATE SCHEMA cotironda_piloto_privado;
\ir ../../piloto/mvp248_publicador_documental_multirubro_privado.sql

DO $verify$
DECLARE label text; wrong text; body text;
BEGIN
 FOREACH label IN ARRAY ARRAY[
  'Cemento CPC 50 kg','20 bolsas de arena fina',
  'Piedra partida 6/20','Pintura látex interior 5 L',
  'Látex acrílico 20 L','Rodillo de pintura',
  'Cable unipolar 2,5 mm²','Térmica bipolar 25 A',
  'Caja de toma exterior','Durlock placa 12,5 mm',
  'Placa de yeso 9,5 mm','Tornillo autoperforante',
  'Caño PVC 110 mm','Bacha de acero inoxidable',
  'Grifería cromada','Pallet retornable',
  'Flete hasta La Plata','Descuento comercial 5%',
  'Membrana impermeabilizante','Masilla para juntas',
  '20 bolsas de cemento CPC 50 kg','20 bolsas de arena fina',
  '10 cajas de cable 2,5 mm','100 metros de cable unipolar'
 ] LOOP
  IF NOT cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(label)
  THEN RAISE EXCEPTION 'mvp248_mercaderia_bloqueada_%',label;END IF;
 END LOOP;
 FOREACH wrong IN ARRAY ARRAY[
  'Cotización empresa SRL',
  'Pinturería La Esquina', 'Corralón del Sur',
  'Cable 2,5 mm2 WhatsApp 2211234567',
  'Cemento 50kg CUIT 30712345678',
  'Pintura email proveedor@dominio.com',
  'Piedra https://example.com',
  'Durlock contacto comercial',
  'Cable teléfono 022112345678',
  'Madeco S.R.L.',
  'Pintura Madeco S.A.',
  'Proveedor descuentos',
  'Obra completa proveedor',
  'Random no acreditado',
  'Pintura' || chr(10) || 'adicional'
 ] LOOP
  IF cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(wrong)
  THEN RAISE EXCEPTION 'mvp248_privacy_or_unknown_leak_%',wrong;END IF;
 END LOOP;
 body:=pg_get_functiondef(
  'public.cotironda_piloto_publish_source_text_mvp107(text)'::regprocedure);
 IF body NOT LIKE '%descripcion_comercial_publicable_mvp248(l.description_literal)%'
 THEN RAISE EXCEPTION 'mvp248_publisher_not_using_private_guard';END IF;
 IF body NOT LIKE '%supplier_reading_checks_mvp102%'
 OR body NOT LIKE '%supplier_amount_checks_mvp103%'
 OR body NOT LIKE '%supplier_source_checks_mvp106%'
 OR body NOT LIKE '%anonymous_supplier_docs_mvp107%'
 OR body NOT LIKE '%source_sha256%'
 OR body NOT LIKE '%opted_out_at%'
 OR body NOT LIKE '%privacy_or_quality_review%'
 THEN RAISE EXCEPTION 'mvp248_source_privacy_or_round_guard_removed';END IF;
 IF has_function_privilege('anon',
   'cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)',
   'EXECUTE')
 OR has_function_privilege('authenticated',
   'public.cotironda_piloto_publish_source_text_mvp107(text)','EXECUTE')
 OR NOT has_function_privilege('service_role',
   'cotironda_piloto_privado.descripcion_comercial_publicable_mvp248(text)',
   'EXECUTE')
 THEN RAISE EXCEPTION 'mvp248_acl_exposed';END IF;
 IF (public.cotironda_piloto_publish_source_text_mvp107('bad')->>'state')
    <>'invalid'
 THEN RAISE EXCEPTION 'mvp248_hmac_guard_failed';END IF;
 RAISE NOTICE 'MVP248 PASS: approved rubros, privacy, source guard and ACL.';
END $verify$;
ROLLBACK;
