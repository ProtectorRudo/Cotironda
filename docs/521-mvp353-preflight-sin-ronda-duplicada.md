# Acta 521 — MVP353: impedir otra ronda piloto mientras hay una preparada viva

**Fecha:** 11/11/2026. **Autorización:** «Luz verde» = desarrollo, consultas de solo lectura, pruebas y documentación; **sin deploy, merge, cron, creación de ronda ni WhatsApp**.

## Hallazgo real
El preflight MVP350 afirmaba «apto para preparar prueba» porque verificaba participantes, catálogos, gates, autorización y cero envíos inciertos, pero **no examinaba rondas que ya estaban en curso**. Ese resultado podía impulsar una ronda nueva mientras los proveedores aún estaban contestando otra. Es precisamente el caso problemático para relacionar respuestas con su ronda, sin recurrir a la fecha como criterio único.

Consulté `cotironda-piloto` solo lectura el 11/11/2026 (~22:40 UTC). Hay **1 ronda `prepared` vigente hasta 14/11**, ya con **2 invitaciones y 2 despachos aceptados**, 1 proveedor con respuesta ligada, **0 ofertas anónimas**. Además hay 1 borrador con plazo futuro. Ambos pertenecen al único comprador del piloto. La ronda ya preparada **no se reabre ni se vuelve a disparar** y el documento sin correlación segura sigue privado.

## Cambio de código (solo preflight, no backend)
- El SQL `scripts/piloto/mvp334-dos-proveedores-preflight-readonly.sql` agrega un agregado `rondas_activas`: preparados vigentes, borradores vigentes y preparados con al menos un despacho API aceptado. No devuelve IDs, participantes, teléfonos, tokens, SHA ni materiales.
- `preflight_sql_apto` exige ahora `preparadas=0`. Un borrador vigente genera **advertencia**, no un bloqueo automático: puede ser un trabajo aún sin invitaciones. Un preparado vigente **sí bloquea proponer una ronda adicional**.
- El evaluador Node valida la forma, tipos y coherencia (`preparadas_despachadas<=preparadas`), verifica que el SQL mantenga el control y devuelve `ronda_preparada_vigente_no_crear_otra` incluso ante un resultado SQL antiguo que erróneamente diga «apto».
- Nada de esto reemplaza un candado transaccional de creación de ronda en backend. Es un preflight operativo de **solo lectura**, no una garantía contra carreras concurrentes del webhook.

## Resultado de consulta en piloto
`rondas_activas={preparadas:1,borradores:1,preparadas_despachadas:1}`, `preflight_sql_apto=false`, cero mensajes y trabajos inciertos. El resto de la infraestructura no está bloqueada; el conflicto está en los datos de la prueba y su ciclo de vida.

## Criterios y verificación
1. En base con `prepared` vigente, el preflight siempre dice **no apto para otra ronda**, aunque Whapi y la IA estén habilitados.
2. Cero `prepared` y solo `draft`: advertencia, sin habilitación de ejecución ni prueba E2E.
3. Datos faltantes, negativos, tipo incorrecto o despachos mayores que preparadas: falla cerrado.
4. Alteración de la cláusula SQL `ra.preparadas=0`: auditoría de origen rechaza el SQL.
5. Ejecutar tests Node, regresión general y controles PostgreSQL/Next.js/GitHub. SQL de nueva versión **ejecutado solo lectura** en Supabase y confirma el bloqueo.

## Próximo paso comercial
**No crear ronda duplicada.** Antes de la caducidad, comprobar por qué la respuesta de proveedor no llegó a oferta verificada, observar segunda respuesta válida si existe y preservar el original. Correlación con prueba de invitación y materiales/condiciones, jamás por cercanía temporal. Si la ronda expira incompleta, documentar cierre y planear **una sola** prueba nueva con no solapamiento, bajo autorización explícita de publicación y mensajes a las personas del piloto. Comparación económica, vista por rubro y revelación de contactos siguen pendientes de una prueba externa.

**Importante:** MVP353 NO instala ninguna migración, NO corrige los descuentos ni el PDF histórico, NO crea ofertas y NO declara que el piloto ya funciona.
