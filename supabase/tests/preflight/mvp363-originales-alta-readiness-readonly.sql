-- MVP363: control operativo SOLO LECTURA sobre el PILOTO.
-- No registra consentimientos, no consulta texto, cifrados ni contactos.
-- Resultado parcial nunca equivale a aprobación legal, revisión de mensaje o MFA real.
-- La ronda PREPARED vigente impide crear otra ronda superpuesta.
WITH estado AS (
 SELECT
  (SELECT count(*) FROM auth.users) AS auth_usuarios,
  (SELECT count(*) FROM cotironda_piloto_privado.supervisor_operators_mvp265
    WHERE active=true AND revoked_at IS NULL) AS operadores_activos,
  (SELECT count(*) FROM cotironda_piloto_privado.original_share_consents_mvp178
    WHERE revoked_at IS NULL) AS consentimientos_antiguos_vigentes,
  (SELECT count(*) FROM cotironda_piloto_privado.original_share_policy_mvp178
    WHERE enabled=true AND activated_at IS NOT NULL) AS politicas_originales_activas,
  (SELECT count(*) FROM cotironda_piloto_privado.requests
    WHERE state='prepared' AND closes_at>clock_timestamp()) AS rondas_preparadas_vigentes,
  (to_regprocedure('cotironda_piloto_privado.operator_session_mvp267()') IS NOT NULL)
   AS funcion_mfa_instalada,
  (to_regclass('cotironda_piloto_privado.original_terms_policy_mvp362') IS NOT NULL)
   AS ledger_mvp362_instalado
)
SELECT auth_usuarios,operadores_activos,consentimientos_antiguos_vigentes,
 politicas_originales_activas,rondas_preparadas_vigentes,
 funcion_mfa_instalada,ledger_mvp362_instalado,
 CASE WHEN NOT funcion_mfa_instalada OR NOT ledger_mvp362_instalado
   OR auth_usuarios=0 OR operadores_activos=0
   OR politicas_originales_activas=0
 THEN 'NO_APTO_PARA_ALTA_REAL'
 ELSE 'PRECONDICIONES_PARCIALES_PENDIENTE_EVIDENCIA_Y_REVISION'
 END AS resultado,
 CASE WHEN rondas_preparadas_vigentes>0
 THEN 'NO_CREAR_RONDA_SUPERPUESTA'
 ELSE 'SIN_RONDA_PREPARADA_VIGENTE'
 END AS estado_rondas,
 'NINGUN_RESULTADO_AUTORIZA_REGISTRAR_CONSENTIMIENTO' AS limite
FROM estado;
