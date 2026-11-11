# Acta 492 — B5d: reauditoría privada versionada y archivos ya vinculados

Fecha: 10/11/2026 (Argentina). Autorización: «Avanza», **solo desarrollo y pruebas, sin publicar**. PR #768 sobre PR #767 B5.

## Diagnóstico del piloto confirmado en lectura de base

- V2 B2 conserva **dos candidatas privadas** del mismo proveedor Ailín, ambos PDF con `request_id IS NULL`, y su `processor_version=v2_b2_20261110` ya fue consumida. Repetir el claim B2 no las releería.
- Existen **cuatro fuentes ya asociadas a rondas** (`request_id IS NOT NULL`): tres PDF y una XLSX; dos proveedores distintos entre las fuentes PDF vinculadas. Las cuatro tienen invitación; las cuatro registran evidencia de envío previo.
- En dos fuentes vinculadas `whapi_inbox.request_id` es nulo aunque `media_archive_mvp095.request_id` es válido. **Exigir igualdad absoluta entre inbox y archivo descartaría una de las fuentes PDF y el Excel.** B5d admite inbox nulo, pero rechaza un valor contradictorio, y siempre valida la asociación original contra `requests`, `invitations` y despacho entregado.
- Los JPG de un participante sin consentimiento activo se mantienen fuera del selector.
- `v2_shadow_settings.enabled=false`, dos candidatas privadas, cero leases abiertos al momento de esta inspección. Ningún dato personal o contenido original se imprimió en el diagnóstico.

## Cambio desarrollado

1. **Migración independiente**, `supabase/piloto/v2_b5d_private_reaudit_and_linked_sources.sql`. Ledger `v2_source_review_b5d` con `(source_hmac,processor_version)` único, RLS, denegación a `PUBLIC/anon/authenticated`. Las RPCs `claim_v2_review_b5d` y `finish_v2_review_b5d` son exclusivamente `service_role`. Condiciones: flag V2 más flags de integración, SHA, archivo original almacenado, emisor registrado no revocado, fecha y estado. Para fuentes vinculadas verifica cliente con consentimiento, invitación preparada y salida WhatsApp efectivamente aceptada **antes de recibir el archivo**. No permite que la IA elija ronda, proveedor o ruta.
2. **Worker `worker-revision-archivos-b5d.ts`**. Con `historical_pdf` usa la candidata B2 guardada y evita otra llamada IA; con `linked_quote` descarga el mismo original desde Storage privado y crea una lectura V2 nueva, sin sobrescribir ninguna oferta existente. Siempre vuelve a comprobar tamaño y SHA. En PDF aplica el auditor posicional independiente B5 y conciliación decimal determinista; registra por renglón códigos neutrales, no datos privados en respuestas HTTP. El Excel se conserva en estado `b5d_cell_audit_pending` porque aún falta la comprobación de TODAS las celdas. Una discrepancia no se camufla.
3. **Sin nuevo cron, webhook ni secreto**. El mismo handler protegido `cotironda-piloto-v2-shadow` llama como máximo a B5d si B2 devuelve `empty`, sin admitir cuerpo, parámetro, identificación de archivo ni lote de parte del invocador. Usa la misma doble autenticación existente. El index de la Edge es el único que habilita la segunda cola. Este código **no está desplegado**.
4. **Privacidad invariable:** ninguna tabla de ofertas, tracking o ranking es modificada. Resultado `publishedOffers=0`, `outboundMessages=0`, `sourceVerified=false`. No se notifica comprador/proveedor ni se revela contacto. Tampoco se intenta completar IVA/flete cuando el original calla.

## Criterios de aceptación y pruebas

