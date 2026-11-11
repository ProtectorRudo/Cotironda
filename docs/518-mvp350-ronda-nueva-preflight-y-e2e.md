# Acta 518 — MVP350: detener el ciclo de retrabajo y preparar una ronda E2E nueva

**Fecha:** 11/11/2026. **Autorización:** «Luz verde» = solamente desarrollo, pruebas y consultas piloto de **solo lectura**. No fusionar, desplegar en Vercel/Supabase, activar servicios ni enviar WhatsApps.

## Decisión de producto

**No hacen falta más versiones de diagnóstico PDF para intentar demostrar el MVP.** El objetivo comercial es un comprador y dos proveedores reales en una ronda nueva, con recepción de dos presupuestos, fidelidad económica, ranking por artículo comparable y seguimiento del comprador; cierre y revelación solo según las reglas. No confundir una prueba de PostgreSQL o un PDF leído en privado con el circuito final.

Los módulos de ruteo WhatsApp, IA de pedidos, catálogo, comparación B6, seguimiento por rubro y cierre ya existen. Los principales problemas presentes son **asociación y verificación de cotizaciones** y **ausencia de una ronda nueva probada de punta a punta**.

## Evidencia actual real, sin identificadores personales

Dos informes SQL originales de Cotironda ejecutados en el proyecto `cotironda-piloto` el **11/11/2026 aproximadamente 19:26 UTC**, únicamente en lectura:

- **MVP334 (participantes y seguridad):** 1 comprador vinculado, 2 proveedores contactables, WhatsApp entrada/salida ON, IA Central ON, despacho ON, auto-release ON, lote diferido OFF, aviso diferido OFF, 0 envíos/trabajos inciertos. Hay 106 renglones de catálogos (86 con familia, 20 en revisión) y dos proveedores con catálogo sin confirmación de stock. Cero ingresos del comprador en las últimas 24 horas.
- **MVP300 (ronda auditada con testigo de origen):** **ronda cerrada**, 2 despachos a proveedores con identificador Whapi, **1 proveedor respondió después del despacho**, 0 cotizaciones verificadas, 1 presupuesto en revisión, 0 ofertas verificadas visibles para el arquitecto, pruebas externas de navegador/WhatsApp/cierre sin completar. La observación de base **no certifica E2E**.
- Estado general: **0 rondas en `open`**, 1 en `prepared`, 4 presupuestos `awaiting_fidelity_check`, 3 fuentes `ambiguous_round`, 0 ofertas anónimas nuevas, 1 `offer_version` histórica, V2 5 flags OFF, 0 leases.

**Hallazgo de preflight:** el SQL histórico de MVP334 exigía equivocadamente `auto_release=false` y una entrada de WhatsApp del comprador en las 24 horas ANTES de considerar que **puede prepararse una nueva prueba**. Pero la liberación automática ya es la regla autorizada, y un pedido nuevo no puede necesitar un mensaje futuro como precondición. Esto confundía la **preparación** con el **éxito E2E**.

**Hallazgo en el testigo MVP300:** para una ronda ya `closed` con solo una respuesta y cero ofertas verificadas, el evaluador devolvía `awaiting_second_supplier_reply`. Como el plazo terminó, no corresponde esperar o reenviar dentro de esa ronda. El estado correcto es `closed_round_incomplete_new_trial_needed`.

## Correcciones de desarrollo

Sin crear servicios ni cambios SQL desplegados:

1. **MVP334, SQL + evaluador Node:** para **preparación controlada** requiere `auto_release=true`, `batch=false`, `buyer_notice=false`, sin trabajos ni salidas inciertas, y demás participantes/permisos/catálogos válidos. La falta de ingreso reciente ahora es advertencia `sin_ingreso_comprador_reciente_no_prueba_whatsapp_e2e`, nunca evidencia ficticia.
2. **MVP300, evaluador Node:** si la ronda testigo está `closed` y no consiguió dos respuestas, dos cotizaciones verificadas y dos ofertas comprador, devuelve `closed_round_incomplete_new_trial_needed` antes que los estados de espera de ronda abierta. Sigue devolviendo `full_e2e_certified=false` y marcando pruebas externas faltantes.
3. **Prueba de SQL real de la nueva versión contra el piloto, SOLO LECTURA:** el snapshot ahora indica `preflight_sql_apto=true`, 1 comprador, 2 proveedores, 0 trabajos/mensajes inciertos, `auto_release=true`, `evidencia_recepcion_24h=0`, `publicacion_autorizada=false`, `verificacion_externa_pendiente=true`. **No es permiso para enviar mensajes**; Whapi remoto y presupuesto IA siguen siendo pruebas aparte.
4. Tests Node para configuración errónea de auto-release, lotes, ausencia de entrada reciente, solo lectura, ronda cerrada incompleta y ronda cerrada con ofertas completas pero sin prueba externa; regresión de circuitos ya existentes y CI general.

## Orden concreto: un circuito, no otro proyecto

1. **Preparación** (sin envíos): rama/PR de desarrollo aprobado, configuración pilot de 1 comprador + 2 proveedores confirmada, no pendientes/duplicados, archivo original y reglas comerciales protegidos, catálogos comparables, Vercel/URL de seguimiento verificadas, costos/cupo Whapi y OpenAI verificados. No usar una ronda ya cerrada.
2. **Una ronda nueva real** (tras autorización de publicación en piloto): el comprador envía lista o PDF y localidad; Cotironda crea **una** ronda y remite **un** pedido a cada proveedor. Sin confirmación adicional del cliente.
3. **Dos respuestas reales**: cada proveedor envía en su formato habitual. Conservar byte original por SHA y asociar por evidencia de invitación, proveedor, producto/unidad y ronda; nunca asociar a una ronda distinta solo por fechas. Falta de coincidencia → revisión operativa privada, **no exigir reenvío** ni adjudicar precios inventados.
4. **Economía**: comparar artículos compatibles, coberturas, IVA, flete y condiciones explícitas; registrar subtotales corroborados y monto final solo si está comprobado. No comparar dos canastas incompletas solo por total.
5. **Arquitecto y cierre**: comprobar navegador con link privado, preview anónimo por rubro con líneas cotizadas y montos legítimos, cierre, revelación de proveedores y contactos solo según reglas, originales descargables.
6. **Criterio de terminado**: evidencia real, en UNA ronda y un navegador, de **2 respuestas, 2 fuentes asociadas, 2 ofertas económicas verificadas, vista comprador fiel, cierre y revelación correctos**, con permisos y mensajes idempotentes. Hasta entonces **NO** declarar piloto funcional E2E.

## Restricciones

No activar gate del piloto bajo «Luz verde». PR apilado sobre #789; no fusionar, reabrir historic B5k/B5m/B5n/B5o ni forzar `archived_materials_disagree`. Al pedir «Publicalo» revisar base actual, merge/deployment plan, idempotencia, Whapi y Supabase, y distinguir **publicación de código** de **disparar una nueva ronda con personas reales**.

**Precisión sobre tiempos:** no inferir “faltan X días” de CI unitarios. Los bloqueos operativos reales se concentran en una sola ronda nueva y 2 respuestas; no es una lista infinita de versiones PDF.
