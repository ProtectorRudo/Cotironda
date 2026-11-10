-- MVP188. READ-ONLY deployment gate for the existing TWO consented pilot
-- buyer links. No production, no secrets in output, no remote calls.
-- Run with the isolated "Piloto cotironda" connection only.
-- It checks AUTHORITATIVE, CURRENT RPC results, not local fixture claims.
-- Does not activate anything. New customer/round => repeat on new baseline.
WITH
tokens AS MATERIALIZED (
 SELECT t.request_id,
   public.cotironda_piloto_tracking_status_mvp091(t.token_hash) tracking,
   public.cotironda_piloto_buyer_coverage_inputs_mvp175(t.token_hash) coverage,
   public.cotironda_piloto_buyer_economy_summary_mvp180(t.token_hash) economy
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 WHERE t.revoked_at IS NULL AND t.expires_at>clock_timestamp()
),
buyer_offers AS (
 SELECT t.request_id, v->>'text' text_value
 FROM tokens t CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(t.tracking->'offers')='array'
  THEN t.tracking->'offers' ELSE '[]'::jsonb END
 ) v
),
source_offers AS (
 SELECT q.request_id,q.message_hmac,
   e.public_text AS text_value,q.source_sha256
 FROM cotironda_piloto_privado.supplier_media_quotes_mvp098 q
 JOIN cotironda_piloto_privado.supplier_evidence_mvp138 e
   ON e.message_hmac=q.message_hmac AND e.request_id=q.request_id
   AND e.supplier_key=q.supplier_key
   AND e.source_sha256=q.source_sha256 AND e.verifier_version=9
 JOIN cotironda_piloto_privado.supplier_source_facts_mvp163 f
   ON f.message_hmac=q.message_hmac AND f.request_id=q.request_id
   AND f.source_sha256=q.source_sha256 AND f.supplier_key=q.supplier_key
 JOIN cotironda_piloto_privado.supplier_economic_facts_mvp168 eco
   ON eco.message_hmac=q.message_hmac AND eco.request_id=q.request_id
   AND eco.source_sha256=q.source_sha256 AND eco.supplier_key=q.supplier_key
 WHERE e.state='verified' AND e.reason='covered'
   AND e.public_text IS NOT NULL AND length(e.public_text) BETWEEN 1 AND 16000
   AND f.state='source_checked' AND eco.state='source_checked'
   AND f.facts->>'rankingAllowed'='false'
   AND eco.facts->>'rankingAllowed'='false'
),
round_validation AS (
 SELECT t.request_id,
   (t.tracking->>'can_open')='true'
     AND t.tracking->>'state' IN ('waiting','closed')
     AND t.coverage->>'state'='private_inputs'
     AND t.economy->>'state'='economia_observada_sin_ranking'
     AND t.economy->>'ranking_allowed'='false'
     AND t.economy->>'price_comparable'='false'
     AND t.economy->>'contacts_revealed'='false'
     AND t.coverage->>'rankingAllowed'='false'
     AND t.coverage->>'contactsRevealed'='false'
       AS token_and_acl_ok,
   (SELECT count(*) FROM buyer_offers bo WHERE bo.request_id=t.request_id)
       AS n_buyer,
   (SELECT count(*) FROM source_offers so WHERE so.request_id=t.request_id)
       AS n_sources,
   (SELECT count(*) FROM buyer_offers bo JOIN source_offers so
     ON bo.request_id=so.request_id AND bo.text_value=so.text_value
     WHERE bo.request_id=t.request_id)
       AS n_matched,
   (SELECT count(DISTINCT bo.text_value) FROM buyer_offers bo
     WHERE bo.request_id=t.request_id) AS n_buyer_unique,
   (SELECT count(DISTINCT so.text_value) FROM source_offers so
     WHERE so.request_id=t.request_id) AS n_source_unique,
   jsonb_array_length(
     CASE WHEN jsonb_typeof(t.coverage->'requestItems')='array'
     THEN t.coverage->'requestItems' ELSE '[]'::jsonb END
   ) AS n_items,
   jsonb_array_length(
     CASE WHEN jsonb_typeof(t.coverage->'quotations')='array'
     THEN t.coverage->'quotations' ELSE '[]'::jsonb END
   ) AS n_covered
 FROM tokens t
),
source_lines AS (
 SELECT v.request_id,l.line,
   l.line->>'quantityLiteral' quantity_text,
   l.line->>'lineTotalLiteral' total_text,
   mapped.a->>'unitarioComercialTrasDescuento' unit_text,
   mapped.a->>'pagina' audit_page,mapped.a->>'fila' audit_row,
   mapped.fact->>'page' fact_page,mapped.fact->>'row' fact_row,
   mapped.a->>'estado' discount_state
 FROM tokens v
 CROSS JOIN LATERAL jsonb_array_elements(
   CASE WHEN v.coverage->>'state'='private_inputs'
   THEN v.coverage->'quotations' ELSE '[]'::jsonb END
 ) AS q(obj)
 CROSS JOIN LATERAL jsonb_array_elements(q.obj->'doc'->'lineas')
 WITH ORDINALITY AS l(line,ordinal)
 LEFT JOIN LATERAL (
    SELECT a FROM jsonb_array_elements(q.obj->'economia'->'descuentos'->'precios') a
    WHERE a->>'linea'=l.line->>'lineNo'
 ) prices ON true
 LEFT JOIN LATERAL (
    SELECT f fact FROM jsonb_array_elements(q.obj->'fuente'->'lines') f
    WHERE f->>'lineNo'=l.line->>'lineNo'
 ) facts ON true
 CROSS JOIN LATERAL (SELECT prices.a AS a, facts.fact AS fact) mapped
),
parsed AS (
 SELECT *,
  regexp_replace(quantity_text,'[^0-9,.]','','g') qty_string,
  regexp_replace(total_text,'[^0-9,.]','','g') total_string
 FROM source_lines
),
numeric_evidence AS (
 SELECT *,
 CASE WHEN qty_string ~ '^[0-9]+([,.][0-9]{1,3})?$'
  THEN replace(qty_string,',','.')::numeric END quantity_value,
 CASE WHEN unit_text ~ '^[0-9]+\.[0-9]{2}$'
  THEN unit_text::numeric END unit_value,
 CASE WHEN total_string ~ '^[0-9.,]+$'
  THEN (CASE WHEN strpos(total_string,',')>0
   THEN replace(replace(total_string,'.',''),',','.')
   ELSE total_string END)::numeric END total_value
 FROM parsed
),
counts AS (
 SELECT
  (SELECT count(*) FROM round_validation) AS valid_links,
  (SELECT count(*) FROM round_validation WHERE token_and_acl_ok
   AND n_buyer=n_sources AND n_sources=n_matched AND n_matched=n_buyer_unique
   AND n_matched=n_source_unique AND n_items BETWEEN 1 AND 25
   AND n_covered=n_sources AND n_sources BETWEEN 1 AND 10)
    AS fully_bound_links,
  (SELECT coalesce(sum(n_buyer),0) FROM round_validation) AS buyer_offers,
  (SELECT coalesce(sum(n_matched),0) FROM round_validation) AS source_matches,
  (SELECT coalesce(sum(n_items),0) FROM round_validation) AS buyer_items,
  (SELECT count(*) FROM numeric_evidence) AS original_lines,
  (SELECT count(*) FROM numeric_evidence
   WHERE audit_page=fact_page AND audit_row=fact_row
   AND discount_state IN
    ('descuento_explicito_conciliado','importe_sin_ajuste_conciliado')
   AND unit_value IS NOT NULL AND quantity_value IS NOT NULL
   AND total_value IS NOT NULL
   AND round(unit_value*quantity_value,2)=total_value)
    AS reconciled_lines,
  NOT has_function_privilege('anon',
   'public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)','EXECUTE')
   AND NOT has_function_privilege('authenticated',
   'public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)','EXECUTE')
   AND has_function_privilege('service_role',
   'public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)','EXECUTE')
   AND NOT has_function_privilege('anon',
   'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
   AND NOT has_function_privilege('authenticated',
   'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
   AND has_function_privilege('service_role',
   'public.cotironda_piloto_private_round_inputs_mvp172(uuid)','EXECUTE')
   AS private_rpc_acl_ok,
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_whapi_outbox_mvp110)
   AS finalist_messages,
  (SELECT count(*) FROM cotironda_piloto_privado.finalist_coverage_plans_mvp108)
   AS finalist_plans,
  (SELECT count(*) FROM auth.users) AS authenticated_accounts
)
SELECT
 CASE WHEN valid_links=2 AND fully_bound_links=valid_links
   AND buyer_offers=4 AND source_matches=buyer_offers
   AND buyer_items=5 AND original_lines=10
   AND reconciled_lines=original_lines AND private_rpc_acl_ok
   AND finalist_messages=0 AND finalist_plans=0
   THEN 'INSUMOS_LISTOS_PARA_SMOKE_CONTROLADO_NO_PUBLICADOS'
   ELSE 'NO_GO_REVISAR_INCONSISTENCIAS' END
  AS pilot_price_preflight,
 valid_links,fully_bound_links,buyer_offers,source_matches,buyer_items,
 original_lines,reconciled_lines,private_rpc_acl_ok,
 finalist_messages,finalist_plans,
 (authenticated_accounts>0) AS authenticated_downloads_possible,
 false AS production_or_whatsapp_authorized
FROM counts;
