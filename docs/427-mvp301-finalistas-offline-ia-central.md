# Decisión 427 — MVP301, propuestas de finalistas sin Whapi

**Fecha:** 07/11/2026. **Estado:** desarrollado en rama de GitHub, **NO PUBLICADO**. No gastos, WhatsApps, cambios de producción, activación de finalistas ni cron.

## Motivo
El período de prueba Whapi venció: no es posible obtener una prueba auténtica nueva sin reactivar el proveedor de mensajería. Se continúa con pruebas sintéticas, usando los módulos reales de Cotironda y sin falsificar entradas de una persona.

**Hallazgo de arquitectura:** el planificador anterior `MVP196` usa exclusivamente fuentes documentales antiguas `supplier_media_quotes_mvp098` con prueba v9 de `supplier_evidence_mvp138`; la nueva IA Central almacena presupuesto anónimo y revisión en `ai_supplier_review_mvp227`. **No existe un puente verificado de persistencia de finalistas** entre ambas rutas. La planificación MVP209 está apagada, sin credencial exclusiva ni cron. No activar el planificador antiguo sobre resúmenes nuevos: no podría comprobar origen ni autorización.

## Trabajo realizado
- `src/domain/ia-central/planificador-finalistas-offline-mvp301.ts`: propuestas deterministas de un proveedor completo o **dos proveedores genuinamente complementarios**, usando **solo** artículos con precio auditado contra texto de fuente por `compararPorRubroMvp225` y `gruposCoberturaMvp254`.
- La propuesta no usa sumas económicas de canastas parciales; no permite ranking general, adjudicación, elección por precio ni contacto. Si una fuente exige revisión por importe/moneda/presentación, permanece fuera de la propuesta. Dos ofertas completas generan dos alternativas, **no dos ganadores automáticos**. Una oferta completa + una parcial no genera pareja redundante.
- `tests/unit/mvp301-plan-finalistas-offline.test.mjs`: escenarios sintéticos, competidores incompletos y fuentes mal conciliadas, no fuga de importes/contactos y prueba de que v196 no usa el registro v227.
- CI `cotironda-mvp301-offline-finalistas.yml`: ejecuta regresiones MVP284 Edge (pedido, revisión, dos PDFs, dos respuestas), MVP196, MVP225, MVP299, MVP300 y el nuevo plan. **CI sintética no es una conversación real**.
- `scripts/piloto/mvp301-auditoria-puente-finalistas-solo-lectura.sql`: audita estado y comprueba con `pg_get_functiondef` si las dos funciones v196 leen la fuente v227; sin datos personales ni cambios.

## Consulta del piloto real a las 23:11 UTC del 07/11
- Registro IA Central nuevo: **0 verified**, **1 review** histórico.
- Circuito documental anterior: **4 documentos**, que no prueban presupuestos v227 vigentes.
- Funciones v196 instaladas: sí; dependencia explícita al ledger v227: **NO**.
- Finalistas: 0 planes; activación OFF; cron de planificación 0; cron de cierre 1.
- No se consultaron valores Vault ni contactos; no hubo llamadas a Whapi/OpenAI ni envío a proveedores.

## Criterios de aceptación
1. Estado de cierre exigido incluso en simulación; no confundir un booleano de fixture con prueba de base.
2. Rechazo de moneda sin respaldo, total distinto del proveedor, material no comparable, artículos faltantes, etiqueta no anónima, y duplicación.
3. Alternativas visibles para futura decisión **manual**, sin hacer ninguna adjudicación automática.
4. Protección de privacidad: no exponer la fuente, SHA/HMAC, identidad, teléfono ni importe en las propuestas.
5. Pruebas automáticas offline completadas antes de integrar; no publicar con solo `Luz verde`.

## Pendiente crítico — siguiente bloque (MVP302)
Este MVP **no** habilita finalistas de IA Central en el piloto ni resuelve la seguridad de su persistencia. Hace falta una RPC de servicio limitada y transaccional que tome **solo la última versión** `ai_supplier_review_mvp227` económicamente `verified`, ratifique mensaje cifrado/sha, vínculo a ronda, despacho Whapi válido anterior, catálogo, consentimiento y solicitud cerrada; revalide unidades, IVA, flete y cobertura; prepare opciones sin revelado; y requiera una acción manual autorizada para contactar. Requiere regresiones PG17 con rollback y auditoría RLS antes de cualquier `Publicalo`. Nunca reusar como si fueran nuevos los presupuestos ambiguos o históricos.

**Distinción:** MVP301 sirve para probar la lógica **sin pagar Whapi**. El circuito real end-to-end continúa pendiente de canal activo, nuevas respuestas verificadas, seguimiento navegador y cierre autorizado.
