# Decisión 425 — MVP299: respuestas interpretadas separadas de ofertas económicamente verificadas

**Fecha:** 07/11/2026. **Estado: EN DESARROLLO, NO publicado.** Referencias: [issue #691](https://github.com/ProtectorRudo/Cotironda/issues/691), [decisión 424](424-mvp298-acuerdo-economico-doble-lectura.md). Solo GitHub, tests offline y PostgreSQL 17 sintético; **ninguna modificación en cotironda-piloto, Whapi, Vercel, cron ni producción**.

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

## Lo que aún impide declarar E2E normal completo

La visualización preliminar de cobertura no equivale a dos cotizaciones económicamente verificadas. Persisten pruebas prospectivas comprador WhatsApp → confirma → PDF por rubro → proveedores → dos respuestas nuevas (texto/PDF/Excel) → lectura IA → comparación de fuentes → pantalla con token → vencimiento y cierre correcto → finalistas consentidos y contactos autorizados. No obligar a proveedores ni al comprador a etiquetar manualmente rondas. Los originales de Ailín y Nahuel permanecen protegidos.
