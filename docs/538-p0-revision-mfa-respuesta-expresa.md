# Acta 538 — P0: revisión MFA de respuesta expresa sin consentimiento inventado

**Fecha:** 12/11/2026. **Autorización:** «Avanza y registra en nuestro checklist y plan maestro». **SOLO DESARROLLO**; no instalación en piloto, Vercel ni Whapi, sin mensajes, compras ni nuevas rondas.

## Bloqueo real de P0

Los PR #804–#810 prepararon condiciones versionadas, aviso Whapi, cola idempotente, número cifrado y ejecutor TLS. **Todavía faltaba una transacción segura que distinguiera la respuesta cifrada del proveedor de una aceptación contractual.** El ledger M362 tenía un registro de aceptación previsto, pero no una operación AAL2 autenticada para obtener y verificar la respuesta en claro antes de escribirlo. No corresponde habilitar originales mediante IA ni el estado `api_accepted` de Whapi.

Se leyeron `supabase/piloto/mvp267_operator_supabase_auth_mfa_bridge.sql`, `mvp362_originales_alta_consentimiento_off.sql`, `p0_whapi_terms_sender_atomic_off.sql` y el webhook PILOTO `cotironda-piloto-whapi/index.ts`. La fuente entrante guarda **AES-256-GCM**, `nonce_b64`, `ciphertext_b64`, `plaintext_sha256`, HMAC de chat y mensaje; AAD exactamente `chat_hmac|message_hmac|text`. El módulo de operador M267 ya exige JWT firmado y Supabase Auth real, sesión vigente, `aal2`, rol `incident_manager` y operador activo; en el piloto aún no existe operador habilitado.

## Qué quedó preparado en código

**1. SQL privado y dos RPC MFA**
`supabase/piloto/p0_whapi_terms_review_mfa_off.sql` (NO INSTALADO):
- Tabla privada `supplier_original_reviews_p0` con decisiones de un solo uso por `evidence_message_hmac`, RLS y sin `SELECT/INSERT/UPDATE` directos de `anon`, `authenticated` o `service_role`.
- Resolver interno de candidatura que exige: proveedor activo, mismo chat HMAC, mensaje autenticado Whapi en `whapi_inbox` de tipo `text` sin ronda, mensaje recibido **después** de aviso M364 `api_accepted` con versión, SHA, chat y proveedor exactos y política vigente no alterada, cifrado disponible, ninguna decisión anterior ni revocación posterior al aviso.
- `public.cotironda_piloto_terms_review_packet_auth_p0(message_hmac)`: retorna **solo al operador con sesión Auth AAL2 comprobada** el paquete cifrado del mensaje, los términos completos y la evidencia de aviso; nunca el teléfono o una autorización automática.
- `public.cotironda_piloto_terms_review_decide_auth_p0(message_hmac,notice_hmac,reviewed_text,decision,human_attestation)`: vuelve a exigir AAL2, bloquea mensaje entrante, revalida todas las referencias, compara el SHA del texto REVISADO con el SHA original almacenado por el webhook, requiere acción humana afirmativa y registra `explicit_accept` o `not_explicit` una sola vez. Sólo `explicit_accept` inserta el episodio M362 **en la misma transacción** con UUID real del operador y huella de auditoría. Nunca infiere intención usando un valor de IA, ni permite aceptar un texto que no corresponde al hash del mensaje autenticado. `not_explicit` no otorga permiso y **no equivale por sí solo a revocación**.
- **Intención semántica:** sigue siendo una decisión humana verificable; la BD valida evidencia criptográfica, identidad, fechas y autenticación, **no puede demostrar que la persona haya entendido el contenido**. El operador debe marcar `not_explicit` cuando la respuesta sea ambigua, negación o no consentimiento.

**2. Descifrado de servidor con segunda acción**
`src/server/whapi-terms-mfa-review-p0.ts`:
- Requiere puerto `authenticatedRpc` con JWT de operador y clave AES privada, sin `fetch` ni secreto global. Comprueba forma exacta de paquete, SHA literal del texto de condiciones, descifra AES-GCM con AAD del webhook, exige UTF-8 válido y verifica SHA256 del texto antes de presentarlo al operador.
- `preparar()` sólo muestra texto y términos a operador autenticado. No guarda consentimiento.
- `decidir()` requiere elección explícita, atestación humana y nueva lectura/descifrado para evitar usar una respuesta o aviso cacheados/adulterados. La RPC SQL vuelve a aplicar autorización Auth AAL2. Ningún endpoint nuevo ni pantalla abierta.

**3. Pruebas**
- `tests/unit/p0-whapi-terms-mfa-review.test.mjs`: AES-GCM real y pruebas negativas de texto/hash/AAD/tag incorrectos, aviso cambiado, RPC sin permiso, error DB y ausencia de aceptación automática.
- `supabase/tests/ci/p0-terms-sender-pg17.sql`: migración nueva + stub de operador **sólo en fixture**; pruebas de ACL, operador ausente, mensaje previo al aviso, chat/proveedor diferente, archivo no-texto, hash de respuesta incorrecto, falta de atestación, estado/decisión inválido, consentimiento legítimo guardado exactamente una vez, rechazo registrado sin permiso, segundo intento bloqueado y revocación invalidando un aviso viejo. **ROLLBACK obligatorio.**
- Workflow PG17 P0 habilitado para la rama de desarrollo; certificar por SHA final antes de declarar terminado.

## Lo que NO quedó hecho

- [ ] **P0 sigue ABIERTO**: **no hay operador real de Auth AAL2**, ni aprobación comercial/legal del texto original de ofertas no ganadoras. No hay UI/endpoint seguro del operador ni credenciales provisionadas del runner.
- [ ] Sin integración/deploy de funciones nuevas en PILOTO, ninguna aceptación real emitida por proveedor, ningún envío de términos.
- [ ] El contenido descifrado debe manejarse únicamente dentro de un entorno de operador seguro y auditable, nunca en logs, páginas públicas, analíticas ni servicios de IA. Los tests usan texto y claves **sintéticos**.
- [ ] Falta Auth comprador Phone/OTP, dos presupuestos originales inequívocamente ligados, seguimiento, cierre y descarga real E2E. P1–P5 ABIERTOS.
- [ ] No crear ronda adicional mientras exista una `prepared` vigente.

**Siguiente acción única:** integrar el flujo de revisión en una interfaz de operador protegida por Supabase Auth AAL2 e impedir acceso sin sesión vigente, **sin habilitar todavía descargas ni enviar mensajes**. Antes de `Publicalo en cotironda-piloto`, aprobar términos exactos, provisionar operador MFA y login del worker con privilegios mínimos. Después ejecutar UN circuito de alta y pasar al comprador + dos proveedores + dos originales.

Fuentes: [Checklist #794](https://github.com/ProtectorRudo/Cotironda/issues/794), [Plan maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md), [PR #810](https://github.com/ProtectorRudo/Cotironda/pull/810).
