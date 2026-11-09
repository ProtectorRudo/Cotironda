# Decisión 458 — MVP327: cotejo comercial determinista con original inmutable (desarrollo)

**Fecha:** 09/11/2026 (ART). **Autorización:** «Luz verde». **No publicar ni modificar datos de la ronda**, no llamar OpenAI, no usar Whapi, no habilitar envíos o cron. Fuente de verdad: GitHub.

## Evidencia verificada en Supabase (solo lectura)

Para el caso histórico que en el navegador aparecía «Respuesta procesada · revisión comercial necesaria», el registro `ai_supplier_review_mvp227` conserva **un** estado `review`, `reason_code='semantic_review_required'` y sin resumen económico acreditado. La asociación con la ronda, el origen y despacho anterior fueron revisados en MVP326. La tabla `supplier_economic_facts_mvp168` **no tiene ficha para esa fuente**. `whapi_inbox` conserva el **texto original cifrado**, identificado como `kind='text'`; no se extrajo ni se expuso el original a GitHub ni al navegador.

Por lo tanto, existe evidencia **cifrada** que un servicio interno autorizado podría obtener y cotejar, pero **no se pueden reconstruir los importes o el motivo exacto de la revisión a partir de las tablas actuales**. No afirmar que la cotización de Nahuel está aprobada ni que el cotejador se ejecutó con su texto: las pruebas usan únicamente originales ficticios.

## Qué se agregó

`src/domain/ia-central/conciliacion-original-textual-mvp327.ts` es un **módulo puro y de uso interno**. Reutiliza los controles económicos existentes `evaluarCotizacionMvp225`, `precioConfirmado`, `importesOriginalesRepresentadosMvp244`, `monedaFuenteMvp241` y `condicionFuenteMvp242`. Recibe:

- Una **instantánea privada** provista por un servicio autorizado: ID de ronda, referencia HMAC del mensaje, referencia de mensaje más reciente, SHA-256 original del texto UTF-8 exacto, `review` finalizado y texto original sin modificaciones.
- El pedido verificado de esa misma ronda y una propuesta de interpretación **documentada** artículo por artículo. La propuesta no puede inventar cantidades, unidades, descripciones, importes o condiciones: las guardas del MVP225 la confrontan contra texto literal.

Verifica que el original no haya sido modificado mediante SHA-256, que la respuesta siga siendo la última versión y que el texto de la propuesta coincida **byte por byte** con el original. Exige evidencias de precio unitario, cantidad, total por renglón cuando exista, moneda explícita y condiciones de IVA/flete/pago sin presumir datos. La suma económica usa `BigInt` y compara cualquier `Total general` expresamente declarado. Un total contradictorio, varios resúmenes simultáneos, cargos adicionales, materiales no asignados, equivalencias no acreditadas o texto incompleto mantienen el estado `requiere_evidencia`. Una cotización **parcial** puede ser candidata únicamente por sus artículos comprobados y **nunca equivale al total final del pedido**.

### Garantías no negociables

- El resultado máximo es `candidato_para_auditoria_independiente`, **no `verified`**. Siempre devuelve `necesitaAprobacionHumana=true`, `permitirPublicacion=false`, `actualizarRevisionAnterior=false`, `automatico=false`, `llamadasModelo=0`, `whatsappEnviados=0`.
- El módulo no escribe ninguna tabla, no invoca APIs ni expone la fuente o referencias HMAC en su respuesta. Los importes internos cotejados **no son visibles para el arquitecto** ni habilitan ranking.
- La instantánea debe provenir de SQL interno con permisos vigentes, fuente/empresa/ronda autorizadas y último mensaje asociado por integridad. El módulo solo verifica coherencia de lo recibido: **no sustituye permisos, autenticación, autorización de empresa ni auditoría de fuente SQL**.
- El cotejo con TXT es la primera pieza. **PDF, Excel, Word e imagen** requieren cadena de custodia de bytes originales y extracción certificada; no se aprueban representaciones textuales de documentos sin evidencia binaria.
- Ninguna revisión histórica puede sobrescribirse ni convertirse automáticamente a verificada. Una futura conciliación firmada por rol autorizado debe crear una **versión nueva, inmutable, idempotente y revisable**, con límites de permisos, evidencia y pruebas de carga/rollback. No está implementada aquí.

## Pruebas y aceptación

Pruebas `tests/unit/mvp327-conciliacion-original-sin-ia.test.mjs` con original ficticio: fuente y SHA correctos, fuente alterada, cambio de moneda, cantidades/unidades/precios, total incorrecto, subtotales múltiples, cargos de flete, pedido parcial, IVA sin evidencia, fuente superada por nueva versión y ausencia de precio unitario. CI offline `.github/workflows/cotironda-mvp327-conciliacion-fuente-offline.yml`, Node22.16 sin tokens ni consumo.

**Criterio de esta etapa:** cotejo determinista sin alterar nada y sin falsa aprobación. Quedan pendientes un servicio interno autorizado que pueda descifrar el original con permisos privados, el contrato de evidencia para documentos, un registro inmutable de decisión humana y el pase a oferta verificada mediante mecanismo seguro. No ejecutar el cotejador con datos reales hasta auditar esas capas.

## Alcance autorizado

**No SQL en piloto, no Edge, no despliegue Vercel, no nuevas rondas, no mensajes.** El piloto sigue mostrando «Respuesta procesada · revisión comercial necesaria». El Issue [#726](https://github.com/ProtectorRudo/Cotironda/issues/726) permanece abierto hasta resolver una cotización con fuente legítima y comprobación E2E.
