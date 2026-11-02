# MVP-078a — Ledger textual privado, anclado al presupuesto fuente (02/11/2026)

**Issue:** #369. **Rama:** feat/mvp-078-source-ledger-offline. **Estado:** módulo y tests offline; **no integrado a Supabase, portal, IA ni Whapi**. Continuación gradual del MVP-075/076/077.

## Problema y decisión
Una cotización WhatsApp puede traer materiales solicitados, otros materiales, pallets/bolsones, flete, descuentos, impuestos, observaciones y un total original. Identificar dos finalistas por comparación de totales distintos sería engañoso. El original ya se conserva íntegro en la tabla privada offer_versions (MVP-072/073), y MVP-075 puede comprobar aritmética de ciertos renglones textuales. Faltaba un vínculo explícito, auditable, a cada número de renglón **sin reescribir la cotización**.

## Implementado ahora
Archivo src/domain/ledger-fuente-cotizacion-mvp078.ts:
- Recibe desde un futuro lector privado una versión original, su SHA-256 esperado, número de revisión y anotaciones explícitas por número de línea. Recalcula SHA sobre el mismo texto UTF-8; rechaza desvíos y metadatos no previstos.
- Reutiliza auditoría MVP-075; conserva **todas** las líneas, orden, texto exacto, importes literales, estado de IVA/flete, total literal y total numérico solo cuando está permitido. Nunca elimina extras ni reparte implícitamente montos.
- Permite marcar: material solicitado con id canónico, extra no solicitado, cargo, descuento o aclaración sin importe. Sólo categorías de fuente compatibles; no convertir el flete, IVA, descuentos o pallets en un material del pedido. El número de artículo de una anotación **no certifica** que el producto ni su cantidad/unidad sean equivalentes.
- Registra por línea el importe atribuible verificado si MVP-075 puede demostrarlo y deja null si es ambiguo o aritméticamente incorrecto. Una línea anotada como solicitada puede no tener precio legible, sin desaparecer.
- El resultado contiene **original y textos potencialmente identificatorios**: uso exclusivo de backend autorizado, JAMÁS enviar completo al comprador, publicar en logs, exponer como RPC pública o formar payload de WhatsApp con él.
- Comparación habilitada=false, equivalencias verificadas=false, revelación de contactos=false, envíos WhatsApp=0. No extrapola precios unitarios, alícuotas IVA, transporte, mínimos, condiciones de pago, entrega ni stock.

## Riesgos y criterios de aceptación
- SHA y versión enlazados al original; múltiples renglones con importes o totales duplicados quedan fieles y nunca se convalidan por intuición.
- Original de Ailín del ensayo con $180.000, $35.000 y $215.000: no normalizar miles implícitamente; extraer null como importe verificable. **No alterar esa fuente en la base real**.
- El presupuesto original completo debe ser visible solamente por el receptor autorizado cuando exista una vista segura; la vista anónima de MVP-076 debe usar lista blanca de valores estructurados y comprobados distinta de este desglose.
- Las anotaciones no autorizan ranking; aún faltan homologación de unidad, cantidad y equivalencias (cemento de 50 kg/25 kg), IVA explícito, flete, forma de pago, cobertura, snapshot de cierre y consentimiento mutuo.
- No fabricar segundo proveedor: mientras Nahuel no cotice, el piloto real sigue con una sola oferta original.

## Pruebas y despliegue
tests/unit/mvp078-ledger-fuente-cotizacion.test.mjs prueba fuente íntegra y SHA, suma independiente de ejemplo inequívoco, pallets, cargos, descuentos, ambiguos, totales no verificables, renglones duplicados/imposibles, ingreso con identidad extra inesperada, notas monetarias, revisiones y aritmética falsa. Correr dentro de npm run test:unit y TypeScript. Verificar CI del PR antes de declarar aprobado.

**Esta fase no escribe la base de datos, no crea tablas, no habilita envíos ni aplica migraciones.** En la fase siguiente: lector privado autenticado a offer_versions por identidad/empresa/revisión, evidencia de importes vinculada a número de línea y fuente inmutable con permisos mínimos; después comparar rubros y preparar notificaciones consentidas. No fusionar con producción por este PR.
