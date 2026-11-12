-- MVP361 readiness: SOLO SELECT, valid for repeated pilot checks.
-- Returns COUNTS/STATUS only. NEVER returns phone, contact hashes, buyer key,
-- HMAC, nonces, ciphertext or any original document metadata.
-- Does not create Auth users, send SMS, apply consent or dispatch WhatsApp.
WITH buyers AS (
 SELECT buyer.key, ch.contact_sha256
 FROM cotironda_piloto_privado.participants buyer
 JOIN cotironda_piloto_privado.participant_channels_mvp109 ch
   ON ch.participant_key=buyer.key AND ch.chat_hmac=buyer.chat_hmac
 JOIN cotironda_piloto_privado.whapi_inbox proof
   ON proof.message_hmac=ch.authenticated_message_hmac
   AND proof.participant_key=buyer.key AND proof.chat_hmac=buyer.chat_hmac
 WHERE buyer.participant_role='buyer'
   AND buyer.consent_at IS NOT NULL AND buyer.opted_out_at IS NULL
   AND ch.bound_at IS NOT NULL
   AND ch.authenticated_message_hmac ~ '^[a-f0-9]{64}$'
   AND ch.contact_sha256 ~ '^[a-f0-9]{64}$'
   AND proof.received_at<=clock_timestamp()
   AND EXISTS(SELECT 1 FROM cotironda_piloto_privado.requests r
              WHERE r.buyer_key=buyer.key
              AND r.state IN ('draft','prepared','closed'))
   AND NOT EXISTS(
    SELECT 1 FROM cotironda_piloto_privado.participant_channels_mvp109 c2
    JOIN cotironda_piloto_privado.participants p2
       ON p2.key=c2.participant_key
    WHERE c2.contact_sha256=ch.contact_sha256 AND p2.key<>buyer.key
      AND p2.opted_out_at IS NULL
   )
   AND NOT EXISTS(
    SELECT 1 FROM auth.users au
    WHERE au.phone IS NOT NULL
      AND encode(extensions.digest(convert_to(
        regexp_replace(au.phone,'^[+]','','')||'@s.whatsapp.net','UTF8'),
        'sha256'),'hex')=ch.contact_sha256
   )
), counts AS (
 SELECT
 (SELECT count(*) FROM buyers) verified_buyers,
 (SELECT count(*) FROM auth.users) auth_users,
 (SELECT count(*) FROM cotironda_piloto_privado.participants
   WHERE participant_role='supplier' AND consent_at IS NOT NULL
         AND opted_out_at IS NULL) active_suppliers,
 (SELECT count(*) FROM cotironda_piloto_privado.original_share_consents_mvp178
   WHERE revoked_at IS NULL) original_consents,
 (SELECT count(*) FROM cotironda_piloto_privado.original_share_policy_mvp178
   WHERE enabled=true AND activated_at IS NOT NULL) policy_on,
 (SELECT count(*) FROM cotironda_piloto_privado.requests
   WHERE state='prepared' AND closes_at>clock_timestamp()) prepared_rounds,
 (SELECT to_regprocedure(
    'public.cotironda_piloto_buyer_bootstrap_allowed_mvp361(text)') IS NOT NULL)
     rpc_installed
)
SELECT '01_buyer_whapi_identity' control,
 CASE WHEN verified_buyers=1 THEN 'WHAPI_PROBADO_1'
      WHEN verified_buyers=0 THEN 'BLOQUEADO_IDENTIDAD'
      ELSE 'BLOQUEADO_MULTIPLES' END estado,
 jsonb_build_object('compradores_verificados',verified_buyers) detalle
FROM counts
UNION ALL
SELECT '02_auth_user',CASE WHEN auth_users=0 THEN 'SIN_USUARIO_AUTH'
                          ELSE 'REVISAR_AUTH' END,
 jsonb_build_object('usuarios_auth',auth_users) FROM counts
UNION ALL
SELECT '03_supplier_participation',CASE WHEN active_suppliers>=2
 THEN 'DOS_O_MAS_ACTIVOS' ELSE 'FALTAN_PROVEEDORES' END,
 jsonb_build_object('proveedores_activos',active_suppliers) FROM counts
UNION ALL
SELECT '04_originals_specific_consent',CASE WHEN original_consents=0
 THEN 'SIN_CONSENTIMIENTO_ORIGINALES' ELSE 'VALIDAR_CONSENTIMIENTOS' END,
 jsonb_build_object('consentimientos_originales',original_consents) FROM counts
UNION ALL
SELECT '05_originals_policy',CASE WHEN policy_on=0 THEN 'OFF'
                          ELSE 'VERIFICAR_ALCANCE' END,
 jsonb_build_object('politicas_activas',policy_on) FROM counts
UNION ALL
SELECT '06_active_round',CASE WHEN prepared_rounds=0 THEN 'SIN_RONDA'
 WHEN prepared_rounds=1 THEN 'NO_DUPLICAR_RONDA'
 ELSE 'BLOQUEADO_SOLAPAMIENTOS' END,
 jsonb_build_object('rondas_prepared_vigentes',prepared_rounds) FROM counts
UNION ALL
SELECT '07_auth_bootstrap_rpc',CASE WHEN rpc_installed
 THEN 'EXISTE_REVISAR_PERMISOS' ELSE 'NO_INSTALADO' END,
 jsonb_build_object('instalado',rpc_installed) FROM counts
UNION ALL
SELECT '08_phone_sms_provider','NO_VERIFICABLE_POR_SQL',
 jsonb_build_object('accion','revisar Phone provider, SMS, CAPTCHA y límites en Auth')
UNION ALL
SELECT '09_data_api_net','NO_VERIFICADO_EXTERNAMENTE',
 jsonb_build_object('accion','probar Accept-Profile net via REST con clave pública')
ORDER BY control;
