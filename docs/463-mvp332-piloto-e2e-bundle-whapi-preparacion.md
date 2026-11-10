# Decisión 463 — MVP332: preparación de prueba integral con Whapi Sandbox

**Fecha:** 09/11/2026 (ART). **Autorización:** “Solo prepara todo para que tengamos el piloto de punta a punta”. Significa desarrollo, verificación y documentación; **NO publicar** SQL/Edge/Vercel, activar gates, enviar WhatsApps ni gastar IA. Seguimiento Issue #733.

## Flujo E2E que debemos acreditar

1. Arquitecto ya enrolado envía un pedido por WhatsApp, texto/PDF/Excel con zona de entrega (La Plata). La IA Central interpreta rubro, cantidad, unidad y variante sin exigir CONFIRMAR COTI. Si falta un dato vital, consulta solo eso.
2. SQL valida fuente, HMAC, rol, empresa, catálogo, zona, presupuesto y destinatarios; crea **una** ronda nueva. No reutilizar rondas históricas ni enviar a personas no vinculadas.
3. Ailín y Nahuel reciben pedidos PDF por Whapi Sandbox con identificadores únicos de aceptación de API. No confundir aceptación con entrega. Sin duplicados ni reenvío de uncertain.
4. Ambos responden por Whapi con cotización textual/PDF/Excel. IA Central interpreta y conserva el original, coteja unidades/cantidades, precios, moneda, IVA, flete y condiciones explícitos. Si falta evidencia, mantener review y no inventar totales.
5. Comprador visualiza artículos y subtotales preliminares solo de ofertas económicamente verificadas, por rubro y con cobertura parcial clara; se mantienen anónimas hasta el cierre, sin ranking injusto por totales de distinta cobertura.
6. Al vencimiento se muestran **todos los comercios invitados**, aunque no hayan cotizado; WhatsApps comerciales solo si el consentimiento de divulgación está comprobado y vigente. Nunca se libera el teléfono personal del arquitecto. Originales descargables bajo controles; adjudicación manual.
7. Validar desde navegador real y conservar evidencia no sensible de cada etapa.

## Hallazgos reales del piloto

Auditoría Supabase solo lectura 09/11 a las 22:55 UTC: proyecto cotironda-piloto (PostgreSQL17), 1 comprador, 2 proveedores, 3 canales antiguos vinculados, 5 rondas y 30 entradas inbox. Último registro: 08/11 21:08 ART. **0 nuevos ingresos en las últimas 3 horas**, aunque el responsable informa que los mensajes llegan al WhatsApp. La afirmación del usuario no sustituye evidencia SQL de webhook. No hay despachos pendientes ni inciertos. Gate nuevo MVP306 auto liberación OFF, MVP314 batch OFF, MVP315 aviso comprador OFF. Gate histórico despacho MVP222 ON. 0 cotizaciones IA verified, 1 review histórica. **0 autorizaciones para compartir contactos comerciales** (MVP109/MVP307), 0 altas/canales nuevos administrativos (MVP309/MVP312). No existe backup real restaurable comprobado.

La Edge activa Whapi v70 tiene **60 archivos**, comparados individualmente contra GitHub de desarrollo: **57 idénticos**. Solo difieren 3 candidatos: index.ts (selector de destinatarios dinámicos), ai-central-dispatch-mvp223.ts (revalidación por lease y cupo), buyer-tracking-confirmation-mvp289.ts (control de aviso comprador posterior a batch). Se agrega dynamic-recipient-mvp313.ts, total **61 módulos** candidatos. No se tocó ni desplegó el webhook activo.

## Preparación entregada

- scripts/piloto/mvp332-whapi-v70-bundle-manifest.json: manifiesto con huellas SHA-256 reales de la Edge activa (60 archivos) y candidatas (61), lista exacta de cambios autorizados; sin secretos ni teléfonos.
- scripts/piloto/mvp332-whapi-bundle-readonly.mjs: auditoría OFFLINE que verifica las 61 huellas, importaciones transitivas, sin fuentes nuevas ni modificación de gates obligatorios, con deployment_authorized=false. Solo informa rutas/hashes y estado, jamás hace red ni mensajes.
- scripts/piloto/mvp332-pilot-readiness-readonly.sql: lectura agregada del estado del piloto, validada contra Supabase real; no datos sensibles.
- tests/unit/mvp332-whapi-rollout-bundle.test.mjs + workflow GitHub: pruebas sintéticas de bundle, fuente alterada, import nuevo, manifiesto adulterado, archivos faltantes y ausencia de efectos.

## Bloqueantes explícitos antes de usar «Publicalo»

- Confirmar desde Whapi: modo Sandbox gratis, canal AUTH, 3 chats dentro de cupo, token antiguo expuesto **rotado**, credencial protegida actualizada, webhook configurado con modo body, messages.post y encabezado x-cotironda-webhook-key que coincida sin revelar el valor.
- Confirmar un **ingreso nuevo en whapi_inbox** del comprador. Sin esto no se acredita integración entrante.
- Resolver **una sola vez** la prueba de divulgación de contacto comercial de Ailín/Nahuel bajo condiciones aceptadas al alta; jamás suponer aprobación ilimitada por figurar en la base, ni pedir permisos por cada ronda.
- Preflight de esquema/roles/catálogos/RPCs, cupos, cifrado, ausencia de trabajos inestables y políticas de privacidad. La última respuesta económica de Nahuel está en revisión y no debe convertirse retroactivamente en verified.
- Revisar producción vs desarrollo, confirmar 60 archivos ACTIVE y repetir los hashes justo antes de desplegar; cualquier drift obliga a reauditar. Mantener MAIN/producción intactos.
- Autorizar explícitamente despliegue **SOLO piloto** y activar una única ronda controlada con hasta 2 proveedores. No enviar nuevas solicitudes sin condición de disponibilidad de Sandbox; no reintentar estados inciertos a ciegas.
- Validar dos respuestas cotizadas en tiempo real, preliminares, cierre, nombres comerciales y originales. Un E2E necesita evidencia real, no solo pruebas ficticias.

**Límites:** el paquete no acredita hoy un canal Whapi AUTH, cuotas, token renovado ni consentimiento de contacto. El módulo de conciliación de operador MVP327–330 es excepción fuera del camino normal y no necesita publicarse para esta prueba. No afirmar 100% funcional antes del resultado de campo. Vercel tiene un límite externo de compilaciones, pendiente de revisar sin contratar planes.
