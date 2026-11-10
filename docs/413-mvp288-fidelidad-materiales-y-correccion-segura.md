# Decisión 413 — MVP288: cantidades legibles y presentación de origen, sin confirmaciones obsoletas

Fecha: 07/11/2026. Issue #677.

## Evidencia real del piloto (consultas solo lectura)

Un comprador autenticado envió por WhatsApp un pedido de **20 bolsas de cemento CPC de 50 kg** y **3 bolsones de arena**, entrega en La Plata. La IA Central preparó una ronda `draft`, sin invitaciones ni despachos, pero el campo `request_lines.original_description` perdió las expresiones `50 kg` y `bolsones`; se guardó solamente `Cemento CPC` y `Arena`. La unidad uniforme `bag` confundió dos presentaciones distintas. El `numeric::text` de PostgreSQL apareció en el mensaje como `20.000` y `3.000`, que son veinte y tres, no miles.

### Raíz técnica

- El contrato IA tiene `evidencia` literal y offsets del texto original. El puente MVP221 conservaba la cita en `ai_shadow_rubros_mvp221.evidencia`, pero enviaba exclusivamente `item.descripcion` generada por el modelo al campo comercial principal de `request_lines`.
- Las respuestas del proveedor, PDF, revisión y análisis económico dependen de `original_description`, no de la evidencia oculta.
- El renderizador MVP279 mostraba `quantity::text` y `unit` sin formato ni contexto comercial.
- La instrucción antigua «escribí la corrección» no tenía una transacción SQL que vinculara la corrección a la revisión aprobable.

## Decisión de implementación

1. `fidelidad-pedido-mvp288.ts`: construir la descripción principal solo a partir de un fragmento **literal verificable** del WhatsApp recibido. Ampliar la cita de IA hasta antes del siguiente artículo cuando la cita se quede corta (por ejemplo, para incluir `de 50 kg`). Nunca cruzar al siguiente producto, no agregar ni inferir capacidad de bolsón. Si no entra entera en el contrato PDF de 75 caracteres, **bloquear y solicitar revisión**, no recortar especificaciones.
2. `puente-sql-rondas-mvp221.ts`: pasar al SQL la descripción original verificada, conservando cantidades, rubros, evidencia y catálogo previamente cotejados.
3. `ai-central-buyer-review-mvp279.ts`: renderizar `20` y `3` sin sufijo decimal falso, con `bolsas` o `bolsones` solamente cuando el texto original declara esa presentación. No normalizar kg a bolsas, m³ a bolsones ni suponer capacidades. El PDF utiliza exactamente la misma rutina pura.
4. Corrección **explícita y atómica**: el comprador podrá enviar `CORREGIR COTI <código anterior>: <pedido completo corregido>`. Es **obligatorio reenviar el listado completo**, no una frase parcial, porque de otra forma IA podría omitir ítems o cantidades. El código de 16 hexadecimales identifica una única revisión previa del mismo comprador. Después de construir un nuevo `draft` íntegro con su fuente HMAC original, la RPC de emisión de revisión bloquea la revisión anterior, registra un enlace privado antiguo→nuevo, y devuelve una única revisión nueva. El código antiguo ya no puede confirmar. Nunca editar ofertas/proveedores ya enviados ni publicar sin aprobación explícita del nuevo snapshot.
5. No se altera la solicitud original ya archivada ni se «reinterpreta» con un nuevo mensaje como si fuera el mismo HMAC. Los dos borradores quedan disponibles solo para auditoría; **uno solo es aprobable**. Una revisión inválida no puede cerrar un pedido ajeno.
6. No hay nuevos gastos de infraestructura, ampliación de cuotas OpenAI, pagos, contactos ni números en fuentes de código.

## Limitaciones y aceptación

- **Una aclaración breve libre sin lista completa** continúa fuera de este mecanismo seguro. Es posible implementar edición conversacional por IA más adelante con evidencia cruzada de ambos WhatsApps y CAS adicional, pero nunca completar una lista a partir de supuestos. Las instrucciones visibles deben pedir nueva lista completa.
- La evidencia textual de IA debe identificar el tramo correcto del artículo; si la cita termina antes de una especificación pero el tramo contiguo es comprobable, se conserva. Un artículo demasiado largo para el PDF se bloquea; no hacer truncamientos invisibles.
- La corrección solo funciona mientras la revisión original esté en `api_accepted`, vigente y sin despacho. Una confirmación antigua después de reemplazarla se rechaza, incluso si alguien vuelve a mandar exactamente el código anterior.
- El original real del piloto permanece **sin modificar** por este PR. Las pruebas de desarrollo son sintéticas, sin enviar Whapi. Solo `Publicalo` habilita instalar en `cotironda-piloto`.

## Evidencia de pruebas

La suite nueva comprueba cantidades 20/3/1.25, `50 kg`, distinción de bolsones, PDF fiel, citas truncadas y cruzadas, y corrección enlazada con comprobación de vieja confirmación denegada. PostgreSQL 17 corre todas las migraciones y fixtures acumulativos dentro de un único `BEGIN/ROLLBACK`. **No declarar resultado hasta ver CI**.
