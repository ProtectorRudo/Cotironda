# Cotironda V2 — D016/P0 #838: publicación de ledger privado de originales

**Fecha:** 13/11/2026 (Argentina). **Entorno:** Supabase PILOTO, proyecto \`cotironda-piloto\` (ref \`ilggkalaafhtiysyzlmg\`). **No producción.**

## Qué se publicó realmente

Migración Supabase registrada **\`20261113192638\`**, nombre **\`cotironda_d016_original_reply_evidence_off_pilot_20261113\`**; resultado del conector \`apply_migration\`: \`success=true\`. SQL fuente: \`supabase/piloto/v2_d016_original_reply_proof_CANDIDATE.sql\`, versión inicial generada en commit \`9602cda3493420ac9c0985f3fd2e5ccd5dbec89c\` del [PR #839](https://github.com/ProtectorRudo/Cotironda/pull/839). La aplicación incluyó prefijo de preflight transaccional que deniega si cambia proyecto/PG17, número de rondas históricas (7, de ellas 1 preparada), políticas V2 OFF u objetos ya instalados. No se volvieron a correr migraciones D016 anteriores.

Se instalaron exclusivamente tres tablas **privadas**: \`v2_d016_original_notice_ledger\` (reservar aviso y adjuntar ID Whapi), \`v2_d016_original_reply_evidence\` (respuesta asociada al hash y ronda) y \`v2_d016_original_notice_revocations\` (revocación); y cinco RPC de propósito limitado (reserve/finish/observe/revoke/evidence_status), ejecutables solo por \`service_role\`. No contienen bytes de presupuesto ni claves, no modifican las rutas existentes ni conceden acceso de navegador. No se instaló ni activó el código de envío Whapi, ni se alteró el webhook histórico v76.

## Verificación postrelease directamente en la base REAL

- Base: Postgres 17; **7** rondas preservadas, **1** histórica preparada sin cambios.
- **3/3 nuevas tablas con RLS**; \`anon\` y \`authenticated\` no ejecutan \`evidence_status\`, \`service_role\` sí.
- **0** avisos, **0** respuestas, **0** revocaciones; no se fabricaron aceptaciones.
- \`v2_business_policy.enabled=false\`, \`v2_original_share_policy.enabled=false\` y \`v2_auto_release_policy.enabled=false\`.
- Pruebas negativas en la base real con ronda nula: reservar FALSE, terminar FALSE, observar FALSE y estado \`denied\`; sin inserciones.
- Auditor Security Advisor: las tres nuevas tablas figuran en lint **INFO** \`rls_enabled_no_policy\`, configuración intencional (sin acceso de clientes). Los hallazgos WARN preexistentes \`extension_in_public\` (1) y \`authenticated_security_definer_function_executable\` (7) no corresponden a las RPC nuevas ni fueron corregidos en este cambio. Verificar por separado cualquier cambio de su origen.

CI sobre código candidato: [GitHub Actions run 43491444978](https://github.com/ProtectorRudo/Cotironda/actions/runs/43491444978): **Node SUCCESS, PG17 ROLLBACK SUCCESS, comprobación de rollback SUCCESS**. En el SHA \`ef90fdb42ec216f768fa374dfc6890595b1866d5\` el conjunto de seis workflows terminó SUCCESS según verificación del 13/11.

## Lo que NO se publica ni habilita

**Sin mensajes WhatsApp, sin cron, sin IA, sin originales de proveedor y sin portal nuevo.** Las funciones de respuesta fueron incorporadas como infraestructura de evidencia, no como autorización de privacidad ni publicación. No existe integración de auditoría de despacho+recepción con Whapi v76 ni revisión legal de si una respuesta a una cotización equivale a consentimiento expreso/documentado respecto de datos personales. La Ley 25.326 (arts. 5 y 11) y la orientación de AAIP hacen imprescindible revisar fundamentos y destinatarios. Fuentes oficiales: https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/actualizacion y https://www.argentina.gob.ar/aaip/datospersonales/derechos.

La interfaz D016 corregida del PR #837, SHA \`f98527c9516478783bd7cf95433c58f5ca445937\`, todavía NO está en Vercel por cuota Hobby (HTTP 402). Última Preview READY: SHA \`64b8573fde5321dabaef557d2bea40c7d80bc503\`, proyecto exacto \`cotironda-portal-dev\`, SSO habilitado. Reintento del SHA f985 ya está programado una sola vez para después del período de cuota; no usar el PR #839 para ese despliegue ni eludir cuotas.

## Próximos criterios de aceptación P0

1. Auditar webhook y envío comercial actuales por SHA, sin modificar la versión v76 antes de integrar overlay seguro y sin mensajes duplicados.
2. Revisar jurídicamente el aviso y su base de consentimiento de forma compatible con el principio de experiencia sin trámites adicionales.
3. Integrar reserva→envío→ack→respuesta real con prueba de correlación, revocación y formatos PDF/Excel/Word/imagen/texto.
4. Probar prospectivamente la totalidad del acceso privado a originales en SQL/worker/portal; prohibido interpretar el estado \`verified_reply_not_authorization\` como permiso.
5. Configurar secretos privados y cerrar E2E con comprador y dos proveedores bajo controles auditados. Solo después, habilitar política y cron en el piloto.
6. Documentar migración, CI, observabilidad, costo y evidencia de navegación; jamás declarar piloto 100% antes de esa comprobación.

**Referencias:** [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838), [plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #839](https://github.com/ProtectorRudo/Cotironda/pull/839). 
