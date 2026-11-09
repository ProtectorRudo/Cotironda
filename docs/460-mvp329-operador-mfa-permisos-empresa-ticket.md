# Decisión 460 — MVP329: conciliación interna con operador MFA y permiso por comprador

**Fecha:** 09/11/2026 (ART). **Orden:** «Luz verde» = desarrollar, probar y documentar, **sin publicar** SQL, Edge, Vercel, WhatsApp ni reactivar automatizaciones.

## Situación inicial

MVP327 coteja económicamente originales textuales sin rehacer llamadas a IA; MVP328 contiene un lector interno del sobre AES-GCM, un registro de intentos append-only y un módulo privado, pero el uso efectivo dependía de banderas `operatorIdentityVerified` y `trustedInternalWorker` aportadas por un llamador todavía inexistente.

La auditoría de Supabase `cotironda-piloto` encontró un control real ya instalado que conviene reutilizar: `cotironda_piloto_privado.operator_session_mvp267()`. Éste valida `auth.uid()`, una cuenta de `auth.users` no anónima, operador activo ligado administrativamente a esa cuenta, sesión existente en `auth.sessions`, emisor correcto del piloto, JWT `role=authenticated`, MFA `aal2`, `sub` y caducidad; incluye suspensión/revocación de cuenta. No confía en `user_metadata` ni en un UUID presentado por el solicitante.

La base piloto fue consultada **solo lectura** y arrojó **0 operadores instalados y 0 sesiones/usuarios Auth**. Por lo tanto, el acceso real no se puede considerar habilitado ni probado E2E: el resultado seguro debe continuar siendo denegación para todos hasta el enrolamiento autorizado.

## Implementación exclusiva de desarrollo

Se agrega `supabase/piloto/mvp329_operador_conciliacion_tickets_scope.sql` **sin aplicarlo al piloto**:

1. Tabla privada `operator_reconciliation_grants_mvp329` (RLS + revocación de permisos Data API) con autorización administrativa explícita **operador UUID + ronda UUID + buyer_key de empresa/comprador**, vigencia acotada a 30 días, activa solo si fue habilitada manualmente. No se crean grants ni operadores automáticamente; se compara la empresa vigente `requests.buyer_key` contra la registrada, para que un permiso de otra empresa jamás coincida.
2. Tabla privada `operator_reconciliation_tickets_mvp329` (RLS y sin SELECT/INSERT de clientes). Guarda el **SHA-256 del ticket**, no su valor, junto con el operador, Auth user, sesión, ronda, empresa, mensaje y chat; vence en **90 segundos**, con marca de consumo única.
3. RPC autenticada `cotironda_piloto_operator_issue_reconciliation_mvp329`: llama al **validador real MVP267** de MFA AAL2/sesión vigente. Exige grant activo por ronda y empresa, último original textual y revisión comercial finalizada verificados por MVP328. Devuelve **solo** ticket aleatorio opaco hexadecimal y duración; no texto, proveedor, contacto, importes ni ciphertext. Limita tickets activos y emisión diaria. Rol de ejecución exclusivo `authenticated`.
4. RPC exclusiva `service_role` `cotironda_piloto_claim_reconciliation_mvp329`: consume ticket una sola vez con bloqueo de fila, y comprueba otra vez grant, empresa, cuenta habilitada, `auth.sessions` vigente y misma fuente MVP328. Devuelve una referencia **hasheada** de actor derivada del Auth user persistido y el mismo contexto de ronda/mensaje/chat; nunca el original.
5. Biblioteca interna `src/domain/ia-central/operador-conciliacion-autorizado-mvp329.ts`: no acepta una bandera de identidad enviada desde el cliente ni un `operator_ref`. Solo invoca MVP328 después de que la RPC de consumo devuelve un resultado de forma exacta; toda denegación falla cerrada. Conecta la identidad derivada de SQL al registro de intento del MVP328 sin aprobar cotización ni revelar importes.

**Protecciones:** no hay endpoint HTTP nuevo, no se comparten claves AES ni `service_role` con el navegador, no hay alta pública de usuarios, no se agregan integrantes de empresas, no se crea acción de aprobación y no se accede al original histórico. La concesión de permisos empresariales por un DBA y la validación de operador real serán procedimientos explícitos posteriores.

## Verificaciones

- PostgreSQL 17 aislado: el test `supabase/tests/ci/mvp329-scoped-operator-auth-pg17.sql` instala MVP328 y el **helper de sesión MVP267 copiado sin cambios desde su migración original**, con Auth, empresa, proveedores, convocatorias y originales **ficticios**. Comprueba MFA AAL2 + sesión existente, grant exacto por buyer_key, chat correcto, prohibición de SELECT directo, un solo consumo, negativa por replay, sesión borrada, permiso revocado, acceso a otra empresa y ACL diferenciada `authenticated/service_role`. Finaliza con `ROLLBACK`.
- Node `tests/unit/mvp329-operator-reconciliation-ticket.test.mjs` usa AES-GCM ficticio e inyecta respuestas privadas controladas: suplantación de actor, sesión sin ticket, replay, pérdida de ack, cita de pedido alterada, monto falseado y hash de actor derivado por SQL. Ninguna llamada IA o WhatsApp.
- CI `.github/workflows/cotironda-mvp329-operator-scope-tickets.yml` más controles generales Next.js, Deno y PG17 del repositorio.

Las pruebas con un JWT simulado verifican la **lógica SQL**, no la firma criptográfica: en servicio real, Supabase PostgREST valida la firma y el emisor antes de proporcionar `auth.jwt()/auth.uid()`. El módulo no sustituye `auth.getUser(jwt)` cuando se cree una ruta HTTP.

## Límites de lanzamiento y próximos pasos

**MVP329 no basta para operar conciliaciones en vivo:** faltan una ruta privada y un worker con `getUser`, verificación de origen y revisión de claims, transferencia segura de ticket por servidor, provisión manual de operador real con MFA y permiso por empresa, almacenamiento no exportable de AES, `service_role` exclusivamente servidor, log sin texto ni precios, pruebas reales de revocación y una decisión humana verificable separada que nunca sobrescriba la interpretación histórica. Los RPC y la biblioteca quedan **sin publicar** con «Luz verde».

Para habilitar futuras conciliaciones: preflight de funciones MVP267/328/329, backups restaurables, asignación explícita por empresa, despliegue solo en piloto bajo **«Publicalo»**, pruebas JWT reales de E2E con operador MFA y un documento sintético. No habilitar el original de Nahuel antes de superar esos controles.

**No declarar la cotización de Nahuel acreditada.** El piloto mantiene una revisión comercial sin precio verificado. La protección del buyer en el seguimiento v27 y los envíos automáticos OFF no se alteran.
