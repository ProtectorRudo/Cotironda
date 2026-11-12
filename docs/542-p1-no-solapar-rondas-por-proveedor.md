# Acta 542 — P1: evitar dos rondas vigentes para el mismo proveedor

**Fecha:** 12/11/2026. **Orden:** «Avanza y registra en checklist y plan maestro». **ÚNICAMENTE DESARROLLO**, sin instalar migración en PILOTO, sin publicaciones ni mensajes.

## Problema probado (Acta 541)

El archivo de 10/11 se archivó correctamente; el webhook sí llamó a MVP225, que dejó `ambiguous_round` con **dos solicitudes candidatas**. M291 terminó en `insufficient_material_evidence` y hay un reintento consumido. Aunque ahora exista una sola ronda preparada, **nunca se debe elegir retrospectivamente** por mera proximidad temporal.

Una inspección adicional del PILOTO revela **cero preámbulos MVP238 registrados para el chat del candidato** y ningún vínculo de origen inequívoco en la base. No tenemos evidencia suficiente para adjudicar ese archivo a una de las dos solicitudes. **No reintentar ni reescribir los `request_id` anteriores.**

## Corrección concreta para las rondas FUTURAS

**`supabase/piloto/p1_evitar_rondas_solapadas_proveedor.sql`** versiona la función **existente** `public.cotironda_piloto_ia_publish_mvp222(uuid)` con una protección previa a generar invitaciones y trabajos.

- Después de bloquear las filas del proveedor `FOR UPDATE OF p`, en orden estable, y antes de insertar una sola `invitation`, se comprueba si existe **otra solicitud distinta en estado `prepared` y no vencida**, con invitación `prepared` al mismo proveedor. Incluye solicitudes legacy y central; también las preparadas aún sin envío porque podrían enviarse después.
- Con cualquier conflicto retorna **`supplier_active_round_conflict`**. Mantiene la nueva ronda `draft`, sin invitaciones, sin `ai_dispatch_jobs` ni `whapi_outbox`. No reintenta el envío anterior ni modifica fuentes o presupuestos.
- Solo los proveedores compartidos bloquean. Una ronda para proveedores **distintos** puede seguir normalmente. Rondas **cerradas o vencidas** no bloquean.
- Se reutiliza la función, bloqueo y permisos actuales; sin nueva tabla, cron, IA, proveedor obligado a elegir ronda, ni texto saliente. La consulta es interna: no devuelve IDs, nombres, teléfonos, archivos o precios.
- `FOR UPDATE` ordenado de proveedores serializa publicaciones concurrentes que involucran al mismo proveedor. El guard consulta las invitaciones antes de mutarlas y falla de forma conservadora. Se requiere validación de concurrencia real antes de instalar.

## Auditoría de compatibilidad obligatoria (bloqueo real detectado)

La primera versión del parche se derivó de `mvp222_ia_despacho_seguro_sin_activar.sql`, que NO es la última definición instalada. **Habría sobrescrito las protecciones posteriores** de confirmación autenticada del comprador `confirmada_comprador_mvp280` y autoridad de fuente documental `fuente_original_documental_mvp276` / `fuente_binaria_comprador_mvp278`. **La detecté antes de integrar o instalar y la corregí.** Ninguna base ni proveedor estuvo expuesto por esta versión en desarrollo.

Se consultó la definición real de PostgreSQL del PILOTO **solo lectura** y se comprobó que su cuerpo equivale al de `supabase/piloto/mvp280_confirmacion_unificada_comprador.sql` (ignorando formato emitido por `pg_get_functiondef`). La versión final de `p1_evitar_rondas_solapadas_proveedor.sql` parte **exactamente de MVP280**, no de MVP222, e incorpora exclusivamente el guard de proveedores.

El test Node `p1-supplier-round-overlap.test.mjs` compara de manera estricta **todo el cuerpo MVP280 contra la nueva función al quitar el único bloque P1**. Además de verificar la presencia de las tres autoridades, PG17 ahora incluye stubs **sintéticos solo para CI** para los checks MVP276/278/280 y prueba que una ronda sin revisión de comprador sigue bloqueada; después prueba el caso de ronda superpuesta y el de proveedor distinto. Los stubs **nunca forman parte de la migración real**.

