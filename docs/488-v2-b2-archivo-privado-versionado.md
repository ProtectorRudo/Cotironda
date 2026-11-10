# Acta 488 — Presupuestos V2 B2: reingreso privado y versionado de originales

**Fecha:** 10/11/2026. **Estado:** desarrollo y pruebas solamente; **NO aplicado en Supabase, NO publicado**. Autorización: «Luz verde». Dependencias PR #762 (lector multiformato en sombra), ADR 486 y Issue #759/#760.

## Resultado de la auditoría real (solo lectura)

El proyecto `cotironda-piloto` tiene **dos PDF archivados con `state=stored`, `request_id=NULL`, revisión `suggested_only`**, ambos de proveedores con consentimiento vigente, ambos asociados a invitaciones entregadas y aún con `u.state=ambiguous_round`. En el ledger histórico MVP292 ambos figuran en `review`: uno `multiple_indistinguishable_rounds`, otro `archived_materials_disagree`. Es seguro diseñar una **lectura privada paralela** sin desbloquear la asociación de ronda ni alterar la fuente. No se ha comprobado todavía el contenido de los dos binarios con el nuevo lector.

## Cambio técnico preparado

- Migración aditiva `supabase/piloto/v2_b2_shadow_archived_supplier_read.sql`: tabla privada `v2_shadow_settings` con flag **deshabilitado por defecto**, y `v2_supplier_shadow_runs` con clave primaria `(source_hmac, processor_version='v2_b2_20261110')`. Cada archivo/versión se reclama **una sola vez**, con auditoría de estado/razón, SHA, MIME, timestamp y resultado privado. El histórico MVP292 **no se actualiza ni borra**.
- RPC interno `cotironda_piloto_claim_v2_shadow_b2()` comprueba flag, integración, permiso y consentimiento del proveedor, hash/archivo privado, fuente inconclusa, recuperación previa en review, invitación/entrega efectiva previa al archivo, integridad de ruta, cuotas (5 por hora) y no duplicación con `FOR UPDATE SKIP LOCKED`/insert único. **No asocia automáticamente a una ronda ni exige que una ronda ya vencida vuelva a abrirse** porque es análisis privado, no publicación.
- RPC `cotironda_piloto_finish_v2_shadow_b2()` concluye solo la misma reserva/version/hash y almacena candidata **no verificada** más diagnósticos por renglón y estado de completitud del modelo, o `review/uncertain`. Una reserva finalizada no puede reprocesarse por este camino. Un lease colgado no se libera sin diseño de recuperación seguro.
- Tablas con RLS y sin grants a `anon/authenticated`; ambas RPC `SECURITY DEFINER` con `search_path=''`, permisos revocados a `PUBLIC/anon/authenticated`, `EXECUTE` solo `service_role`. No hay lectura de candidatos a través del token del comprador.
- `src/domain/presupuestos-v2/worker-archivo-sombra.ts`: tras claim privado, descarga solo `cotironda-piloto-originals/media/<HMAC validado>` con cliente de servicio, exige tamaño exacto y **SHA de bytes independiente** antes de invocar lector V2 B1. Solo `candidate_private`, `review` o `uncertain` en ledger privado; devolución al caller únicamente con códigos no sensibles, `outboundMessages=0`, `publishedOffers=0`.
- Sin cambios en el Edge cron activo, Whapi, conexión de WhatsApp, proveedor, comprador, ranking, seguimiento o revelación. **No existe todavía un handler Edge que llame B2.** Su integración y habilitación del flag requieren preflight de bundle y autorización explícita `Publicalo`.

## Pruebas y criterios

En Node, falsos API, original sintético PDF, hash/tamaño incorrectos, fuente desaparecida, modelos que intentan publicación, ausencia de consentimiento (SQL), cuota, claim duplicado, resultado parcial de Excel y documento de dos renglones con uno incierto. En PostgreSQL17, tablas/RLS, acceso anónimo bloqueado, `service_role` permitido, flag off, invitación entregada, doble claim, SHA equivocado, documento inválido, finish duplicado, preservación total de archivos y del ledger MVP292; transacción completa `ROLLBACK`. Deno chequea los tipos del worker y el lector. Nada de modelos pagados, originales privados reales o WhatsApps en estas pruebas.

