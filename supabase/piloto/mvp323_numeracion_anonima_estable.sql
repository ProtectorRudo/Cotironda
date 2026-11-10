-- MVP323 / ISSUE #720. DEVELOPMENT ONLY. DO NOT APPLY TO PILOT UNTIL "Publicalo".
-- Stable anonymous ordinal by first independently verified source for a supplier.
-- Buyer and post-close identities MUST use precisely the same ordering.
-- Zero change to quoting, supplier invitation, Whapi, cron or source ledger.
DO $mvp323_guard$
DECLARE current_buyer text;current_close text;
BEGIN
 IF current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
 THEN RAISE EXCEPTION 'mvp323_pg_version_guard';END IF;
 SELECT encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_ia_buyer_rubros_mvp227(text)'::regprocedure
 ),'UTF8')),'hex') INTO current_buyer;
 SELECT encode(sha256(convert_to(pg_get_functiondef(
  'public.cotironda_piloto_all_suppliers_closed_mvp303(text)'::regprocedure
 ),'UTF8')),'hex') INTO current_close;
 IF current_buyer<>'4ea13c9c96128ea1d40f70a47e52f2f388d744eff3c3da75b479ca63db6f03a6'
   OR current_close<>'facd4403b5d704c58a20cabd782ea4f72b3ff81f404750716ca9d4b0bf141f99'
 THEN RAISE EXCEPTION 'mvp323_baseline_drift';END IF;
 IF to_regclass('cotironda_piloto_privado.ai_supplier_review_mvp227') IS NULL
   OR to_regclass('cotironda_piloto_privado.whapi_inbox') IS NULL
 THEN RAISE EXCEPTION 'mvp323_ledger_missing';END IF;
END $mvp323_guard$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_ia_buyer_rubros_mvp227(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_request uuid;v_state text;v_items jsonb;v_quotes jsonb;
 v_received int;v_pending int;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[a-f0-9]{64}$'
 THEN RETURN jsonb_build_object('state','not_found');END IF;
 SELECT r.id,r.state INTO v_request,v_state
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 JOIN cotironda_piloto_privado.participants b ON b.key=r.buyer_key
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
   AND t.expires_at>clock_timestamp() AND r.state IN('prepared','closed','cancelled')
   AND b.participant_role='buyer' AND b.consent_at IS NOT NULL
   AND b.opted_out_at IS NULL;
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF v_state='cancelled' THEN
  RETURN jsonb_build_object('state','cancelled');END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'itemId','item_'||l.line_no,'descripcion',l.original_description,
   'rubro',rub.rubro,'cantidad',l.quantity::text,'unidad',l.unit
 ) ORDER BY l.line_no) INTO v_items
 FROM cotironda_piloto_privado.request_lines l
 JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 rub
  ON rub.request_id=l.request_id AND rub.line_no=l.line_no
 WHERE l.request_id=v_request;
 SELECT count(DISTINCT supplier_key) INTO v_received
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225
 WHERE request_id=v_request;
 SELECT count(*) INTO v_pending
 FROM cotironda_piloto_privado.ai_supplier_links_mvp225 link
 WHERE link.request_id=v_request
   AND NOT EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_supplier_review_mvp227 rev
    WHERE rev.message_hmac=link.message_hmac AND rev.state='verified');
 -- If a supplier submits a later message still under review, hide its
 -- previously verified version until latest source is independently checked.
 WITH latest AS (
  SELECT DISTINCT ON (l.supplier_key)
    l.supplier_key,l.message_hmac,m.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 l
  JOIN cotironda_piloto_privado.whapi_inbox m
   ON m.message_hmac=l.message_hmac
  WHERE l.request_id=v_request
  ORDER BY l.supplier_key,m.received_at DESC,l.message_hmac DESC
 ), verified AS (
  SELECT latest.supplier_key,rev.summary
  FROM latest
  JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=latest.message_hmac AND rev.state='verified'
 ), first_verified AS (
  SELECT r.supplier_key,min(r.finished_at) AS first_at
  FROM cotironda_piloto_privado.ai_supplier_review_mvp227 r
  WHERE r.request_id=v_request AND r.state='verified'
    AND r.finished_at IS NOT NULL
  GROUP BY r.supplier_key
 ), numbered AS (
  SELECT v.summary,n.n
  FROM verified v
  JOIN (
   SELECT supplier_key,row_number() OVER(ORDER BY first_at,supplier_key) AS n
   FROM first_verified
  ) n USING(supplier_key)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'label','Presupuesto '||n,
   'moneda',summary->'moneda','iva',summary->'iva',
   'flete',summary->'flete','pago',summary->'pago',
   'rubros',summary->'rubros','precios',summary->'precios'
 ) ORDER BY n),'[]'::jsonb) INTO v_quotes
 FROM numbered;
 RETURN jsonb_build_object('state','rubros_por_articulo',
  'items',coalesce(v_items,'[]'::jsonb),
  'ofertas',v_quotes,'recibidos',v_received,
  'pendientes_revision',v_pending,'ranking_global_permitido',false,
  'adjudicacion_automatica',false,'contactos_revelados',false);