**Prerrequisito para cualquier publicación futura:** contrastar otra vez la función viva contra la fuente MVP280 (la política podría cambiar con PR intermedios). **No publicar** si una migración posterior cambió la función; rebasar y auditar primero. La protección no resuelve los documentos históricos y no sustituye consentimiento de originales.

## Pruebas y criterios

- `tests/unit/p1-supplier-round-overlap.test.mjs`: guard después de lock y antes de invitaciones, resultado cerrado y ACL service_role.
- Se amplió la fixture **`supabase/tests/ci/mvp222-ia-despacho-pg17-rollback.sql`**: migración nueva + línea base MVP221/MVP222, publicación simultánea a proveedores distintos (permitida), intento al mismo proveedor (bloqueado), ausencia de efectos parciales, cierre de ronda antigua (permitida) y privilegios. **ROLLBACK**.
- Job `pg17-p1-no-overlap` en `.github/workflows/unit-tests.yml`, rama exacta, Postgres 17 sintético y sin credenciales del PILOTO. Auditar resultados CI sobre el SHA definitivo.
- **No** declarar P1 cerrado por pruebas sintéticas. Falta respuesta real de los dos proveedores con origen verificable y seguimiento en navegador.

## Estado y próxima acción

**PILOTO ACTUAL:** 1 ronda `prepared` vigente, 2 despachos aceptados, 1 proveedor con archivo en conflicto `ambiguous_round` (2 candidatos históricos), 1 sin archivo candidato, **0/2 documentos verificados**, MVP354 aún sin instalar. Sin prueba comercial E2E.

- [x] Se verificó la causa de ambigüedad histórica y la ausencia de preámbulo asociado.
- [x] Corrección prospectiva de publicación en código, sin tocar el documento antiguo.
- [x] **CI 6/6 SUCCESS** verificada sobre SHA técnico `1228208aa7e3045672d394bace383f9b0759ab72`: Node (incluida equivalencia MVP280), PostgreSQL17 aislamiento, PG17 despacho con test propio `P1 ONE ACTIVE ROUND PER SUPPLIER PASS` + ROLLBACK, PostgREST, Next.js y sitio. El cambio de esta acta solo actualiza documentación; verificar de nuevo CI del HEAD.
- [ ] Revisar concurrencia real y seguridad antes de activar en PILOTO.
- [ ] Solo tras `Publicalo en cotironda-piloto` explícito: instalar y probar esta protección, así como MVP354/MVP355, usando una ronda controlada y **sin superponer una nueva sobre la vigente**.
- [ ] Acreditar una nueva respuesta inequívoca de cada proveedor; si no llega, seguir mostrando PENDIENTE o revisión interna. Verificar comprador autenticado, cierre, consentimiento de originales y descarga segura.
- [ ] P0–P5 abiertos.

**Compatibilidad comprobada en código:** el flujo de publicación del comprador M226 devuelve `ronda_en_sombra` / `needs_publication_review` cuando SQL no devuelve `ready_for_delivery`; auto-release M306 retorna `no_elegible`, y revisión M279 `confirmado_sin_envio`. Ninguno interpreta `supplier_active_round_conflict` como publicación exitosa ni autoriza automáticamente un segundo envío. **No son pruebas remotas Whapi.**

**Próximo paso único:** con orden explícita `Publicalo en cotironda-piloto`, contrastar otra vez la definición viva MVP280, activar la guardia transaccional y probar UNA ronda después de resolver la ya preparada; verificar dos originales auténticos con vínculo, recepción/seguimiento y navegador. No más parsers PDF ni reintentos históricos sin evidencia.

Continuidad: [Issue #794](https://github.com/ProtectorRudo/Cotironda/issues/794) · [Plan Maestro](https://github.com/ProtectorRudo/Cotironda/blob/docs/p0-evaluacion-erpnext-vs-nucleo-20261111/docs/PILOTO-100-PLAN-MAESTRO.md) · [Acta 541](541-p1-ambiguedad-registrada-vinculo-seguro.md).
