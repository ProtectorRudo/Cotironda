# Acta 535 — P0: reserva y constancia de condiciones Whapi en PostgreSQL (solo desarrollo)

**Fecha:** 12/11/2026. **Orden:** «Avanza y registra en nuestro checklist y plan maestro». **Alcance:** PR #808, sin publicar, sin envíos de Whapi, sin modificar datos piloto, sin crear operadores, sin pasar políticas ON.

## Bloqueo resuelto en código

El emisor preparado en Acta 534 disponía de `claim / beginCommitted / authorizeCommitted / finishCommitted` pero ninguna transacción real. No era legítimo considerar el envío deduplicado únicamente por código TypeScript, ni registrar un ACK con una tabla escrita por cualquier rol API.

Se agregó:

- **`supabase/piloto/p0_whapi_terms_sender_atomic_off.sql`:** migración NO instalada. `supplier_terms_send_jobs_p0` en esquema privado, RLS sin acceso directo de `anon`, `authenticated` y `service_role`; el envío no tiene ni teléfono ni token ni contraseña. Estado `queued → leased → in_flight → api_accepted|uncertain`. Un `job_id` y un `lease_token` están ligados a un proveedor, versión, SHA, cuerpo íntegro y chat HMAC.
- **Operador real:** única creación de cola vía `public.cotironda_piloto_terms_enqueue_auth_p0`. La función exige `operator_session_mvp267()`, es decir, Auth AAL2 con sesión y operador administrativo habilitado; nunca recibe ID de operador del cliente. Verifica política ON, términos aprobados y SHA, proveedor habilitado y no dado de baja. Una sola cola por `(proveedor, versión, episodio)`: la revocación M365 habilita **solo una nueva oportunidad**.
- **Acceso al envío:** rol `cotironda_pilot_terms_sender_p0 NOLOGIN`, que deberá concederse manualmente a una identidad DB aislada en el futuro. No se le concede a `service_role`, y ninguna función de envío es accesible mediante una ruta API pública. `terms_claim_p0` selecciona con `FOR UPDATE SKIP LOCKED`; solo devuelve trabajos habilitados. Un lease no iniciado puede expirar; una vez `in_flight`, NUNCA se reclama automáticamente otra vez.
- **Pre-envío:** `terms_begin_p0` confirma el comienzo en una transacción propia antes de cualquier HTTP; `terms_authorize_p0` vuelve a comprobar autorización y chat. Si se pierde la respuesta del COMMIT, el emisor **no envía**.
- **Finalización:** `terms_finish_p0` bloquea la fila y compara lease, proveedor, versión y SHA. Únicamente `api_accepted` con HMAC válido crea **en la misma transacción** un aviso `supplier_original_terms_notices_mvp364`; `uncertain` no crea aviso ni permiso. El ACK duplicado es rechazado. **Una constancia de Whapi no es aceptación contractual del proveedor**.
- **`src/server/whapi-terms-sql-p0.ts`:** adaptador de consultas SQL exactas sobre conexiones confirmadas, sin credenciales, sin acceso implícito a PostgREST, `fetch` global ni client-supplied SQL. Se mantiene separado del emisor seguro D055 y del webhook Edge vigente.
- **`supabase/tests/ci/p0-terms-sender-pg17.sql`:** prueba de PostgreSQL17 con datos sintéticos y `ROLLBACK`: permisos de roles, Auth MFA **simulado con un stub limitado**, cola única, bloqueo de comprador, lease falso, BEGIN duplicado, chat ajeno, ACK sin mensaje, segunda finalización y `uncertain` sin reenvío ni M364. **No prueba un MFA real ni un POST a Whapi**.
- **`tests/unit/p0-whapi-terms-sql.test.mjs`:** parámetros estrictos, rechazos de respuesta SQL malformada, comprobación de estado literal y de denegaciones, sin secretos.

## Prueba y auditoría
- [x] Circuito SQL privado y adaptador implementados en PR #808; no se cambió código de despacho de pedidos PDF.
- [x] PostgreSQL17 de reserva/ACK con ROLLBACK **pasó en primer ensayo CI**. La misma batería se reejecuta con el commit final.
- [x] Una prueba Node detectó que el adaptador permitía campos extra en el resultado final; se corrigió para aceptar **solo `{state}` exacto**. Comprobar CI final antes de cerrar el punto.
- [x] `SELECT` en Supabase PILOTO 12/11/2026: `auth.users=0`, operadores activos `0`, consentimientos originales `0`, política originales ON `0`, 1 ronda `prepared` activa, M362 y P0 sender **no instalados**. Sin cambios de datos.
- [ ] Aprobar condiciones comerciales/legales exactas para originales de ofertas no ganadoras (PII potencial).
- [ ] Crear cuenta de operador REAL con segundo factor, habilitar MFA y el permiso; comprobar autorización y sesión; no confundir stub con Auth auténtico.
- [ ] Provisión controlada de rol DB `NOLOGIN` a identidad de servicio dedicada, sin permiso amplio, y resolución cifrada de destinatarios. Conectar los puertos a servidor real y a despliegue PILOTO solo con `Publicalo`.
- [ ] Envío real de condiciones con ID Whapi y verificación de mensaje entrante **expreso** por MFA, sin confirmación por cada presupuesto.
- [ ] Auth comprador OTP, dos originales asociados verificablemente a la misma ronda, recepción/anónimo, cierre y descargas autenticadas en navegador, REST `net`. **P0–P5 ABIERTOS.**

## Precisión del alcance técnico
La base puede validar **forma y fuente del resultado que entrega un worker privado**, no demostrar criptográficamente por sí sola que Whapi emitió el ACK. El worker debe conservar sus credenciales aisladas, acceso por rol mínimo, Whapi ID validado por D055 y rastros de intentos. La entrega de un aviso no implica lectura del proveedor ni consentimiento; debe producirse una respuesta afirmativa explícita, guardada y revisada por un operador Auth AAL2.

## Siguiente acción única
**Integrar y probar el ejecutor real, sin enviar, con rol aislado, conexión segura y resolver cifrado existente, y completar flujo de revisión de aceptación MFA.** No crear otra ronda preparada ni realizar reprocesamientos PDF económicos que no ayuden al E2E. Tras una publicación específica aprobada y consentimiento real, seguir con el circuito documental de 1 arquitecto + 2 proveedores. Mantener todos los PR en borrador hasta auditoría.

Fuentes: [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [PR #808](https://github.com/ProtectorRudo/Cotironda/pull/808), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md).
