-- MVP208 · POST-INSTALACION PRIVADA · SOLO LECTURA.
-- Ejecutar SOLAMENTE después de instalar MVP178 -> 191 -> 192 -> 201.
-- NO activa permisos: verifica la política inicial desactivada, ACL y RLS.
-- No contiene teléfonos, SHA, HMAC ni detalles de compradores/proveedores.
WITH
 policy_gate AS (
  SELECT
    (count(*)=1 AND bool_and(enabled=false AND activated_at IS NULL))
      AS disabled_and_unactivated
  FROM cotironda_piloto_privado.original_share_policy_mvp178
 ),
 table_acl AS (
  SELECT
   count(*)=3 AND bool_and(c.relrowsecurity) AS all_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='cotironda_piloto_privado'
    AND c.relname IN ('original_share_policy_mvp178',
      'original_share_consents_mvp178','original_download_audit_mvp201')
 ),
 no_direct_access AS (
  SELECT NOT (
   has_table_privilege('anon',
    'cotironda_piloto_privado.original_share_policy_mvp178','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated',
    'cotironda_piloto_privado.original_share_policy_mvp178','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role',
    'cotironda_piloto_privado.original_share_policy_mvp178','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('anon',
    'cotironda_piloto_privado.original_share_consents_mvp178','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated',
    'cotironda_piloto_privado.original_share_consents_mvp178','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role',
    'cotironda_piloto_privado.original_share_consents_mvp178','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('anon',
    'cotironda_piloto_privado.original_download_audit_mvp201','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('authenticated',
    'cotironda_piloto_privado.original_download_audit_mvp201','SELECT,INSERT,UPDATE,DELETE')
   OR has_table_privilege('service_role',
    'cotironda_piloto_privado.original_download_audit_mvp201','SELECT,INSERT,UPDATE,DELETE')
  ) AS private_tables
 ),
 rpc_acl AS (
  SELECT
   has_function_privilege('authenticated',
    'public.cotironda_piloto_buyer_identity_mvp191(uuid)','EXECUTE')
   AND NOT has_function_privilege('anon',
    'public.cotironda_piloto_buyer_identity_mvp191(uuid)','EXECUTE')
   AND NOT has_function_privilege('service_role',
    'public.cotironda_piloto_buyer_identity_mvp191(uuid)','EXECUTE')
   AND NOT has_function_privilege('anon',
    'public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)','EXECUTE')
   AND NOT has_function_privilege('authenticated',
    'public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)','EXECUTE')
   AND has_function_privilege('service_role',
    'public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)','EXECUTE')
   AND NOT has_function_privilege('anon',
    'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)','EXECUTE')
   AND NOT has_function_privilege('authenticated',
    'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)','EXECUTE')
   AND has_function_privilege('service_role',
    'public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)','EXECUTE')
   AND NOT has_function_privilege('anon',
    'public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
   AND NOT has_function_privilege('authenticated',
    'public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
   AND has_function_privilege('service_role',
    'public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)','EXECUTE')
  AS authorized_only
 ),
 audit_counts AS (
  SELECT
   (SELECT count(*) FROM cotironda_piloto_privado.original_share_consents_mvp178)
     AS recorded_consents,
   (SELECT count(*) FROM cotironda_piloto_privado.original_download_audit_mvp201)
     AS recorded_prepared_responses
 )
SELECT
 disabled_and_unactivated AS politica_apagada,
 all_rls AS tablas_con_rls,
 private_tables AS sin_acceso_directo,
 authorized_only AS funciones_acl_estricto,
 recorded_consents AS consentimientos_existentes,
 recorded_prepared_responses AS auditorias_existentes,
 CASE WHEN disabled_and_unactivated AND all_rls AND private_tables
       AND authorized_only
    THEN 'instalado_apagado_sin_descargas_habilitadas'
    ELSE 'bloqueado_politica_o_permisos'
 END AS estado_despliegue
FROM policy_gate CROSS JOIN table_acl CROSS JOIN no_direct_access
 CROSS JOIN rpc_acl CROSS JOIN audit_counts;