- No reintentar B2 consumido ni modificar originales/ledger MVP292/B2.
- Recuperar PDF histórico sin llamar OpenAI; XLSX y PDF vinculados a su única ronda previa sin aceptar datos del modelo para asociar.
- Rechazar hash alterado, clave sin forma correcta, proveedor revocado, invitación inexistente, despacho no acreditado, inbox contradictorio, duplicados y re-finish.
- Con flag OFF, cero descargas y cero IA. Resultado HTTP solo estado genérico.
- Pruebas Node del worker y Edge existentes, tipo completo Deno Edge y PostgreSQL 17 con `BEGIN/ROLLBACK`, sin tocar proyecto real. CI B5d se ejecuta en GitHub (véase PR #768). Cualquier error no se declara éxito.

## No resuelto todavía

- Los documentos originales reales de Ailín **no fueron cotejados con B5d** porque el módulo solo existe en la rama de desarrollo. La coincidencia de renglón no certifica cantidad completa de filas, descuento en columna, IVA/flete en encabezados ni todo el contenido del PDF.
- Nahuel (Excel/PDF) **todavía no fue reingresado al nuevo ledger en el piloto real**. XLSX necesita comprobación nativa de celdas y fórmulas. Nada de su transcripción es oferta comercial acreditada hasta ese paso.
- B6 compara únicamente artículos equivalentes, cantidades y unidades normalizadas, cobertura, descuento/IVA/flete explícitos; nunca totales de distinto pedido. B7 expone renglones acreditados en seguimiento y al cierre revela los proveedores según reglas y protege comprador/telefonía.
- No se hizo prueba real E2E WhatsApp → proveedores → documentos → ranking → enlace → cierre. **No declarar el piloto operativo.**

## Secuencia propuesta de publicación controlada (requiere «Publicalo»)

1. Confirmar CI, snapshot de tabla y RPC existentes, respaldo lógico y Edge publicada sin deriva; chequear flag OFF y ausencia de envíos pendientes.
2. Aplicar **solo a `cotironda-piloto`** la migración B5d. Comprobar `anon/authenticated` denegados, `service_role` permitido y cero claims con flag OFF.
3. Desplegar una única versión de Edge B3 que integre B5c/B5d, verificando doble autenticación, rechazo a POST con bytes y sin cambios en el bridge B4, cron, WhatsApp o seguimiento.
4. Habilitar V2 temporalmente por ventana controlada; procesar las dos fuentes históricas y vinculadas elegibles; revisar estados privados por códigos, NO copiar importes/contactos a logs, vigilar tasa de consumo. Luego apagar el flag.
5. Conservar la evidencia y continuar auditoría íntegra de descuentos y celdas; solo cuando exista acreditación completa implementar B6/B7 y prueba E2E. No hacer proyección pública de candidatas actuales.

La prioridad comercial sigue siendo recibir cualquier presupuesto razonable sin pedirle trabajo adicional al proveedor y entregar precios **fieles al original**, no aparentar avance por tests aislados.

## Auditoría de elegibilidad REAL, solo SELECT (10/11/2026)

Se ejecutó en `cotironda-piloto` la condición **equivalente al SELECT de claim B5d**, sin instalar la migración, crear leases ni activar V2. Los seis archivos cumplen el conjunto de predicados de archivo almacenado, mismo SHA/origen, ventana, consentimientos, emisor, invitación y entrega, según corresponda: **2 PDF históricos B2**, **3 PDF vinculados** y **1 Excel vinculado**. Esta prueba es una verificación de datos reales del selector, distinta de los ensayos PG17 sintéticos. No se leyeron bytes privados con B5d ni se certificaron importes.

El código no hizo consultas SELECT que impriman números, HMAC, identificadores de ronda o texto personal. Se mantiene el flag OFF y `0` publicaciones V2. Cuando se autorice el despliegue, se debe contrastar de nuevo que el selector no cambió por nuevos mensajes, revocaciones o vencimientos.

## Extensión B5e — evidencia independiente de renglones XLSX (solo desarrollo)

Se reutiliza `readOfficeVisibleRows` de Cotironda, lector ZIP/XML del archivo Excel **original**, sin depender de la transcripción de OpenAI. La Edge B3 inyecta el adaptador al trabajador B5d; el verificador puro `evidencia-xlsx-original-b5e.ts` comprueba SHA de bytes, compara descripción y cifras literales por renglón, rechaza coincidencias duplicadas y detecta filas monetarias/fiscales omitidas.

Su éxito se llama `rows_match_but_xlsx_not_certified` y se guarda solamente como diagnóstico privado; `cell_coordinates_verified=false`, `formulae_verified=false`, `full_document_covered=false`, `can_publish=false`. Si el parser nativo no puede abrir la planilla, si la moneda está formateada sin literal o si hay campos dudosos, sigue en revisión. No convertir esta detección de coincidencias en una cotización verificada.

Pruebas nuevas con ZIP/XLSX sintético real en Node: coincidencia de fila, pallet con precio omitido, IVA omitido, precio alterado, hash corrupto y fallo de parser; más Deno Edge y PostgreSQL17. **El Excel real de Nahuel continúa sin probar con este nuevo auditor**, porque B5d/B5e todavía no se instaló en piloto.
