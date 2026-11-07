# Decisión 425 — MVP299: respuestas interpretadas separadas de ofertas económicamente verificadas

**Fecha:** 07/11/2026. **Estado actual: PUBLICADO Y VERIFICADO A NIVEL DE DESPLIEGUE SOLO EN EL PILOTO.** Referencias: [issue #691](https://github.com/ProtectorRudo/Cotironda/issues/691), [decisión 424](424-mvp298-acuerdo-economico-doble-lectura.md). El E2E comercial normal sigue pendiente; producción general, secretos, cron y datos históricos excluidos.

## Hallazgo confirmado

En el recorrido IA Central, el modelo interpreta una fuente del proveedor dos veces; cada lectura comprueba citas, importes, estados fiscales y correspondencia al pedido. El validador de precios puede devolver `requiere_revision` por moneda no informada o precio sin conciliación, aunque la lectura contenga respuestas de materiales identificadas y un `summary` privado.

Hasta ahora `cotironda_piloto_ia_buyer_rubros_mvp227` devuelve **solo** presupuestos `verified` y el seguimiento comprador recibe exclusivamente ofertas económicamente validadas. Es un bloqueo de visibilidad de respuestas, **no** licencia para declarar comparable un precio desconocido.

Evidencia real de solo lectura anterior: WhatsApp piloto v67, seguimiento v23, recuperador v8, 83 migraciones; dos despachos `api_accepted`, una revisión comercial histórica `semantic_review_required` con `summary=null`, cero `verified`. Esa revisión **no** se reinterpreta ni se convierte en respuesta visible; el documento ambiguo de Ailín tampoco.

## Contrato desarrollado

1. El productor MVP227 agrega **solo a su resumen privado** `cobertura_pendiente_mvp299=true` si ambas lecturas fueron válidas, hay al menos un artículo interpretado y **todas** las razones comerciales pertenecen a una lista cerrada: `moneda_no_informada`, `importe_sin_conciliacion`, `cargos_adicionales_sin_comparacion`, `sin_precios_comparables`. Mapeo inconsistente, fuente incompleta, precio/cantidad sospechosa, IVA/flete no acreditado y condiciones inválidas → `false`. No se agregan llamadas de IA.
2. Nueva función privada `cotironda_piloto_ia_pending_coverage_mvp299(p_token_hash)` con `SECURITY DEFINER` y `search_path=''`, revocada a `PUBLIC/anon/authenticated`, otorgada solo a `service_role`. Verifica token/revocación/caducidad, comprador y consentimiento, ronda con sombra IA, proveedor y consentimiento, dispatch `api_accepted` anterior, vínculo de fuente y SHA de texto o paquete documental, revisión final `review/conditions_need_review` y marca privada estricta, última fuente y versión; coteja los rubros y cantidades con `ai_shadow_destinos`. Solo devuelve `label` genérica `Respuesta en revisión N` y conteos `rubro/solicitados/respondidos`; **no** entrega nombre, teléfono, precios, IVA, flete, HMAC/SHA ni documentos. Si excede límite, falla cerrado.
3. Nuevo validador `vistaPendientesRubrosMvp299` asegura estructura exacta, etiquetas únicas, límites, rubros conocidos y consistencia con la lista solicitada del propio comprador obtenida del RPC original. Cualquier campo privado añadido invalida la proyección, no se copia a cliente.
4. La Edge seguimiento conserva `can_open` y `offers` verificados intactos. Realiza una consulta independiente y agrega únicamente `pendientes_rubros_ia`, sin permitir que el resultado alimente el comparador MVP255, la economía, los finalistas ni los contactos.
5. Proxy Vercel `/api/estado` aplica una **segunda reducción** antes de `if(!can_open)`, por lo que el comprador puede saber que recibió respuestas interpretadas sin apertura de una oferta verificada. Revalida flags, etiquetas, conteos, rubros y solo copia campos permitidos. La web distingue «Respuestas recibidas · precios pendientes de comparar» y nunca las incorpora al ranking.
6. Los textos «X de Y artículos interpretados» **no certifican** equivalencia física final, stock, plazo, moneda, IVA, flete, total ni adjudicación. Son información preliminar y no generan obligación ni pedidos a los proveedores.

## Reglas de riesgo y aceptación

- **No** reescribir el ledger histórico genérico, no reintentar IA, no reusar cotización anterior si llegó una fuente posterior (aunque esta todavía no esté aprobada).
- **No** contabilizar un documento cuya procedencia no corresponda a sus controles reales, ni mezclar empresas, rondas, hashes o fuentes versionadas.
- **No** convertir `review` en `verified`, inferir ARS por `$`, comparar totales parciales ni mostrar identidades antes de condiciones autorizadas.
- Si faltan permisos, token, control de fuente, esquema, integridad de rubros o lectura de la nueva RPC: **no se muestra** sección nueva.
- Pruebas: Node síntético para motivo seguro/no seguro, serializador Edge, proxy y datos inyectados; PostgreSQL 17 con rollback: ACL, dos compradores, respuesta válida, resumen privado con importe prohibido, semántica sin fuente, revocación, fuente posterior, versión desactualizada; Deno del webhook y seguimiento; regresiones MVP227/295/297 y JavaScript browser.
- Verificar PR y CI real antes de cualquier integración. **La publicación futura necesita «Publicalo» aparte** y la secuencia preflight de entorno → migración → Edge WhatsApp + seguimiento → web, sin activar/repetir mensajes. Vercel puede estar limitado por cuota; no sustituir el endpoint con HTML inseguro.

## Acta de integración y verificación — 07/11/2026

- [PR #692](https://github.com/ProtectorRudo/Cotironda/pull/692) fusionado por squash a `feat/mvp174-supplier-packaging-equivalence`; commit `55bba4732d3947ef499753f2b69748861b36f5a0`. `main` y producción quedan fuera de alcance.
- **27/27** GitHub Actions del PR finalizados en `success`, sin fallos. La suite focalizada `safe-pending-coverage` aprobó **34/34** pruebas, la SQL PG17 transaccional aprobó y verificó rollback; Deno y Next.js pasaron.
- Vercel registró dos estados externos de despliegue por **límite de compilaciones diario** (no por un error de los controles locales). No se realizó ningún deploy Vercel.
- Inspección de solo lectura del piloto: Whapi **v67**, seguimiento **v23**, recuperador **v8**, **83 migraciones**, `mvp299_installed=false`, 0 ofertas IA `verified`, 1 fuente histórica `review` con `summary=null`. Ninguna fuente histórica se reprocesó ni se enviaron mensajes.
- La funcionalidad está **lista a nivel de desarrollo y CI**. El funcionamiento real de las futuras respuestas no está certificado sin `Publicalo` y una prueba E2E posterior.

## Lo que aún impide declarar E2E normal completo

La visualización preliminar de cobertura no equivale a dos cotizaciones económicamente verificadas. Persisten pruebas prospectivas comprador WhatsApp → confirma → PDF por rubro → proveedores → dos respuestas nuevas (texto/PDF/Excel) → lectura IA → comparación de fuentes → pantalla con token → vencimiento y cierre correcto → finalistas consentidos y contactos autorizados. No obligar a proveedores ni al comprador a etiquetar manualmente rondas. Los originales de Ailín y Nahuel permanecen protegidos.


## Acta de publicación real MVP299 — 07/11/2026

- Autorización expresa: **«Publicalo»**, limitada a los dos MVP en `cotironda-piloto`. Rama integrada `feat/mvp174-supplier-packaging-equivalence`; código fusionado del PR #692 en `55bba4732d3947ef499753f2b69748861b36f5a0`. CI de esa integración: **27/27 checks exitosos; 34/34 unitarios focalizados**.
- Supabase piloto `ilggkalaafhtiysyzlmg`: migración `20261107215859_piloto_mvp299_respuestas_interpretadas_sin_precio_comparable`, total **84**. Consulta real comprobó `anon_execute=false`, `user_execute=false`, `service_execute=true`, token inválido `not_found`. Para una ronda preparada con token vigente, estado `respuestas_pendientes_por_rubro`, **0 respuestas**; los enlaces sin ronda IA válida devolvieron `not_found`.
- WhatsApp `cotironda-piloto-whapi`: **v67 → v68 ACTIVE**, 58 archivos; fuente en dos módulos modificados coincide byte a byte con GitHub. Seguimiento `cotironda-piloto-seguimiento`: **v23 → v24 ACTIVE**, 27 archivos, añadiendo solo el DTO MVP299 y actualizando `index.ts`. Cotejados byte a byte contra el código fusionado. Cinco imports a archivos no incluidos eran preexistentes en el bundle v23 y son todos `import type` (no imports ejecutables); no se añadieron referencias sin resolver.
- Vercel: desplegado únicamente en proyecto separado **`cotironda-seguimiento-vista-piloto`** (`prj_0kZzvuzEg7vL4FzsqbdARKeoHzLk`, no proyecto principal `cotironda`). Despliegue **`dpl_FoY1XhAXg5hWVjxmfYQnh6NEYjWc`**, `READY`, con `target=production` **solo dentro del proyecto web del piloto**, commit `55bba473`. El dominio estable usado por MVP212, `https://cotironda-seguimiento-vista-piloto-protector-rudo-s-projects.vercel.app/seguimiento`, estaba asociado a un despliegue viejo: se reasignó manualmente y después se verificó `get_alias.deploymentId` igual al despliegue nuevo, `READY`. El dominio propio/main y el portal de producción nunca se tocaron.
- Logs de compilación Vercel: clonación del SHA indicado, build completo y `Deployment completed`; solo advertencias sobre rangos Node/npm. No hubo límite de builds en esta publicación.
- Protección de fuentes: una revisión histórica persiste con `summary=null` y razón genérica; **0** ofertas IA `verified` y **0** versiones de origen al cierre de la verificación. No se reconsultó a la IA ni se envió WhatsApp. Es correcto que la página no muestre ofertas MVP299 de esas fuentes históricas.
- **Límite de verificación:** no se pudo hacer smoke HTTP externo contra el sitio desde esta sesión (acceso web/DNS no disponible). La verificación positiva es de deploy/alias, estructura de RPC, bytes fuente y CI; no equivale a navegador funcionando, nueva oferta visible, cierre de ronda, adjudicación ni contactos probados E2E. Requiere ensayo prospectivo con usuarios ya consentidos.