END
$function$;

CREATE OR REPLACE FUNCTION public.cotironda_piloto_all_suppliers_closed_mvp303(p_token_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
 v_request record;v_result jsonb;v_invited int;v_visible int;
BEGIN
 IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
 THEN RETURN jsonb_build_object('state','not_found');END IF;
 -- Unique buyer-bearer token, consent and strictly prospective activation.
 SELECT r.id,r.state,r.closes_at INTO v_request
 FROM cotironda_piloto_privado.buyer_tracking_mvp091 t
 JOIN cotironda_piloto_privado.requests r ON r.id=t.request_id
 JOIN cotironda_piloto_privado.ai_shadow_requests_mvp221 sh ON sh.request_id=r.id
 -- Mantener versiones históricas confirmadas y agregar SOLO rondas
 -- prospectivas MVP306 con autorización original inmutable y habilitada.
 -- El comprador sigue anónimo para el proveedor en ambas rutas.

 JOIN cotironda_piloto_privado.participants buyer
  ON buyer.key=r.buyer_key AND buyer.participant_role='buyer'
  AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
 JOIN cotironda_piloto_privado.all_supplier_reveal_activation_mvp303 gate
  ON gate.only_row AND gate.enabled AND gate.activated_at<=now()
  AND r.created_at>=gate.activated_at
 WHERE t.token_hash=p_token_hash AND t.revoked_at IS NULL
   AND t.expires_at>now()
   AND (
     EXISTS(SELECT 1 FROM cotironda_piloto_privado.ai_buyer_review_mvp279 br
       WHERE br.request_id=r.id AND br.state='confirmed')
     OR EXISTS(
       SELECT 1 FROM cotironda_piloto_privado.ai_buyer_auto_release_mvp306 auto
       JOIN cotironda_piloto_privado.ai_auto_release_gate_mvp306 g
         ON g.only_row AND g.enabled AND g.activated_at IS NOT NULL
       WHERE auto.request_id=r.id AND auto.buyer_key=r.buyer_key
         AND auto.source_hmac=r.source_hmac
         AND r.created_at>=g.activated_at
         AND auto.approved_at>=g.activated_at
         AND auto.approved_at<r.closes_at
     )
   );
 IF NOT FOUND THEN RETURN jsonb_build_object('state','not_found');END IF;
 IF v_request.state<>'closed' OR v_request.closes_at>now()
 THEN RETURN jsonb_build_object('state','not_ready');END IF;
 SELECT count(*) INTO v_invited
 FROM cotironda_piloto_privado.invitations i
 WHERE i.request_id=v_request.id AND i.state='prepared';
 IF v_invited>100 THEN RETURN jsonb_build_object('state','capacity_exceeded');END IF;

 -- Same stable first-verified label for buyer and post-close view.
 -- Unverified answers have no label; old verification reserves its slot.
 WITH latest AS (
  SELECT DISTINCT ON (ln.supplier_key)
   ln.supplier_key,ln.message_hmac,m.received_at
  FROM cotironda_piloto_privado.ai_supplier_links_mvp225 ln
  JOIN cotironda_piloto_privado.whapi_inbox m
    ON m.message_hmac=ln.message_hmac AND m.request_id=ln.request_id
     AND m.participant_key=ln.supplier_key
  WHERE ln.request_id=v_request.id
  ORDER BY ln.supplier_key,m.received_at DESC,ln.message_hmac DESC
 ), verified AS (
  SELECT l.supplier_key
  FROM latest l JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=l.message_hmac
    AND rev.request_id=v_request.id AND rev.supplier_key=l.supplier_key
   AND rev.state='verified' AND rev.summary IS NOT NULL
 ), first_verified AS (
  SELECT r.supplier_key,min(r.finished_at) AS first_at
  FROM cotironda_piloto_privado.ai_supplier_review_mvp227 r
  WHERE r.request_id=v_request.id AND r.state='verified'
    AND r.finished_at IS NOT NULL
  GROUP BY r.supplier_key
 ), numbered AS (
  SELECT v.supplier_key,n.n
  FROM verified v
  JOIN (
   SELECT supplier_key,row_number() OVER(ORDER BY first_at,supplier_key) AS n
   FROM first_verified
  ) n USING(supplier_key)
 ), suppliers AS (
  SELECT p.key,p.display_label,inv.state AS invitation_state,
   d.state AS dispatch_state,l.message_hmac,rev.state AS review_state,
   n.n AS verified_number
  FROM cotironda_piloto_privado.invitations inv
  JOIN cotironda_piloto_privado.participants p ON p.key=inv.supplier_key
   AND p.participant_role='supplier'
   AND p.consent_at IS NOT NULL AND p.opted_out_at IS NULL
  LEFT JOIN cotironda_piloto_privado.ai_dispatch_jobs_mvp222 d
   ON d.request_id=inv.request_id AND d.supplier_key=inv.supplier_key
  LEFT JOIN latest l ON l.supplier_key=inv.supplier_key
  LEFT JOIN cotironda_piloto_privado.ai_supplier_review_mvp227 rev
   ON rev.message_hmac=l.message_hmac AND rev.request_id=inv.request_id
   AND rev.supplier_key=inv.supplier_key
  LEFT JOIN numbered n ON n.supplier_key=inv.supplier_key
  WHERE inv.request_id=v_request.id AND inv.state='prepared'
 ) SELECT
   coalesce(jsonb_agg(jsonb_build_object(
    'nombre',trim(display_label),
    'oferta',CASE WHEN dispatch_state='api_accepted' AND verified_number IS NOT NULL
      THEN 'Presupuesto '||verified_number ELSE NULL END,
    'estado',CASE
     WHEN dispatch_state IS DISTINCT FROM 'api_accepted'
      THEN 'envio_no_confirmado'
     WHEN verified_number IS NOT NULL
      THEN 'presupuesto_verificado'
     WHEN message_hmac IS NOT NULL
      THEN 'respuesta_en_revision'
     ELSE 'sin_respuesta' END
   ) ORDER BY md5(v_request.id::text||key),key),'[]'::jsonb),
   count(*) INTO v_result,v_visible
 FROM suppliers;
 -- Names must not become a covert channel for phone numbers or markup;
 -- the browser uses textContent as its second defensive layer.
 IF EXISTS(
  SELECT 1 FROM cotironda_piloto_privado.invitations inv
  JOIN cotironda_piloto_privado.participants p ON p.key=inv.supplier_key
  WHERE inv.request_id=v_request.id AND inv.state='prepared'
   AND p.participant_role='supplier' AND p.consent_at IS NOT NULL
   AND p.opted_out_at IS NULL
   AND (p.display_label IS NULL OR length(trim(p.display_label)) NOT BETWEEN 2 AND 100
      OR p.display_label ~ '[[:cntrl:]<>]'
      OR p.display_label ~ '[0-9]{8,}')
 ) THEN RETURN jsonb_build_object('state','invalid_supplier_label');END IF;
 RETURN jsonb_build_object(
  'state','proveedores_revelados_al_cierre',
  'proveedores',v_result,'cantidad',v_visible,
  'invitados',v_invited,
  'solo_post_cierre',true,
  'identidades_reveladas',true,
  'telefonos_revelados',false,
  'ranking_global_permitido',false,
  'adjudicacion_automatica',false,
  'mensajes_enviados',false);
END $function$;

-- Reassert the existing service-role-only ACL without broadening access.
REVOKE ALL ON FUNCTION
 public.cotironda_piloto_ia_buyer_rubros_mvp227(text),
 public.cotironda_piloto_all_suppliers_closed_mvp303(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION
 public.cotironda_piloto_ia_buyer_rubros_mvp227(text),
 public.cotironda_piloto_all_suppliers_closed_mvp303(text)
 TO service_role;
