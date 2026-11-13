-- Cotironda V2-17: INVENTARIO REAL DEL CONTRATO SQL DE TEXTO.
-- SOLO LECTURA. Nunca trae texto, SHA de mensajes, teléfonos ni datos privados.
-- Usar CONECTOR Supabase proyecto cotironda-piloto, no PROD.
-- Booleanos basados en cuerpo de funciones instaladas, no en su nombre:
-- después de SQL antiguo sin WhatsApp texto, el RPC sigue existiendo.
WITH installed AS (
 SELECT
   to_regprocedure(
    'public.cotironda_piloto_v2_responders_private(uuid,uuid,uuid)'
   ) AS catalog_rpc,
   to_regprocedure(
    'public.cotironda_piloto_v2_original_source_private(uuid,uuid,uuid,uuid)'
   ) AS original_rpc,
   to_regprocedure(
    'public.cotironda_piloto_v2_record_text_download(uuid,uuid,uuid,uuid,text,integer)'
   ) AS audit_rpc
)
SELECT
 to_char(clock_timestamp() AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at_utc,
 current_setting('server_version') AS postgres_version,
 catalog_rpc IS NOT NULL AS responders_rpc_present,
 original_rpc IS NOT NULL AS original_source_rpc_present,
 audit_rpc IS NOT NULL AS audit_text_rpc,
 COALESCE(
  position('link.kind=''text''' IN pg_get_functiondef(catalog_rpc))>0,
  false
 ) AS catalog_text,
 COALESCE(
  position('authorized_text_v2' IN pg_get_functiondef(original_rpc))>0,
  false
 ) AS original_text
FROM installed;
