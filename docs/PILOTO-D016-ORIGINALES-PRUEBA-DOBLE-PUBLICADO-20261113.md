# Cotironda V2 / D016 — originales protegidos por evidencia Whapi (publicado en PILOTO)

**13/11/2026 · Publicación REAL, SOLO SQL de Supabase piloto.** Proyecto \`cotironda-piloto\` (\`ilggkalaafhtiysyzlmg\`) PostgreSQL 17. El webhook Whapi v76, el portal Vercel y producción siguen **sin cambios**. No se habilitaron mensajes ni originales.

## Hallazgo y criterio

Antes de esta corrección las funciones \`public.cotironda_piloto_v2_d016_responders_private\` y \`public.cotironda_piloto_v2_d016_original_source_private\` verificaban sesión privada del comprador, empresa, solicitud, proveedor, SHA, almacenamiento y la tabla \`v2_supplier_original_consents\`, pero **no verificaban el nuevo ledger D016** ni la evidencia de respuesta previa registrada por Whapi, y por lo tanto no denegaban por la nueva tabla de revocación \`NO COMPARTIR\`.

La regla corregida es acumulativa: **autorización V2 válida antes de la invitación** + **aviso D016 enviado y confirmado antes de la respuesta** + **mismo hash original, proveedor, ronda y mensaje asociado** + **sin baja posterior**. La respuesta recibida **NO se considera consentimiento legal por sí sola**. La revocación invalida la consulta en tiempo real y la descarga posterior.

## Migración publicada

- Número Supabase: **\`20261113232051\`**.
- Nombre: **\`cotironda_d016_portal_original_evidence_download_guard_off_pilot_20261113\`**.
- Fuente versionada: \`supabase/piloto/v2_d016_portal_original_evidence_gate_CANDIDATE.sql\`, [PR #844](https://github.com/ProtectorRudo/Cotironda/pull/844).
- Preflight SQL transaccional antes de aplicar: base \`postgres\` PG17, 7 rondas históricas/1 preparada, 0 registros de avisos/evidencia/revocaciones/sesiones, flags negocio/originales/cierre OFF, dos funciones esperadas sin guard D016 y ACL privada correcta. \`apply_migration success=true\`.
- Dos RPC \`CREATE OR REPLACE\` con las mismas firmas, \`SECURITY DEFINER\`, \`search_path=''\`, roles. El listado exige una fila de evidencia del **mismo** \`message_hmac\`, \`request_id\`, \`supplier_key\`, \`source_sha256\` y el resultado \`verified_reply_not_authorization\` de la función D016, que valida el aviso y la revocación. La fuente original revalida ambas cosas inmediatamente antes de devolver metadatos del PDF o el texto cifrado. Las RPC existentes de auditoría de descargas y el análisis consultan esa fuente y por lo tanto quedan también bloqueadas ante falta de evidencia/baja.

## Pruebas

- [GitHub Actions D016, ejecución 43526141459](https://github.com/ProtectorRudo/Cotironda/actions/runs/43526141459): \`d016-offline SUCCESS\`. El log confirmó explícitamente \`D016_PORTAL_ORIGINAL_EVIDENCE_GUARD_PG17_PASS\`, más rollback sintético.
- Fixture nuevo \`supabase/tests/ci/v2-d016-original-evidence-download-pg17.sql\` reejecuta las pruebas antiguas de sesión y presupuestos antes de instalar el nuevo guard, después evalúa sin evidencia, solo aviso, PDF acreditado, hash falso, texto válido, consentimiento previo revocado, \`NO COMPARTIR\`, descargas denegadas y ACL. Todo en **BEGIN/ROLLBACK** sin ningún dato personal real ni mensajes enviados.
- Los 7/7 controles generales GitHub en el commit de código \`602165d9a508bf71fdba12a6a3b4cf8e54f28271\` **SUCCESS**; volver a consultar HEAD cuando se agregue documentación.

## Verificación DIRECTA postrelease contra Supabase

| Control | Resultado |
|---|---|
| Rondas históricas / preparada | **7 / 1**, sin modificación |
| Consentimientos de originales registrados en \`v2_supplier_original_consents\` | **0** |
| Avisos, evidencias, revocaciones D016 nuevas | **0 / 0 / 0** |
| Sesiones privadas D016 | **0** |
| Políticas negocio, originales, cierre | **OFF / OFF / OFF** |
| Funciones del portal con doble verificación instalada | **2/2** |
| \`anon\` lectura y \`authenticated\` fuente | **Sin EXECUTE** |
| Servidor \`service_role\` | **EXECUTE permitido** |
| Solicitudes con parámetros NULL | **Denegadas** |

**Limitación:** la prueba positiva es sintética, no una prueba real de entrega de WhatsApp ni del navegador. Cero filas de \`v2_supplier_original_consents\` significa que no hay consentimientos originales documentados en esa tabla de piloto; **no se puede deducir si existe autorización contractual fuera de la base** ni inventar una constancia retroactiva.

## Jurídico y próximos pasos

La [Ley 25.326 actualizada](https://www.argentina.gob.ar/normativa/nacional/64790/actualizacion), artículos 5, 6 y 11, establece requisitos y excepciones de tratamiento/cesión de datos personales y contempla su revocabilidad. Una respuesta comercial por WhatsApp no determina sin revisión si existe una base jurídica suficiente para compartir todos los datos personales incluidos en el archivo. Validar documento de adhesión/aviso, titularidad y alcance concreto con asesoramiento legal antes de habilitar la política de originales. No añadir formularios ni SMS innecesarios; sí conservar la evidencia que la normativa requiera.

Siguen pendientes: configurar secretos privados \`COTIRONDA_D016_HMAC_KEY_HEX\` y \`COTIRONDA_PILOT_SUPABASE_SECRET_KEY\` solo del lado servidor del Preview autorizado; verificar Whapi reenvíos; conectar salida y recepción D016 a la Edge sin alterar v76 histórico hasta pruebas; publicar exclusivamente Preview f985 cuando Vercel levante su cuota (reintento programado); E2E completo de comprador y dos proveedores, análisis por presupuesto, informe final, revisión legal y costo IA. **Piloto NO al 100 %.**

[Issue #838](https://github.com/ProtectorRudo/Cotironda/issues/838) · [plan maestro #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [PR #844](https://github.com/ProtectorRudo/Cotironda/pull/844).
