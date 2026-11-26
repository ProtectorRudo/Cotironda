-- CANDIDATE: no instalar hasta cerrar y verificar piloto actual.
-- Registro futuro de rubros comerciales por renglón, separado de las
-- etiquetas técnicas históricas. La integración deberá escribirlo en la
-- misma transacción de preparación, con evidencia del lector original.
CREATE TABLE cotironda_piloto_privado.v2_commercial_request_rubros_d013 (
 request_id uuid NOT NULL,
 line_no smallint NOT NULL,
 rubro text NOT NULL CHECK (rubro IN ('corralon','hormigon_elaborado','hierros_aceros','construccion_seca','electricidad','sanitarios_gas','maderas','pintureria_tecnica','techos_aislantes','ferreteria')),
 PRIMARY KEY (request_id,line_no),
 FOREIGN KEY (request_id,line_no)
   REFERENCES cotironda_piloto_privado.request_lines(request_id,line_no) ON DELETE RESTRICT
);
ALTER TABLE cotironda_piloto_privado.v2_commercial_request_rubros_d013 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON cotironda_piloto_privado.v2_commercial_request_rubros_d013 FROM PUBLIC,anon,authenticated,service_role;

-- Lectura agregada global de oportunidades aceptadas por API, no ventas.
-- Solo service_role; no ampliar privilegios de la tabla ni exponer contacto,
-- comprador, solicitud, precio, archivos o contenido del pedido.
CREATE FUNCTION public.cotironda_piloto_v2_commercial_history_d013(p_proveedores text[])
 RETURNS TABLE(proveedor text,rubro text,oportunidades integer,ultimo bigint)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO ''
AS $fn$
BEGIN
 IF p_proveedores IS NULL OR cardinality(p_proveedores) NOT BETWEEN 1 AND 200
    OR EXISTS (SELECT 1 FROM unnest(p_proveedores) k WHERE k IS NULL OR k !~ '^[a-z][a-z0-9_]{2,63}$')
 THEN RAISE EXCEPTION 'invalid_supplier_scope'; END IF;
 RETURN QUERY 
 SELECT j.supplier_key AS proveedor,
        COALESCE(c.rubro,CASE WHEN x.rubro IN ('electricidad','construccion_seca','ferreteria') THEN x.rubro END) AS rubro,
        count(DISTINCT j.request_id)::int AS oportunidades,
        floor(extract(epoch FROM max(j.finished_at))*1000)::bigint AS ultimo
 FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 j
 JOIN cotironda_piloto_privado.invitations i USING(request_id,supplier_key)
 JOIN cotironda_piloto_privado.invitation_lines_mvp099 l USING(request_id,supplier_key)
 JOIN cotironda_piloto_privado.requests r ON r.id=j.request_id
 LEFT JOIN cotironda_piloto_privado.ai_shadow_rubros_mvp221 x ON x.request_id=l.request_id AND x.line_no=l.line_no
 LEFT JOIN cotironda_piloto_privado.v2_commercial_request_rubros_d013 c ON c.request_id=l.request_id AND c.line_no=l.line_no
 WHERE j.supplier_key=ANY(p_proveedores)
   AND r.timing_mode='business_two_days'
   AND j.state='api_accepted' AND j.whapi_message_id IS NOT NULL
   AND j.finished_at>=statement_timestamp()-interval '30 days'
   AND j.finished_at<=statement_timestamp()
   AND COALESCE(c.rubro,CASE WHEN x.rubro IN ('electricidad','construccion_seca','ferreteria') THEN x.rubro END) IS NOT NULL
 GROUP BY 1,2
 ORDER BY 1,2;
END $fn$;
REVOKE ALL ON FUNCTION public.cotironda_piloto_v2_commercial_history_d013(text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cotironda_piloto_v2_commercial_history_d013(text[]) TO service_role;
