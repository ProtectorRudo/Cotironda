-- Synthetic read-only assertions with current real supplier docs.
-- Always execute inside BEGIN/ROLLBACK, no modifications.
do $tests$
declare r jsonb;c jsonb; n int;nominal int;variants int;
begin
 if has_function_privilege('anon',
  'public.cotironda_piloto_aridos_bolson_nominal_mvp164(uuid)','EXECUTE')
 or has_function_privilege('authenticated',
  'public.cotironda_piloto_aridos_bolson_nominal_mvp164(uuid)','EXECUTE')
 or not has_function_privilege('service_role',
  'public.cotironda_piloto_aridos_bolson_nominal_mvp164(uuid)','EXECUTE')
 then raise exception 'rpc_acl_invalid';end if;
 r:=public.cotironda_piloto_aridos_bolson_nominal_mvp164(
  '469cb459-5f00-49c2-b0b9-bc8b11e5c900'::uuid);
 if r->>'state'<>'commercial_volume_estimated' or
  r->>'ranking_allowed'<>'false' or
  r->>'contacts_revealed'<>'false'
 then raise exception 'unsafe_result';end if;
 c:=r->'candidates';
 n:=jsonb_array_length(c);
 if n<>4 then raise exception 'expected_4_volume_candidates_found_%',n;end if;
 select count(*) into nominal from jsonb_array_elements(c) e
  where e->>'nominal_quantity_matches'='true' and
   (e->>'m3_offered_nominal')::numeric in (1,2) and
   e->>'supplier_confirmed_volume'='false';
 if nominal<>4 then raise exception 'quantity_normalization_failed';end if;
 select count(*) into variants from jsonb_array_elements(c) e
  where e->>'technical_variant'='not_stated';
 if variants<>4 then raise exception 'variants_not_marked_unknown';end if;
 if exists(select 1 from jsonb_array_elements(c) e
  where e ? 'price' or e ? 'contact' or
   e->>'ranking_allowed'<>'false')
 then raise exception 'result_reveals_unsafe_fields';end if;
end;$tests$;
select 'mvp164_nominal_aridos_4_candidates_rollback_pass' as result;
