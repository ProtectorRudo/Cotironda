# Acta 426 — MVP300: puerta de evidencia del recorrido completo del piloto

**Fecha:** 07/11/2026. **Estado: PR #693 INTEGRADO SOLO EN DESARROLLO; auditoría real de SOLO LECTURA, SIN PUBLICAR MVP300.** No publicar código de este MVP sin autorización separada. No WhatsApps, webhooks sintéticos a producción, consumidores de IA, actualizaciones DB, publicación Vercel, contactos ni cron.

## Alcance
La orden «Luz verde» autoriza implementar y probar, **no desplegar** nuevos cambios. El piloto actual sí tiene MVP298/299 publicados (Whapi v68, seguimiento v24, 84 migraciones, web Vercel del seguimiento del comprador READY). La meta es comprobar una **ronda nueva y normal**, no reinterpretar el documento ambiguo de Ailín ni gastar otra lectura sobre la respuesta histórica de Nahuel.

## Diagnóstico vivo: lectura SQL MVP300
El 07/11/2026 22:16:52 UTC ejecuté directamente sobre `cotironda-piloto` el archivo `scripts/piloto/mvp300-e2e-readonly-witness.sql` usando la conexión Supabase ya aprobada. El SQL es un único `WITH ... SELECT`, sin mutaciones ni contenido personal devuelto.

| Indicador de una ronda abierta confirmada | Valor observado |
| --- | --- |
| IA Central, despacho y WhatsApp entrante/saliente habilitados | 4/4 true |
| Ventana de prueba habilitada | true |
| Ronda testigo con revisión de comprador `confirmed`, enlace vigente y sombra IA | 1 |
| Estado de la ronda / dentro del plazo | `prepared` / true |
| Trabajos para proveedores | 2 |
| Despachos `api_accepted` con ID Whapi | **2/2** |
| Proveedores con mensaje posterior a su despacho | **1/2** |
| Presupuestos de proveedor en `review` | 1 |
| Presupuestos IA `verified` | **0** |
| Vista comprador `rubros_por_articulo`: ofertas | **0** |
| Vista `respuestas_pendientes_por_rubro`: respuestas acreditadas | **0** |
| Verificación de navegador HTTP externo y cierre finalista/contactos | **NO ACREDITADO** |

No hubo entradas recientes en `whapi_inbox` durante las ocho horas anteriores a otra consulta del 07/11; el último mensaje almacenado era anterior al despliegue del MVP298/299. Los dos registros `ambiguous_round` de otras evidencias no autorizan asociar presupuestos manualmente.

**Interpretación:** confirmación del comprador y despacho vía gateway han tenido eventos reales. **No** se demostró entrega en el dispositivo, ni recepción de dos respuestas válidas, comparación económica, enlace abierto desde navegador, cierre y contactos reales. La ronda previa no queda “completa” porque una de sus cotizaciones siga bajo revisión privada.

## Herramientas añadidas

- `scripts/piloto/mvp300-e2e-readonly-witness.sql`: testigo no invasivo, analiza exclusivamente los agregados de la última ronda confirmada con token vigente; no devuelve ID, teléfono, token, documentos, precios, identidad ni HMAC. Ejecución manual read-only desde Supabase; **no** invoca WhatsApp ni IA.
- `scripts/piloto/mvp300-gate-report.mjs`: clasifica los indicadores contra una cuota de 2 proveedores, sin inferir éxito por APIs habilitadas. Rechaza esquemas con campos inesperados, cifras imposibles, supuestos de `full_e2e_certified` y alteraciones de ejecución. La evidencia SQL por sí misma **jamás** puede certificar E2E.
- `tests/unit/mvp300-pilot-e2e-readonly-gate.test.mjs`: rutas de ausencia de confirmación, despacho incompleto, segunda respuesta faltante, cotización no conciliada, ofertas ocultas, cierre pendiente, contaminación de datos y prohibición de mutaciones SQL.
- Workflow `cotironda-mvp300-pilot-e2e-gate.yml`: CI aislada, sin secretos, red ni llamadas pagas; además incluye regresiones de MVP284 (circuito sintético de 21 migraciones), MVP227, MVP295 y MVP299.

## Criterio obligatorio de aceptación E2E auténtico

