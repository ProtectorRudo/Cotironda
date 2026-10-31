# 115 — D052: recorrido real Node.js → PostgreSQL 17 de confirmación por WhatsApp

**31/10/2026 · Issue #207 · PR en borrador sobre D051/#206. Solo CI descartable.**

## Objetivo

La suite D051 probaba el adaptador TypeScript mediante una base simulada y las funciones SQL mediante PostgreSQL 17 por separado. D052 verifica que **las mismas implementaciones se comuniquen realmente** usando el driver `pg` de Node.js 22, en el contenedor PostgreSQL 17 existente de GitHub Actions.

## Implementación

- `scripts/ci/whapi-pg/confirm-d052-seed.sql`: crea, solamente en el laboratorio CI, un comprador, proveedor, contacto consentido, ronda y línea ficticios. Abre un login SQL de duración efímera con pertenencia **únicamente a roles gateway NOLOGIN** de D028, D047, D048 y D049/D051; el login no puede leer tablas directamente, editar precios por SQL DML ni asumir `postgres`.
- `scripts/ci/whapi-pg/confirm-d052-e2e.mjs`: programa una secuencia determinista que usa **las funciones reales** `procesarWebhookWhapiAislado` (D027), `construirBrokerWhapiPrivado` (D029), `crearPuertoPostgresWhapiD030`, D048 (proveniencia), D047 (encolar/reservar/acusar), `crearPuertoPostgresConfirmacionD051`, D050 (cita e intención) y D049 (persistir confirmación y versión).
- `.github/workflows/postgres-rls.yml`: nuevo paso D052 después de D031, con claves de HMAC/AES de prueba y contraseña aleatorias y enmascaradas. Usa exclusivamente PostgreSQL en `127.0.0.1`, no servicios externos. Al finalizar, el propio runner verifica en SQL las cantidades de mensajes cifrados, fuentes, trabajos, acuses, versiones y la baja registrada.

## Casos del escenario

1. Guardar un mensaje ficticio de presupuesto por el receptor y broker existentes, **sin afirmar que IA extrajo precios**: el importe de prueba se aporta explícitamente como fixture al guardado D048.
2. Construir y acusar un trabajo D047 de manera **sintética**. Se calcula el mismo HMAC del ID de mensaje que exige D050; nunca se llama HTTP a Whapi.
3. Recibir un «Confirmo» con `context.quoted_id`, almacenar su contenido con AES-256-GCM y recuperarlo en otra conexión al PostgreSQL real.
4. D050 comprueba que el ID citado coincide con el acuse HMAC de la misma ronda, empresa y chat; D049 confirma la versión económica en una transacción.
5. Reentregar el mismo webhook: no duplicar confirmación. Alterar la cita con el mismo message ID: colisión y rechazo. Faltante de cita, cita ajena y texto «No confirmo»: rechazo.
6. Guardar una corrección de precio como revisión 2. Un «Confirmo» nuevo sobre la respuesta de revisión 1 debe fallar; la revisión 2 se confirma como **versión 2**, preservando la primera.
7. Registrar BAJA y demostrar que se deniegan nuevas entradas, mientras que consultar un recibo idéntico ya confirmado es idempotente y no ejecuta una nueva adjudicación.
8. Demostrar denegación de SELECT directo de inbox/ofertas/cola y de SET ROLE postgres para el login CI. Confirmar las filas finales solo mediante un proceso de auditoría privilegiado independiente en el runner.

## Límites

**Este E2E sí ejecuta JavaScript real contra PostgreSQL real, pero NO prueba Whapi ni IA reales.** Todo mensaje, precio, ID de chat, acuse, número y organización es ficticio. El «transporte aceptado» es una simulación controlada sin llamadas de red y no significa entregado/leído. La prueba no verifica extracción IA, homologación técnica ni adjudicación; los precios de fixture se validan con D026 antes de confirmación.

No se instala ninguna migración comercial en Supabase DEV o producción, no se habilita el webhook, no se guardan secretos reales y no hay conexión remota. Siguen faltando el backup/restauración real de DEV (#175), un trabajador con permisos, integración/reconciliación con Whapi real, validación externa de `quoted_id`, límites de costos, consentimiento y pruebas con proveedores voluntarios. PR draft sin merge ni deploy.
