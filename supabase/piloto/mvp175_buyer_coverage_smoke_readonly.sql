-- MVP175 — comprobación repetible de SOLO LECTURA (cotironda-piloto).
-- Requiere instalación previa de la RPC. No muestra token/hash ni PII.
with source as (
 select public.cotironda_piloto_buyer_coverage_inputs_mvp175(t.token_hash) as result
 from cotironda_piloto_privado.buyer_tracking_mvp091 t
 where exists (
  select 1 from cotironda_piloto_privado.supplier_economic_facts_mvp168 e
  where e.request_id=t.request_id
 )
 and t.revoked_at is null
)
select
 to_regprocedure('public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)') is not null as rpc_installed,
 has_function_privilege('anon','public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)','EXECUTE') as anon_can_execute,
 has_function_privilege('authenticated','public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)','EXECUTE') as authenticated_can_execute,
 has_function_privilege('service_role','public.cotironda_piloto_buyer_coverage_inputs_mvp175(text)','EXECUTE') as service_can_execute,
 count(*) as private_links_checked,
 count(*) filter(where result->>'state'='private_inputs') as valid_rounds,
 coalesce(sum(case when result->>'state'='private_inputs' then jsonb_array_length(result->'quotations') else 0 end),0) as quotes_checked,
 coalesce(sum(case when result->>'state'='private_inputs' then jsonb_array_length(result->'requestItems') else 0 end),0) as items_checked,
 public.cotironda_piloto_buyer_coverage_inputs_mvp175(repeat('0',64))->>'state' as invalid_hash_state,
 (select count(*) from cotironda_piloto_privado.finalist_whapi_outbox_mvp110) as finalist_messages,
 (select count(*) from cotironda_piloto_privado.finalist_activation_mvp113 where enabled) as active_finalists
from source;