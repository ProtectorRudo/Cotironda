-- MVP316: SOLO LECTURA; no envíos, DDL, DML, contactos ni tokens.
-- Preparación de publicación; ABORTAR si hay drift, backup no verificado,
-- o migración parcial. Este diagnóstico NO realiza backup ni verifica Whapi.
WITH expected(name,args,frozen_sha) AS (
 VALUES
  ('cotironda_piloto_autolink_unquoted_media_mvp155','p_message_hmac text, p_chat_hmac text','1b5db6ab19fbd9682019bc688155aa7d97d6bd6ec4a43cc8b99c7eeb8010aec7'),
  ('cotironda_piloto_curated_families_mvp152','p_buyer_chat_hmac text, p_city text','96d180007c756b494567dcf13154cc8332b181b67b45b7e093ea89a4a9ccbae7'),
  ('cotironda_piloto_ia_claim_zone_mvp233','p_chat_hmac text, p_reply_hmac text, p_reply_text text, p_city text','b41595b537038fed1b5201065b0ee9ebb0e72566e98b075e5ae5dcf83bb6df74'),
  ('cotironda_piloto_ia_link_supplier_mvp225','p_message_hmac text, p_chat_hmac text, p_quoted_whapi_id text, p_original_text text','c60d1d2943b388e69635ede03124254ce8828f2e944f4946891975ddcce6e237'),
  ('cotironda_piloto_ia_reserve_review_notice_mvp286','p_chat_hmac text, p_message_hmac text','8af9d790ec8dde6ef4619328c0775ca68e76b0d410015980c8cc8e9b4f285932'),
  ('cotironda_piloto_ia_review_launch_mvp285','p_chat_hmac text','72b786fef4a76be524cb2462056e464f90c11140257b6f340393e2ebc4688a66'),
  ('cotironda_piloto_ia_trial_flags_mvp229','p_chat_hmac text','ebb602bfa1a899634065ebaf53e05068a7c10096e2cef29b4539d5aa6499da90'),
  ('cotironda_piloto_link_quoted_media_mvp151','p_message_hmac text, p_chat_hmac text, p_quoted_id text','820e9fed0469dd9591bd85344758c68bf99227cd46d2cc22a27413084c7c8db4'),
  ('cotironda_piloto_link_quoted_text_mvp151','p_message_hmac text, p_chat_hmac text, p_quoted_id text, p_plaintext text','844630f70ceb3bba5044afae5590bf6ddf47c9770ffec201b7ce6f416d65fde5'),
  ('cotironda_piloto_prepare_document_mvp099','p_message_hmac text','43767004be65d27bad8e7e3be5dd6614063f0784468f1cae582a2502ef691fc3'),
  ('cotironda_piloto_publish_source_text_mvp107','p_message_hmac text','4aa4839d2cb0a4c5917abace56f83553a35bf3205586eaa6ae477a2b2b30cfd2'),
  ('cotironda_piloto_record_delivery_mvp119','p_whapi_message_id text, p_status text, p_status_code integer, p_recipient_chat_hmac text, p_event_unix bigint','87fab1a4be22530233a004a49c173d976d6cf8a867e222555342ee5e15f6d4c9'),
  ('cotironda_piloto_reserve_ai_mvp094','p_chat_hmac text, p_message_hmac text','f8599a1efa0169bc6a5408bad73bbf05d6c7d7fa6954db3d85e25b74c4d1b8b9'),
  ('cotironda_piloto_reserve_reply_mvp094','p_message_hmac text, p_chat_hmac text, p_reply_code text','bdcde6055c006891f0df656dab30b3797df2ae3a155000d7e7c6d62833e887b8')
),
observed AS (
 SELECT e.name,e.frozen_sha,
   encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS current_sha
 FROM expected e LEFT JOIN pg_proc p ON p.proname=e.name
   AND pg_get_function_identity_arguments(p.oid)=e.args
   AND p.pronamespace='public'::regnamespace
),
audit AS (
 SELECT count(*)::integer AS total,
  count(*) FILTER(WHERE current_sha=frozen_sha)::integer AS matched,
  coalesce(jsonb_agg(name ORDER BY name) FILTER(
    WHERE current_sha IS DISTINCT FROM frozen_sha),'[]'::jsonb) AS drifted
 FROM observed
)
SELECT jsonb_build_object(
 'project','cotironda-piloto',
 'checked_at_utc',to_char(clock_timestamp() AT TIME ZONE 'UTC',
   'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
 'postgres_version',current_setting('server_version'),
 'mvp311_baselines_total',audit.total,
 'mvp311_baselines_matched',audit.matched,
 'mvp311_drifted_functions',audit.drifted,
 'mvp309_contactability_baseline_match',coalesce((
    SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
      ='023ffb3a0c2648f73f1b257dd3555a4d633b6311e866bf7b0861768b5491e03b'
    FROM pg_proc p WHERE p.oid=to_regprocedure(
      'cotironda_piloto_privado.proveedor_contactable_mvp307(text)')),false),
 'mvp312c_supplier_contacts_baseline_match',coalesce((
    SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
      ='8e6cd438415a2f4942e541fabeb63a574932bc444d59e8e65ba6e3bdfbec2105'
    FROM pg_proc p WHERE p.oid=to_regprocedure(
      'public.cotironda_piloto_all_supplier_contacts_mvp304(text)')),false),
 'mvp314_claim_baseline_match',coalesce((
    SELECT encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')
      ='cffd3c56487ca0c7388b62f3dc5ca429ff267bfa3191366a40c7b88ba5caa54f'
    FROM pg_proc p WHERE p.oid=to_regprocedure(
      'public.cotironda_piloto_ia_claim_mvp222(uuid)')),false),
 'mvp309_installed',to_regclass('cotironda_piloto_privado.admin_authorizations_mvp309') IS NOT NULL,
 'mvp310_installed',to_regprocedure(
    'cotironda_piloto_privado.verify_request_buyer_mvp310()') IS NOT NULL,
 'mvp312_installed',to_regclass('cotironda_piloto_privado.admin_channels_mvp312') IS NOT NULL,
 'mvp313_installed',to_regprocedure(
    'public.cotironda_piloto_ia_recipient_packet_mvp313(uuid,text,uuid,text,text)') IS NOT NULL,
 'mvp314_installed',to_regclass('cotironda_piloto_privado.ai_batch_gate_mvp314') IS NOT NULL,
 'mvp315_installed',to_regclass('cotironda_piloto_privado.ai_buyer_notice_gate_mvp315') IS NOT NULL,
 'mvp306_auto_release_enabled',(
    SELECT enabled FROM cotironda_piloto_privado.ai_auto_release_gate_mvp306 WHERE only_row),
 'mvp222_dispatch_enabled',(
    SELECT enabled FROM cotironda_piloto_privado.ai_dispatch_gate_mvp222 WHERE only_row),
 'whapi_outbound_flag',(
    SELECT whatsapp_outbound_enabled FROM cotironda_piloto_privado.integration_flags WHERE only_row),
 'pending_jobs',(
    SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 WHERE state='pending'),
 'leased_jobs',(
    SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 WHERE state='leased'),
 'uncertain_jobs',(
    SELECT count(*) FROM cotironda_piloto_privado.ai_dispatch_jobs_mvp222 WHERE state='uncertain'),
 'restore_point_verified',false,
 'whapi_live_send_verified',false
) AS release_preflight
FROM audit;
