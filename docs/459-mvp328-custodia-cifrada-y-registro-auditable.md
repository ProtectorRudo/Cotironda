# Decisión 459 — MVP328: custodia segura del original y auditoría interna, sin aprobar ofertas

**Fecha:** 09/11/2026 (ART). **Autorización:** «Luz verde» para desarrollo, pruebas y documentación únicamente. **No publicar** en Supabase/Vercel; no modificar webhook Whapi, cliente, presupuestos, catálogo ni cron.

## Contexto y fuente real

La ronda de prueba sigue con una respuesta comercial recibida que finalizó en revisión y 0 ofertas económicamente verificadas. El texto original está cifrado en `cotironda_piloto_privado.whapi_inbox`, con `nonce_b64`, `ciphertext_b64`, `plaintext_sha256`, `message_hmac`, `chat_hmac` y asociación a una ronda y proveedor. No se extrajo el texto real ni se llamó al modelo.

El módulo previo `conciliacion-original-textual-mvp327.ts` ya coteja texto SHA-256, artículos, cantidades, moneda, IVA, fletes y sumas sin aprobar. Faltaba obtener una instantánea autorizada y dejar registro de la auditoría **sin tocar la revisión original**.

## Lo que se preparó en desarrollo

1. SQL `supabase/piloto/mvp328_lectura_cifrada_y_auditoria_interna.sql` — **NO APLICADO AL PILOTO**. Contiene dos RPC `service_role` only y una tabla privada con RLS, sin permisos públicos:
   - `public.cotironda_piloto_read_reconciliation_envelope_mvp328(uuid,text,text)`: requiere ID de ronda, HMAC exacto de mensaje y HMAC del chat; resuelve **la última respuesta vinculada del proveedor** sin filtrar primero por formato ni calidad, para impedir que una versión nueva/alterada reviva una anterior. Comprueba convocatoria `api_accepted` previa, consentimiento vigente de comprador y proveedor, estado de ronda no cancelado, ventana de entrega, fuente SHA coincidente, `review` finalizada y líneas solicitadas a ese proveedor. Retorna **solamente el sobre cifrado**, SHA y renglones de pedido al proceso interno. No retorna texto plano, teléfono, nombres ni catálogo privado.
   - `public.cotironda_piloto_record_reconciliation_attempt_mvp328(...)`: solo inserta un **intento de auditoría**, previa nueva comprobación de fuente y versión vigente, nunca una cotización. `idempotency_key` evita duplicados; acepta exclusivamente `candidate_only` o `requires_evidence`, con hash de evidencia y hash de sujeto que informó el servicio interno. No admite `approved`, `verified` ni valores monetarios. Rechaza colisión de idempotencia con contenido distinto.
   - Tabla `cotironda_piloto_privado.ai_reconciliation_attempts_mvp328`: RLS habilitado, sin permisos directos a roles Data API ni service_role; solo el RPC restringido puede agregar. Triggers bloquean UPDATE, DELETE y TRUNCATE. **Esta inmutabilidad es a nivel aplicativo de PostgreSQL, no protección criptográfica frente a un superusuario/propietario**. Mantener respaldo y trazabilidad externa para auditoría completa.
2. `src/domain/ia-central/custodia-conciliacion-interna-mvp328.ts` — módulo **de biblioteca interna**, sin ruta HTTP ni cron. Requiere al llamador autenticación previa de operador y su alcance empresarial, worker confiable, RPC service_role aislada y clave AES-GCM no extraíble. Compara contra esquema estricto de la respuesta SQL, abre el cifrado solamente en memoria con AAD exacto `chat_hmac|message_hmac|text`, comprueba SHA del texto original, coincide el pedido con las líneas autorizadas por SQL y delega al cotejador MVP327. Almacena solo hash de la evidencia y códigos de motivos sin texto ni precios; sus retornos son `registrado_privado`, `ya_registrado`, `custodia_incompleta`, `no_elegible`, `conciliacion_incierta` o `deshabilitado`, siempre sin publicación ni mensajes.
3. `tests/unit/mvp328-internal-custody-audit.test.mjs`: cifrado real ficticio AES-GCM, fuentes alteradas, AAD, SHA, identidades, última versión, propuesta falsa, clave exportable, actor no validado, idempotencia y acuse perdido; asegura cero mensajes y cero llamadas IA.
4. `supabase/tests/ci/mvp328-private-custody-pg17.sql`: PostgreSQL 17 con actores, permisos y contratos ficticios, token inaccesible, acceso cruzado, registro y colisión, triggers antimutación, nueva respuesta de otro formato que desplaza a la anterior. Ejecuta un **ROLLBACK** final y no toca Supabase real.
5. CI `.github/workflows/cotironda-mvp328-custodia-auditoria-privada.yml`: Node22 + PostgreSQL17 efímero, sin credenciales ni costos externos.

## Límites de seguridad que aún NO están resueltos

- **No existe todavía un adaptador de autenticación de operador**, ni política de acceso por empresa/sujeto vinculada a este módulo. Los flags `trustedInternalWorker` y `operatorIdentityVerified` son requisitos para un **llamador servidor futuro**, no un método de autenticación por sí mismos. **No debe exponerse este módulo por HTTP ni activarse con service_role hasta integrar y probar esa capa.** El `actor_subject_sha256` es una referencia recibida del llamador: NO constituye una firma de identidad.
- Los `service_role` y las claves AES jamás pueden enviarse al navegador, incluirse en la respuesta web ni guardarse en GitHub.
- La tabla es una pista de auditoría, **no una autorización para aprobar**. No modifica `ai_supplier_review_mvp227`, `supplier_economic_facts_mvp168` ni la proyección buyer; no convierte `review` en `verified`, no adjudica, no altera ranking.
- No se procesa PDF, imagen, Excel ni Word: requieren verificación de contenido binario y extracción con evidencia.
- En un proyecto sin backup restaurable probado, **no aplicar SQL real solo para explorar una duda comercial**. Repetir preflight y guardias antes de un eventual «Publicalo» y no publicar sin autenticación de operador completada.
- La cotización de prueba no fue interpretada nuevamente ni quedó económicamente validada. No adivinar la causa histórica `semantic_review_required`.

## Criterios de aceptación y siguientes pasos

- Node22/PG17: autorización por ronda/proveedor, hash/AAD, source superseded, privacidad, write-once, idempotencia, actor no atestiguado, propuesta con monto alterado y pérdida de respuesta SQL.
- Integración futura: principal de operador desde sesión/autenticación real, permiso empresarial, servicio privado aislado, observabilidad sin PII, resolución de casos y autorización humana independiente *en un nuevo evento versionado*, con tests E2E. Hasta entonces, **no desplegar**.
- Completar soporte documental y validar el circuito real sin reenvío innecesario a Nahuel. No consumir un modelo pago sin justificarlo.

**Estado del MVP328:** implementación preparada y sujeta a la aprobación de CI, todavía no funcional en el piloto.
