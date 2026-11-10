-- MVP344: allow an exactly source-covered BIG BAG item to appear in
-- anonymous quotes. The pilot's PDF has TWO such rows; the old allowlist
-- blocks publication even when amounts and source evidence pass.
-- ONLY DEVELOPMENT. Run in disposable PostgreSQL17 BEGIN/ROLLBACK first.
-- All existing contact/PII, amount, source, request and ACL gates remain.
DO $mvp344$
DECLARE
 v_ddl text;
 v_old text:=$old$ l.description_literal !~* '^(cemento|arena|ladrillos?|hidro[fó]ugo|ceresita|pallets?|bolsones?|bols[oó]n|flete|env[ií]o|transporte|descuento|bonificaci[oó]n|iva|impuesto|envase|embalaje)([[:space:]:,.]|$)'$old$;
 v_new text:=$new$ l.description_literal !~* '^(cemento|arena|ladrillos?|hidro[fó]ugo|ceresita|pallets?|bolsones?|bols[oó]n|flete|env[ií]o|transporte|descuento|bonificaci[oó]n|iva|impuesto|envase|embalaje|big[ -]?bags?)([[:space:]:,.]|$)'$new$;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(
  'public.cotironda_piloto_publish_source_text_mvp107(text)'::regprocedure
 ) INTO v_ddl;
 IF v_ddl IS NULL
  OR pg_catalog.length(v_ddl)-pg_catalog.length(
   pg_catalog.replace(v_ddl,v_old,'')) <> pg_catalog.length(v_old)
  OR pg_catalog.strpos(v_ddl, 'SECURITY DEFINER')=0
  OR pg_catalog.strpos(v_ddl, 'search_path TO ''''')=0
  OR pg_catalog.strpos(v_ddl, 'l.description_literal ~*')=0
  OR pg_catalog.strpos(v_ddl, 'cotironda_piloto_privado.supplier_amount_checks_mvp103')=0
  OR pg_catalog.strpos(v_ddl, 'cotironda_piloto_privado.supplier_source_checks_mvp106')=0
 THEN RAISE EXCEPTION 'mvp344_unverified_source_publisher_baseline';END IF;

 -- Replace a single anchored literal inside existing function definition.
 -- Never rewrite source price checks or remove the contact-detection regex.
 EXECUTE pg_catalog.replace(v_ddl,v_old,v_new);
 IF NOT EXISTS(
  SELECT 1 FROM pg_catalog.pg_proc p
  WHERE p.oid='public.cotironda_piloto_publish_source_text_mvp107(text)'::regprocedure
   AND p.prosecdef
 ) THEN RAISE EXCEPTION 'mvp344_definer_lost';END IF;
END $mvp344$;

-- Idempotent ACL enforcement even if a future migration changes defaults.
REVOKE ALL ON FUNCTION public.cotironda_piloto_publish_source_text_mvp107(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_publish_source_text_mvp107(text)
 TO service_role;

-- NO offers generated, no existing rows changed, no Whapi, no contacts.
