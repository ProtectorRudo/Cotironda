# Decisión 428 — MVP302: puente privado de presupuestos IA Central hacia la planificación manual

**Fecha:** 07/11/2026. **Estado:** PR #696 integrado SOLO EN DESARROLLO, **SIN PUBLICAR**, con finalistas OFF. No instalar en `cotironda-piloto` sin `Publicalo`.

## Causa
El planificador anterior MVP196/MVP209 solo lee los documentos v9 `supplier_media_quotes_mvp098`, mientras que IA Central guarda los nuevos presupuestos interpretados en `ai_supplier_review_mvp227`. Con Whapi fuera del período gratuito, no corresponde pagar para probar todavía este vínculo.

## Qué resuelve MVP302
`supabase/piloto/mvp302_ia_finalist_sources_service_only.sql` agrega una RPC **PRIVADA, service_role-only, de SOLO LECTURA** (`public.cotironda_piloto_ia_finalist_sources_mvp302(uuid)`) que enumera **candidatos de fuente verificable, NO ganadores** para una ronda cerrada. Conserva un solo presupuesto vigente por proveedor y exige:
- Ronda cerrada por tiempo y estado, origen sombra IA, revisión de comprador confirmada y comprador con consentimiento vigente.
- Proveedor consentido, vínculo de WhatsApp al pedido, despacho `api_accepted` con ID Whapi real y anterior al ingreso del archivo/texto.
- Revisión `verified` con `source_and_math_checked`, SHA idéntico entre vínculo, revisión y fuente real; documentos con archivo archivado y chequeo de fuente, textos con SHA de bandeja.
- Si existe versionado MVP261, solamente la última versión `verified` exacta; una respuesta pendiente o nueva no puede promocionar un origen viejo.
- Precios por artículo `item_N` con importe de centavos validado, cantidad, unidad y pertenencia al conjunto realmente asignado por catálogo/rubro al proveedor. Cantidades alternativas que no se pudieron conciliar nunca aparecen como cobertura comparable.
- Respuesta solo para servicio: identificadores de fuente y cobertura; sin precios, texto original, nombres comerciales, teléfonos ni contactos. Prohibido enviarla al navegador; la vista compradora mantiene su proyección anónima independiente.

La salida privada de la RPC se procesa **exclusivamente dentro del servicio** con `src/domain/ia-central/propuestas-fuentes-privadas-mvp302.ts`: valida forma, roles de fuente, SHA/HMAC, IDs de artículos, condiciones, etiquetas anónimas y devuelve alternativas completas de uno o dos proveedores sin identidad interna, costos o selección. Rechaza datos inyectados, proveedor/huella duplicados y fuentes sin cobertura total. `tests/unit/mvp302-opciones-privadas-fuentes.test.mjs` incorpora estas regresiones. La etiqueta anónima no es autorización para emitir contactos y debe reconciliarse con la última fuente privada en cada operación futura.

Esta función **NO** escribe planes ni agrega filas a `finalist_coverage_plans_mvp108`, no activa finalistas, no contacta a negocios y no publica presupuesto. La decisión manual futura y el guardado seguro de una selección aún requieren etapa separada.

## Pruebas
- `scripts/piloto/mvp302-bridge-builder.mjs` agrega migración y prueba al circuito sintético MVP284, dentro de la MISMA transacción PostgreSQL17 con `ROLLBACK`.
- `supabase/tests/ci/mvp302-puente-ia-finalistas-pg17.sql`: 2 respuestas verificadas simuladas con rubros distintos, bloqueo antes del cierre, ACL, una fuente adulterada rechazada, opt-out y **cero** mensajes/planes/contactos creados.
- `tests/unit/mvp302-puente-privado-finalistas.test.mjs` y CI `cotironda-mvp302-private-finalist-bridge.yml`: validación de contrato de fuente, autorización y ausencia de red.
- La simulación modifica los timestamps **exclusivamente en la base efímera de GitHub Actions**, que se revierte completa. No inyectar jamás esos valores en el piloto.

## Límite fundamental
El lector de fuentes aún necesita un **selector de cobertura seguro y una confirmación manual firmada/validada por empresa** antes de persistir una adjudicación o revelar contactos. La propuesta offline MVP301 puede ordenar opciones, pero no equivale a un circuito real de pago y mensajes.

**No** declarar que el E2E está aprobado. Recién se certificará tras probar eventos genuinos de WhatsApp, análisis de originales, visualización real, cierre y revelado autorizado cuando se contrate nuevamente un canal de mensajería.

## Auditoría de entrega — 07/11/2026

- [PR #696](https://github.com/ProtectorRudo/Cotironda/pull/696) fusionado por squash a la rama de desarrollo `feat/mvp174-supplier-packaging-equivalence`. Commit `9f91684cbf39184f01216bc510ac8ebe8a5ba0b9`; no `main` ni publicación en el piloto.
- CI del PR **11/11 controles aprobados**, incluidos Next.js, TypeScript, unidades generales, PostgreSQL/RLS, PostgREST HTTP y laboratorio PG17 de puente.
- Pruebas específicas **23/23 aprobadas**; PostgreSQL17 `MVP302 PG17 PASS`: 2 fuentes simuladas aceptadas; una fuente adulterada por SHA se excluye, consentimiento del comprador revocado bloquea y las tablas de mensajes no se alteran. El ensayo se revierte en la misma transacción.
- Deuda pendiente: **MVP303** persistencia y validación manual de elección por empresa con source-binding y política de revelado; pruebas comerciales reales cuando Whapi vuelva a estar activo. No confundir plan provisional con ganador.
