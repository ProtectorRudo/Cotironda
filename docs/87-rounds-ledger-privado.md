# 87 — D024 / Etapa 03: ledger PostgreSQL privado de rondas

**30/10/2026 · Issue #147 · rama `feat/03-private-round-ledger` (apilada sobre PR #146).**

## Objetivo acotado
Preparar una **estructura persistente fail-closed** para los contratos offline D022/D023, sin habilitar licitaciones reales. SQL versión D024: `supabase/sql/rounds_private_ledger_d024.sql`. **No es una migración oficial ni está instalada en Supabase DEV.** Así no se altera el historial de las doce migraciones de Etapa 01 hasta verificar y aprobar el contrato de escritura segura.

## Esquema privado
Todas las tablas están en `cotironda_private`, RLS habilitada y **sin políticas permisivas**. Se revoca acceso a `PUBLIC`, `anon`, `authenticated` y `service_role` incluso sobre funciones de validación. No existen endpoints ni RPC expuestas. Un backend de aplicación no puede comenzar a escribir a este esquema sin diseño y autorización posterior.

- `rounds_v1`: empresa compradora y fechas, estados `programada/abierta/cerrada/cancelada`. Trigger con reloj de PostgreSQL: sólo transiciones válidas, ventana máxima técnica de 30 días, cierre al vencimiento; no reabrir, reescribir comprador ni fechas.
- `round_items_v1`: hasta ocho renglones sintéticos con cantidades decimales y unidades cerradas; sin texto de pedido ni documentos. **Las líneas y las invitaciones se congelan al abrir la ronda**, con bloqueo de inserciones, ediciones y borrados posteriores.
- `round_invites_v1`: asociación privada entre ronda, proveedor real de la base y alias anónimo. FKs compuestas y número de invitación 1..10; evita invitaciones duplicadas por proveedor o alias.
- `offer_drafts_v1`: revisión por ronda/proveedor con pagos, flete, IVA por ítem y estructura de líneas estricta. Trigger exige revisión inicial 1 y luego incremento exacto de 1; estado de ronda abierta **dentro de la ventana de tiempo del servidor**.
- `offer_events_v1`: idempotencia por `(round_id,event_id)`, proveedor y revisión; almacena SHA-256 **aportado por futuro backend autenticado**, sin mensaje ni contenido libre. Trigger impide edición y borrado.
- `offer_versions_v1`: instantáneas confirmadas con `(round_id,supplier_org_id,version)` y `draft_revision`, evento de confirmación vinculado, términos económicos y snapshot de líneas. Trigger exige ronda abierta **y no vencida**, correspondencia exacta con borrador, evento de confirmación de la misma revisión y versión secuencial. Trigger impide UPDATE/DELETE de confirmaciones.

El snapshot JSON tiene un esquema de cinco claves técnicas exactas por línea: `line_no`, `unit`, `available_qty`, `net_unit_price`, `vat_rate`. No admite nombre de proveedor, correo, teléfono, SKU ni atributos adicionales. Prohíbe duplicar renglones o referir un renglón ajeno a la ronda. Nulos en precio/IVA representan incertidumbre; ninguna moneda, impuesto ni entrega se suponen.

## Seguridad: qué **NO** demuestra esta estructura
- Una clave de servicio no adquiere acceso directo por instalar las tablas. La futura API deberá verificar sesión vigente/no revocada, pertenencia empresarial, rol, que el proveedor fue invitado y opt-in antes de escribir, y autorización de comprador para abrir/cerrar.
- El trigger de integridad **no sustituye** una operación atómica de recepción: crear evento, escribir/corregir borrador y confirmar requieren funciones servidor con transacciones, bloqueo de ronda/proveedor y comparación de hashes bajo concurrencia.
- El SHA-256 almacenado está pensado para reproducibilidad/idempotencia; sin función que calcule y compare el hash de una petición autenticada, **no basta como protección contra reenvíos**. No afirmar deduplicación end-to-end operativa.
- `offer_versions_v1` no acepta una validación técnica proveniente del proveedor: equivalencia conforme debe ser certificada por el backend antes de pasar al comparador D022. Tampoco garantiza monto correcto sin cotejo con factura/precio confirmado.
- Tablas privadas y un trigger no garantizan anonimato del lado de un futuro endpoint. El API de comparación al comprador deberá usar sólo `anon_id`; el supplier_org_id permanece en privado.
- La inmutabilidad por trigger protege contra modificaciones ordinarias de filas, no contra un administrador de base que cambie DDL o desactive triggers. Se requieren auditoría externa y backups.

## Pruebas y puerta de calidad
Se agregó paso independiente al job PostgreSQL 17 existente `.github/workflows/postgres-rls.yml`, **después de las 12 migraciones**, sin crear una decimotercera entrada histórica. Prueba `supabase/tests/ci/99_rounds_private_ledger.sql` con organizaciones y productos ficticios en transacción revertida: RLS y permisos, plazos, apertura y cancelación, congelamiento de invitaciones después de abrir, ids y aliases únicos, payload de precio sin texto libre ni PII, revisión obsoleta, correspondencia evento/proveedor, versiones consecutivas, versiones inmutables y limpieza de datos con ROLLBACK.

**Pendiente:** evidencia CI verde del SHA exacto, revisión del esquema/trigger bajo concurrencia real y diseño de API segura. No instalar en Supabase DEV, no cambiar registro, Storage, cron ni reservas de IA, no habilitar usuarios/WhatsApp ni publicar producción.

## Próximo incremento propuesto (D025)
Operación server-only transaccional y autenticada por empresa (crear ronda, invitar únicamente por catálogo/zona/consentimiento, guardar y confirmar con compare-and-swap, cerrar con foto del comparador D022). Ensayar con dos empresas y dos proveedores genuinamente aislados, revocación de sesión y duplicados concurrentes antes de conectar UI/Whapi.