## Riesgos reconocidos y próximos pasos

1. **Sin publicación real:** actualmente no se han leído los binarios reales con V2; los datos pendientes permanecen en MVP292, no hay prueba E2E.
2. **Completitud por fuente:** el modelo puede omitir renglones aunque informe `model_reported_complete`. Es imprescindible un auditor independiente de PDF/imagen y extracción determinista de **todas** las celdas Excel, antes de comparar o mostrar importes.
3. **Condiciones fiscales y de pago:** precio unitario de lista, precio contado, IVA y flete no se deducen; requieren su propia evidencia antes de entrar al ranking.
4. **Persistencia privada no convierte datos en publicables:** las RPC V2 B2 nunca asignan `request_id`, no modifican oferta MVP107/347 ni contacto. Se necesita resolución de ronda inequívoca, validación por renglón y proyección propia de tracking antes de declarar circuito funcional.
5. **Reintentos agotados:** los originales en MVP292 siguen intactos. Cada versión V2 debe registrarse y autorizase de manera independiente; no debe existir un bucle que gaste IA ni un `UPDATE` que reinicie lesiones históricas.
6. **Impacto de costos:** la configuración real queda apagada; una futura invocación autenticada debe definir presupuesto/tasa, logs y alerta de fallos. No activar mientras faltan pruebas de source audit.

## Seguridad y autorización

«Luz verde» autoriza cambios en rama y pruebas sintéticas, no despliegue. Para «Publicalo» se requerirá verificar diferencia exacta contra piloto, migración en orden, rollback seguro, seguridad RLS, bundle/Edge con doble autenticación y una prueba controlada con una sola fuente, sin envíos WhatsApp. Se preserva el beneficio de proveedores gratis y cero pasos extra para comprador/proveedor.

**GitHub fuente de verdad:** README, AGENTS, CHANGELOG, Actas 486–488, PRs #761–#763, Issue #759 y #760.
## Incidentes prevenidos en CI (no llegaron al piloto)

- **Validación SQL triestado:** el primer test detectó que una condición con `p_candidate->>'document_kind' <> 'supplier_quote'` evaluaba `UNKNOWN` cuando faltaba la clave, y aceptaba `{}`. Se reemplazó por comprobaciones secuenciales con `IS DISTINCT FROM`; se agregaron pruebas de JSON sin campos, arrays inexistentes/vacíos y diagnósticos ausentes. En Postgres, **FALSE y UNKNOWN no son equivalentes**.
- **Escritura de SQL mediante código:** una sustitución JavaScript con una cadena de reemplazo que contenía `$'` (fin de regex + comilla) expandió el sufijo de todo el archivo y elevó su tamaño de ~11 KB a ~52 KB. PostgreSQL17 rechazó el SQL; se reconstruyó desde el commit limpio y se evitó la expansión usando una función como reemplazo, con verificación de longitud y patrón antes de publicar un PR. La migración real NUNCA se ejecutó.
- **Coherencia de fuente:** se agregó chequeo de HMAC hexadecimal y de `kind` entre archivo, inbox y registro de revisión; los dos PDF reales coincidían (consulta solamente de lectura).
- **Doble validación:** aun cuando el lector declare `can_publish=false`, el worker verifica otra vez el contrato documental, reconstruye diagnósticos estables y rechaza cualquier propiedad extra o campo malformado antes de guardar su candidata privada.

**Estado de CI tras las correcciones:** pruebas B2 Node **47/47** aprobadas; Deno tipo correcto; PostgreSQL17 de aislamiento del nuevo ledger **aprobado**; suite general Node **3.573 aprobadas, 0 fallidas, 10 omitidas**; PostgREST y verificación web aprobados. Build seguro Next.js todavía en ejecución al redactar esta nota. Todos estos ensayos fueron sintéticos; no se procesaron archivos reales ni se publicó nada.
