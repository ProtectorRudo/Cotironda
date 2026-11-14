# Cotironda V2 — D016 P0: consentimiento único de originales instalado, política OFF

**Fecha Argentina:** 13/11/2026 · **Publicación técnica real en Supabase:** \`20261114022538\` UTC · Proyecto \`cotironda-piloto\` (\`ilggkalaafhtiysyzlmg\`), PostgreSQL 17.11.0.011. **SIN ACTUACIÓN COMERCIAL / NO PRODUCCIÓN.**

## Objetivo comercial sin fricción

El proveedor no tiene que confirmar el permiso para cada presupuesto. El contrato para compartir sus archivos originales se acepta **una sola vez en el alta**, con términos completos, comprensibles, aprobados y versionados, antes de una nueva ronda. Una cotización enviada, un silencio, el consentimiento genérico de recibir WhatsApp o haber participado históricamente **no** crean esta autorización. Un simple \`NO COMPARTIR\` desde el WhatsApp registrado puede revocarla globalmente, y el proveedor sigue pudiendo cotizar.

La aprobación del texto legal, que debe cubrir en particular la cesión de datos personales presentes en PDF/Excel/Word/imagen/texto, **aún está pendiente de revisión jurídica** de la Ley 25.326 (arts. 5, 6 y 11). No interpretar esta migración como conformidad legal ni como despliegue del alta.

## Cambios publicados en el PILOTO

Migración \`20261114022538\` \`cotironda_d016_one_time_supplier_original_terms_off_pilot_20261113\`, fuente versionada \`supabase/piloto/v2_d016_supplier_one_time_consent_CANDIDATE.sql\` del [PR #846](https://github.com/ProtectorRudo/Cotironda/pull/846).

- \`v2_d016_supplier_terms_policy\`: registro único **OFF**, sin SHA, fecha ni referencia de aprobación. Para habilitarlo se necesitan el SHA-256 del **texto COMPLETO de términos aprobados**, fecha de aprobación y referencia registrada. No se almacenó ni aceptó texto inventado.
- \`v2_d016_supplier_terms_deliveries\`: libro privado de envíos de condiciones de alta para el proveedor, mismo chat WhatsApp, SHA de versión, ID de envío aceptado por API y fecha. RLS activa, sin SELECT directo para roles web ni para \`service_role\`. Puede reutilizar el mensaje de incorporación; el SQL no envía mensajes.
- \`cotironda_piloto_v2_d016_record_terms_delivery_private\`: servicio exclusivo que registra el envío **solo después del ID real de Whapi**, con política de originales y términos activados, SHA aprobado y proveedor consentido para participar. No concede permiso de compartir.
- \`cotironda_piloto_v2_d016_register_terms_acceptance_private\`: servicio exclusivo que registra, mediante el \`whapi_inbox\` archivado, la respuesta explícita exacta \`ACEPTO COTIRONDA ORIGINALES V2\` del mismo proveedor/chat, posterior al aviso API confirmado; guarda el HMAC y la fecha original del mensaje en \`v2_supplier_original_consents\`, una vez. No acepta respuestas de otro chat, genéricas, anteriores a condiciones, duplicados ni reenvíos históricos revocados. La baja \`NO COMPARTIR\` sigue teniendo prioridad; una nueva aceptación genuina posterior puede registrarse en el futuro.
- No se modifican los presupuestos originales ni se habilitan V1/V2 o la publicación. Las antiguas rondas no reciben acceso retroactivo: las RPC de originales requieren \`consent.accepted_at <= invitation.created_at\` y activación prospectiva.

## Pruebas y verificaciones

[GitHub Actions D016 ingreso WhatsApp/PG17, ejecución 43546080912](https://github.com/ProtectorRudo/Cotironda/actions/runs/43546080912) **SUCCESS**, con marca explícita \`D016_ONE_TIME_SUPPLIER_CONSENT_PG17_PASS\` y \`ROLLBACK\` sobre fixture \`supabase/tests/ci/v2-d016-one-time-supplier-consent-pg17.sql\`.

Casos sintéticos: política legal OFF, consentimiento sin entrega, SHA de términos falso, chat ajeno, texto arbitrario, mensaje anterior al aviso, entrega duplicada, aceptación exacta, respuesta duplicada, baja global, rechazo de replay anterior a la baja, nueva aceptación expresa posterior, apagado de políticas y ACL. Ningún proveedor ni teléfono real ni WhatsApp enviado.

**Preflight transaccional:** base \`postgres\` PG17, exactamente 7 rondas históricas/1 preparada, 3 políticas V2 apagadas, 0 consentimientos, 0 avisos, 0 opt-outs/sesiones, migración y RPC nuevas ausentes, guard de baja global ya instalado, ACL correcta. Supabase confirmó \`apply_migration success=true\`.

**Postrelease SQL REAL:**

| Prueba | Resultado |
|---|---|
| Rondas históricas / preparadas | 7 / 1, intactas |
| Consentimientos reales de originales | 0 |
| Envíos reales de condiciones de alta | 0 |
| Avisos comerciales / bajas globales / sesiones | 0 / 0 / 0 |
| Política de términos | **OFF** |
| Texto legal aprobado | **Ninguno** |
| Negocio / originales / cierre | **OFF / OFF / OFF** |
| RLS libro de avisos | Habilitada |
| SELECT directo anon/auth/service | Denegado |
| RPC de registro web \`anon\` | Denegada |
| RPC de aceptación para \`service_role\` | Permitida |
| Parámetros NULL | \`denied\` / \`false\` |

**El piloto comercial todavía no funciona de punta a punta.** Está instalada la infraestructura para registrar aceptaciones futuras, pero nadie fue incorporado a este proceso, no se activaron condiciones legales ni WhatsApp, y no se abrió el portal al arquitecto.

## Pendientes de mayor valor

1. Revisión y aprobación legal de una versión clara de los términos de alta, incorporando cesión y revocación de originales, conforme Ley 25.326. Tras aprobar, registrar **la versión completa y su hash**; no inventar consentimiento para quienes ya están en el piloto.
2. Integrar el envío de términos con el WhatsApp de bienvenida sin añadir mensajes por presupuesto, registrar Whapi ID y detectar la respuesta de aceptación con controles de reenvío/duplicados. Mantener webhook v76 protegido; sólo overlay probado.
3. Resolver las dos variables privadas todavía ausentes en Vercel Preview \`cotironda-portal-dev\`: \`COTIRONDA_D016_HMAC_KEY_HEX\`, \`COTIRONDA_PILOT_SUPABASE_SECRET_KEY\`; nunca imprimir claves ni enviarlas al cliente. El último Preview READY está protegido por SSO y la corrección f985 tiene reintento exclusivo programado; no duplicarlo.
4. Prueba E2E real con comprador y dos proveedores: catálogo por producto → pedido WhatsApp → respuesta con original → acceso por enlace privado sin SMS → análisis útil → cierre e informe. No declarar piloto listo hasta comprobarla.

[PR #846](https://github.com/ProtectorRudo/Cotironda/pull/846) (DRAFT) · [Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [Plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794).
