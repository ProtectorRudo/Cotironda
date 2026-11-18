-- Cotironda V2 · CANDIDATO. Solo instalar con «Publicalo».
-- Reutilizar catálogo privado existente, origen SHA y sesión D016: jamás
-- seleccionar por rubro ni crear una nueva ficha a partir de otra IA.
-- Un comprador puede ver 5 artículos en la ronda; un proveedor solo
-- recibe los 3 renglones entregados efectivamente a SU negocio.
DO $commercial_d016$
DECLARE
 old_source text;
 next_source text;
 target_assigned text := $P1$     'quotedItems',($P1$;
 replace_assigned text := $R1$     'assignedItems',(
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
       'line',rl.line_no,'description',rl.original_description,
       'quantity',rl.quantity::text,'unit',rl.unit
      ) ORDER BY rl.line_no),'[]'::jsonb)
      FROM cotironda_piloto_privado.invitation_lines_mvp099 assigned
      JOIN cotironda_piloto_privado.request_lines rl
       ON rl.request_id=assigned.request_id AND rl.line_no=assigned.line_no
      WHERE assigned.request_id=p_request_id
       AND assigned.supplier_key=v_source->>'supplierKey'
     ),
     'quotedItems',($R1$;
 target_lines text := $P2$       'unit',offered.unit_literal,
       'ambiguity',offered.ambiguity_literal$P2$;
 replace_lines text := $R2$       'unit',offered.unit_literal,
       'unitPrice',offered.unit_price_literal,
       'lineTotal',offered.line_total_literal,
       'ambiguity',offered.ambiguity_literal$R2$;
 target_terms text := $P3$     'totalLiteral',NULLIF(btrim(q.declared_total_literal),''),$P3$;
 replace_terms text := $R3$     'totalLiteral',NULLIF(btrim(q.declared_total_literal),''),
     'termsLiteral',(
      SELECT CASE
       WHEN a.proposal->>'kind'='supplier_quote'
         AND length(a.proposal->>'requested_delivery_note') BETWEEN 1 AND 1000
       THEN a.proposal->>'requested_delivery_note'
       ELSE NULL END
      FROM cotironda_piloto_privado.media_archive_mvp095 a
      WHERE a.message_hmac=q.message_hmac
       AND a.request_id=q.request_id
       AND a.participant_key=q.supplier_key
       AND a.content_sha256=q.source_sha256
       AND a.state='stored'
       AND a.storage_path='media/'||a.message_hmac
      LIMIT 1
     ),$R3$;
BEGIN
 IF to_regprocedure('public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)') IS NULL
 THEN RAISE EXCEPTION 'commercial_existing_rpc_missing';END IF;
 old_source:=pg_get_functiondef(
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure);
 IF encode(extensions.digest(convert_to(old_source,'UTF8'),'sha256'),'hex')
  <> '26f9209497484ac4b632b94e7df5718902d530c3954f0dfe7f93ba5d2920128e'
 THEN RAISE EXCEPTION 'commercial_source_drift';END IF;
 IF length(old_source)-length(replace(old_source,target_assigned,''))
  <> length(target_assigned)
 OR length(old_source)-length(replace(old_source,target_lines,''))
  <> length(target_lines)
 OR length(old_source)-length(replace(old_source,target_terms,''))
  <> length(target_terms)
 THEN RAISE EXCEPTION 'commercial_patch_anchors_not_unique';END IF;
 next_source:=replace(replace(replace(old_source,
  target_assigned,replace_assigned),target_lines,replace_lines),
  target_terms,replace_terms);
 IF encode(extensions.digest(convert_to(next_source,'UTF8'),'sha256'),'hex')
  <> '76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b'
 OR next_source NOT LIKE '%v2_d016_responders_private%'
 OR next_source NOT LIKE '%v2_d016_original_source_private%'
 OR next_source NOT LIKE '%q.source_sha256=v_source->>%'
 OR next_source NOT LIKE '%q.supplier_key=v_source->>%'
 THEN RAISE EXCEPTION 'commercial_source_or_security_mismatch';END IF;
 EXECUTE next_source;
 IF encode(extensions.digest(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure
 ),'UTF8'),'sha256'),'hex')
 <> '76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b'
 OR has_function_privilege('anon',
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 OR has_function_privilege('authenticated',
  'public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)','EXECUTE')
 THEN RAISE EXCEPTION 'commercial_postcheck_failed';END IF;
END $commercial_d016$;