1. Pedido NUEVO desde el **WhatsApp consentido del comprador de prueba** (texto, imagen o PDF), lectura IA Central, ciudad de entrega, vista previa y confirmación. No manipular `whapi_inbox` desde SQL para falsificar un mensaje de WhatsApp.
2. Enviar de manera natural a los **dos proveedores consentidos** para los rubros apropiados; verificar identificadores Whapi, no duplicar envíos. Un 2xx del proveedor de API no es prueba de recepción en teléfono.
3. Capturar respuestas NUEVAS de dos proveedores (sin pedirles códigos de ronda ni formatos especiales), asociar cada una por fuente inalterada a su ronda y revisar original con IA Central y aritmética determinista. Los documentos ambiguos permanecen privados.
4. Comprobar al menos dos propuestas anónimas verificadas **o**, si corresponde a la fuente, coberturas interpretadas sin precio y claramente fuera del ranking. Nunca falsear moneda/IVA/flete ni comparar totales con coberturas desiguales.
5. Abrir el enlace privado realmente en el navegador del comprador, acreditar la vista por rubros, el vencimiento correcto, cierre y selección manual permitida, avisos/contactos consentidos cuando correspondan. No exponer contactos por defecto.
6. Conservar auditoría de mensajes/estado y observar que no haya duplicados, reintentos facturados por la misma fuente, contactos cruzados ni cambios de producción. Registrar duración y costos si se pueden comprobar.
7. **Sólo después** del paso 5 se puede usar «circuito real E2E aprobado»; CI verde/SQL y READY de Vercel no equivalen al punto 7.

## Siguiente movimiento seguro

Como el canal disponible en ChatGPT tiene conectores GitHub/Supabase/Vercel, **no hay sesión Whapi conectada con capacidad de originar un mensaje como el comprador**. No se puede atribuir una conversación entrante auténtica a un teléfono ajeno vía API de salida. Además no sería legítimo volver a enviar respuestas antiguas como si fueran nuevas. La intervención mínima inevitable para una próxima vuelta auténtica es **un mensaje original** del comprador de prueba desde su WhatsApp ya registrado. El sistema debería gestionar confirmación, distribución y respuestas de negocios; no hay que pedirles a proveedores que reenvíen cotizaciones históricas ni agregar códigos de ronda manuales. Si no aparecen respuestas nuevas, registrar ausencia de evidencia y bloquear el certificado, no fingir éxito.

## Evidencia y alcance
PR pendiente de pruebas CI al momento de redactar; `main`, producción, cotironda.com, secretos, base y temporizadores no cambiaron por este MVP. La publicación técnica de MVP298/299 está documentada en [acta 425](425-mvp299-separacion-respuestas-sin-precio-comparable.md).

## Verificación final y pendientes — 07/11/2026

- [PR #693](https://github.com/ProtectorRudo/Cotironda/pull/693) **fusionado** a la rama de desarrollo `feat/mvp174-supplier-packaging-equivalence`, commit `2ff3f7eb3a9330b2546a9e4b78d6fde5d48fb1b8`; **no** `main` ni producción.
- **7 de 7** controles GitHub Actions aprobados, incluido el workflow específico `offline-witness`: **29/29 tests** aprobaron con Node, y las suites generales Next.js, PostgREST, PostgreSQL y seguridad pasaron.
- Diagnóstico SQL agregado ejecutado y verificado en `cotironda-piloto`: comprador confirmado, dos pedidos con ID de Whapi, solo una respuesta de proveedor y cero precios IA verificados o visibles.
- Revisión adicional **MVP209** de solo lectura: cierre periódico configurado (1 cron activo), pero planificación de finalistas v196/v209 **desactivada** (`activation_on=false`, sin secreto exclusivo Vault, sin cron de planificación, sin planes). Este subsistema puede impedir completar el último paso; su continuidad con las ofertas IA Central requiere auditoría específica antes de activar algo. Registro independiente: [Issue #694](https://github.com/ProtectorRudo/Cotironda/issues/694).
- Logs Supabase consultados entre las 21:56 y 22:20 UTC: **81 eventos** de Edge/Functions y cero mensajes con texto `error` o `exception`. Este conteo no demuestra ausencia universal de fallos ni una cotización exitosa.
- La prueba en navegador y el WhatsApp entrante nuevo **no se ejecutaron**: no hay capacidad de originar un mensaje auténtico desde el teléfono comprador mediante los conectores disponibles. No inventar ni consumir mensajes ni modelos para simularlo; no hubo acción nueva sobre Whapi, cron, Supabase o Vercel.
