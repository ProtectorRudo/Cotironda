-- MVP208 · SOLO LECTURA · compatible con PostgreSQL 17 y Supabase PILOTO.
-- No DDL, datos, permisos, flags ni mensajes. No crea, concede ni activa.
-- Ejecutar solo en el proyecto PILOTO autorizado: informa PRE-REQUISITOS,
-- no instala MVP178/191/192/201 ni prueba que haya un comprador habilitado.
-- No listar teléfonos, HMAC, keys, UUID de rondas ni presupuestos.
WITH
 expected(schema_name,relation_name,column_name,data_type) AS (
  VALUES
   ('cotironda_piloto_privado','requests','id','uuid'),
   ('cotironda_piloto_privado','requests','buyer_key','text'),
   ('cotironda_piloto_privado','requests','state','text'),
   ('cotironda_piloto_privado','requests','created_at','timestamp with time zone'),
   ('cotironda_piloto_privado','requests','closes_at','timestamp with time zone'),
   ('cotironda_piloto_privado','requests','closed_at','timestamp with time zone'),
   ('cotironda_piloto_privado','participants','key','text'),
   ('cotironda_piloto_privado','participants','participant_role','text'),
   ('cotironda_piloto_privado','participants','chat_hmac','text'),
   ('cotironda_piloto_privado','participants','consent_at','timestamp with time zone'),
   ('cotironda_piloto_privado','participants','opted_out_at','timestamp with time zone'),
   ('cotironda_piloto_privado','whapi_inbox','message_hmac','text'),
   ('cotironda_piloto_privado','whapi_inbox','participant_key','text'),
   ('cotironda_piloto_privado','whapi_inbox','chat_hmac','text'),
   ('cotironda_piloto_privado','whapi_inbox','request_id','uuid'),
   ('cotironda_piloto_privado','whapi_inbox','received_at','timestamp with time zone'),
   ('cotironda_piloto_privado','participant_channels_mvp109','participant_key','text'),
   ('cotironda_piloto_privado','participant_channels_mvp109','chat_hmac','text'),
   ('cotironda_piloto_privado','participant_channels_mvp109','contact_sha256','text'),
   ('cotironda_piloto_privado','participant_channels_mvp109','authenticated_message_hmac','text'),
   ('cotironda_piloto_privado','invitations','request_id','uuid'),
   ('cotironda_piloto_privado','invitations','supplier_key','text'),
   ('cotironda_piloto_privado','invitations','state','text'),
   ('cotironda_piloto_privado','invitations','created_at','timestamp with time zone'),
   ('cotironda_piloto_privado','supplier_media_quotes_mvp098','message_hmac','text'),
   ('cotironda_piloto_privado','supplier_media_quotes_mvp098','request_id','uuid'),
   ('cotironda_piloto_privado','supplier_media_quotes_mvp098','supplier_key','text'),
   ('cotironda_piloto_privado','supplier_media_quotes_mvp098','source_sha256','text'),
   ('cotironda_piloto_privado','supplier_media_quotes_mvp098','received_at','timestamp with time zone'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','message_hmac','text'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','request_id','uuid'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','supplier_key','text'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','source_sha256','text'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','verifier_version','smallint'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','state','text'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','reason','text'),
   ('cotironda_piloto_privado','supplier_evidence_mvp138','ranking_allowed','boolean'),
   ('cotironda_piloto_privado','media_archive_mvp095','message_hmac','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','participant_key','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','request_id','uuid'),
   ('cotironda_piloto_privado','media_archive_mvp095','state','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','finished_at','timestamp with time zone'),
   ('cotironda_piloto_privado','media_archive_mvp095','kind','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','mime','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','storage_path','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','content_sha256','text'),
   ('cotironda_piloto_privado','media_archive_mvp095','size_bytes','integer'),
   ('cotironda_piloto_privado','offer_versions','request_id','uuid'),
   ('cotironda_piloto_privado','offer_versions','supplier_key','text'),
   ('cotironda_piloto_privado','offer_versions','created_at','timestamp with time zone'),
   ('auth','users','id','uuid'),
   ('auth','users','phone','text'),
   ('auth','users','phone_confirmed_at','timestamp with time zone'),
   ('auth','users','is_anonymous','boolean'),
   ('auth','users','deleted_at','timestamp with time zone'),
   ('auth','users','banned_until','timestamp with time zone'),
   ('auth','sessions','id','uuid'),
   ('auth','sessions','user_id','uuid'),
   ('auth','sessions','not_after','timestamp with time zone')
 ),
 compared AS (
  SELECT expected.schema_name,expected.relation_name,
    expected.column_name,
    (format_type(a.atttypid,a.atttypmod)=expected.data_type)
       AS present_and_correct
  FROM expected
  LEFT JOIN pg_namespace n ON n.nspname=expected.schema_name
  LEFT JOIN pg_class c ON c.relnamespace=n.oid
     AND c.relname=expected.relation_name
     AND c.relkind IN ('r','p')
  LEFT JOIN pg_attribute a ON a.attrelid=c.oid
     AND a.attname=expected.column_name
     AND a.attnum>0 AND a.attisdropped=false
 ),
 foundation AS (
  SELECT
   (current_setting('server_version_num')::int >= 170000) AS pg17,
   (SELECT count(*)=3 FROM pg_roles WHERE rolname IN
      ('anon','authenticated','service_role')) AS roles_ok,
   to_regprocedure('auth.uid()') IS NOT NULL AS auth_uid_exists,
   to_regprocedure('auth.jwt()') IS NOT NULL AS auth_jwt_exists,
   to_regprocedure('extensions.digest(text,text)') IS NOT NULL
      AS digest_text_exists,
   COALESCE((SELECT bool_and(present_and_correct)
    FROM compared),false) AS columns_ok,
   COALESCE((SELECT count(*) FROM compared WHERE present_and_correct IS NOT TRUE),0)
      AS incompatible_columns
 ),
 installed AS (
  SELECT
    (to_regclass('cotironda_piloto_privado.original_share_policy_mvp178')
     IS NOT NULL)::int
    +(to_regclass('cotironda_piloto_privado.original_share_consents_mvp178')
     IS NOT NULL)::int
    +(to_regclass('cotironda_piloto_privado.original_download_audit_mvp201')
     IS NOT NULL)::int
    +(to_regprocedure('public.cotironda_piloto_original_consent_preflight_mvp178(uuid,text)')
     IS NOT NULL)::int
    +(to_regprocedure('public.cotironda_piloto_buyer_identity_mvp191(uuid)')
     IS NOT NULL)::int
    +(to_regprocedure('public.cotironda_piloto_originals_private_mvp192(uuid,uuid,uuid,uuid)')
     IS NOT NULL)::int
    +(to_regprocedure('public.cotironda_piloto_record_original_download_mvp201(uuid,uuid,uuid,uuid,text,integer)')
     IS NOT NULL)::int AS package_objects_present
 )
SELECT
 pg17,roles_ok,auth_uid_exists,auth_jwt_exists,digest_text_exists,
 columns_ok,incompatible_columns,
 package_objects_present,
 CASE
  WHEN NOT(pg17 AND roles_ok AND auth_uid_exists AND auth_jwt_exists
           AND digest_text_exists AND columns_ok)
   THEN 'bloqueado_dependencias'
  WHEN package_objects_present=0
   THEN 'listo_para_instalacion_apagada_con_publicalo'
  WHEN package_objects_present=7
   THEN 'paquete_presente_verificar_politica_y_grants'
  ELSE 'bloqueado_instalacion_parcial'
 END AS estado_preinstalacion,
 -- Operational context only. A prepared (non-expired) round is NOT a failure.
 (SELECT count(*) FROM cotironda_piloto_privado.requests)
   AS rondas_existentes,
 (SELECT count(*) FROM cotironda_piloto_privado.requests
   WHERE state='closed') AS rondas_cerradas,
 (SELECT count(*) FROM cotironda_piloto_privado.requests
   WHERE state='prepared' AND closes_at<=clock_timestamp()) AS preparadas_vencidas,
 (SELECT count(*) FROM auth.users) AS compradores_auth_existentes
FROM foundation CROSS JOIN installed;
