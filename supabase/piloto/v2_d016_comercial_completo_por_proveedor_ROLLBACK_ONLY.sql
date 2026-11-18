-- Candidato de reversión. NO ejecutar salvo orden expresa.
-- Restaura únicamente proyección privada D016 y cota de observaciones.
-- No elimina ofertas, originales, consentimientos, mensajes ni el análisis guardado.
DO $rollback_d016$
DECLARE
 cur text; restored text;
 expanded text; old text;
BEGIN
 cur:=pg_get_functiondef('public.cotironda_piloto_v2_d016_responders_with_analysis_private(uuid,text)'::regprocedure);
 IF encode(extensions.digest(convert_to(cur,'UTF8'),'sha256'),'hex')
 <> '76521ef0d7ed90fc6a78b2bb9541811984724b2fe56b454d1fd24d689264835b'
 THEN RAISE EXCEPTION 'commercial_rollback_drift';END IF;
 restored:=replace(cur,
 $R1$     'assignedItems',(
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
     'quotedItems',($R1$,
 $P1$     'quotedItems',($P1$);
 restored:=replace(restored,
 $R2$       'unit',offered.unit_literal,
       'unitPrice',offered.unit_price_literal,
       'lineTotal',offered.line_total_literal,
       'ambiguity',offered.ambiguity_literal$R2$,
 $P2$       'unit',offered.unit_literal,
       'ambiguity',offered.ambiguity_literal$P2$);
 restored:=replace(restored,
 $R3$     'totalLiteral',NULLIF(btrim(q.declared_total_literal),''),
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
     ),$R3$,
 $P3$     'totalLiteral',NULLIF(btrim(q.declared_total_literal),''),$P3$);
 IF encode(extensions.digest(convert_to(restored,'UTF8'),'sha256'),'hex')
 <> '26f9209497484ac4b632b94e7df5718902d530c3954f0dfe7f93ba5d2920128e'
 THEN RAISE EXCEPTION 'commercial_rollback_invalid';END IF;
 EXECUTE restored;

 expanded:=pg_get_functiondef(
  'public.cotironda_piloto_v2_d016_analysis_finish_private(uuid,text,uuid,uuid,text,text,jsonb,text)'::regprocedure);
 IF encode(extensions.digest(convert_to(expanded,'UTF8'),'sha256'),'hex')
 <> '0fb46536475094f44c0d70587d32636934a244f12d9263418335d5e503773766'
 THEN RAISE EXCEPTION 'analysis_rollback_drift'; END IF;
 old:=replace(expanded,'jsonb_array_length(p_points) NOT BETWEEN 2 AND 8',
  'jsonb_array_length(p_points) NOT BETWEEN 2 AND 4');
 IF encode(extensions.digest(convert_to(old,'UTF8'),'sha256'),'hex')
 <> '12fbd1ca58702d9b1bb4278f60b57efbae7490fd9f5f159653de3aadb7880026'
 THEN RAISE EXCEPTION 'analysis_rollback_invalid';END IF;
 EXECUTE old;
END $rollback_d016$;