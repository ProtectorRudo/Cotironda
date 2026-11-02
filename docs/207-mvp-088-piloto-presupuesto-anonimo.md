# MVP-088 — Vista propia fiel, anónima y conservadora para el piloto

02/11/2026 · Issue #388 · solo rama de desarrollo. **Todavía NO habilita el recorrido completo**.

## Requisito comercial
El arquitecto envía por WhatsApp; Cotironda distribuye por categoría de material y zona; los comercios cotizan por WhatsApp; Cotironda conserva cada versión original y presenta, en formato propio, todos los renglones comerciales, cantidades e importes, incluidos pallets, bolsones, descuentos, IVA, flete y el TOTAL declarado. Durante los cuatro días iniciales del piloto los proveedores son anónimos; vencido el plazo, el comprador puede conocer hasta dos finalistas por rubro comparable, con contacto recíproco autorizado, sin adjudicación contractual automática.

## Estado live comprobado
Proyecto Supabase dedicado `cotironda-piloto`, sin tocar `cotironda-dev`. Arquitecto/Ailín/Nahuel están enrolados con opt-in; Ailín y Nahuel tienen 51 líneas de catálogo cada uno; **las 51 filas coinciden exactamente en descripción y familia entre ambos**, pero `catalogue_confirmed_at` es NULL para los dos. No tratarlas como catálogos reales confirmados ni habilitar envíos sobre esas listas sin comprobación puntual del rubro/productos con cada negocio. Una ronda `prepared` de La Plata, cierre previsto 06/11/2026 (UTC 04:34, 01:34 AR), dos invitaciones; una oferta registrada de Ailín como texto original. Invitación a Nahuel `pending`; outbound inactivo en DB. Edge `cotironda-piloto-whapi` v15 recibe texto con secretos/webhook, limita a 8 ítems y nueve familias reconocidas; registra fotos/documentos pero no extrae materiales ni precios de esos medios. Cron PG `cotironda_piloto_close_due_5min` corre `*/5` y sus últimas 24 ejecuciones consultadas fueron exitosas; **solo cambia estado a cerrada y no calcula ni revela finalistas**.

## Incremento programado MVP-088
`src/domain/plantilla-anonima-piloto-mvp088.ts` crea una **proyección de presentación**, no modifica el original privado de `MVP-063`. Exige una clasificación confiable y completa de **cada** línea de la fuente (números de línea, hash SHA256, misma literalidad, ninguna omisión de líneas comerciales); permite retener encabezados puramente identificatorios sin importes, rechaza cualquier intento de ocultar precios bajo identidad y bloquea líneas públicas con signos plausibles de contactos, CUIT, teléfonos, correo y URL. Si el total declarado es único conserva su importe literal sin recalcular; si no existe o es ambiguo no inventa uno. No calcula un ranking ni devuelve identidad de proveedor, teléfono o un evento de envío. Se debe verificar la clasificación en un servidor seguro, no usar directamente etiquetas suministradas por el proveedor/buyer.

**Limitación importante:** clasificación humana/automática de identidad y posible información identificatoria (nombres de comercios integrados en descripciones) todavía NO está aprobada para fuentes reales. La función nunca puede ser invocada desde una API pública que acepte la bandera `revisadoPorServidorConfiable` del cliente. Esta capa no basta para certificar anonimato de texto arbitrario ni fidelidad de documentos binarios.

## Criterios de aceptación y auditoría
- Conserva renglones con cantidad/unidad/precio unitario/precio de línea, extras, descuentos, condiciones, total literal y hash exacto de fuente.
- Bloquea exposición de identificadores y omisión de renglones monetarios, etiquetas duplicadas, source hash adulterado, clasificación parcial y browser-supplied metadata.
- Sin declaración de IVA supuesto, ganadores o contacto antes de cierre, sin webhook/sends, sin nuevas tablas o migraciones.
- `tests/unit/mvp088-plantilla-anonima-fiel.test.mjs` prueba casos normales, extremos, monto declarado erróneo, ausencia de total, rechazo de contacto y congelamiento de salida.
- La integración con el piloto live requiere un broker privado que verifique HMAC/AES de mensajes, RLS, pertenencia comprador, clasificación y fuentes por versión de oferta, una vista autorizada y luego prueba real comprador-proveedor. No mostrar PDF original de corralón al comprador.
- Para el resto del piloto siguen pendientes: salida Whapi por allowlist y presupuesto controlado, interpretación documental, selección por catálogo/rubro/zona más allá del subconjunto admitido, cálculo decimal de cobertura/IVA/flete y ledger idempotente de hasta dos finalistas con consentimiento al momento del envío. Cierre cron no equivale a disclosure de ganadores.

## Puertas de seguridad para ensayar Whapi real
1. Verificar secretos Edge y `COTIRONDA_PILOT_RECIPIENTS_JSON` sin exponer teléfonos ni claves; comprobar correspondencia HMAC con los proveedores enrolados y opt-in actual. El envío no debe romper recepción.
2. Autorizar **únicamente dos números** consentidos, una ronda preparada, fecha vigente, catálogos y zona; reconfirmar costo/rate limit y que la lista no contenga terceros.
3. Probar **un solo** envío intencional con estado `api_accepted`, `uncertain` sin reintentos automáticos, preservación de original y no duplicados. Activación global de outbound después de pasar el gate, no antes.
4. Cerrar en fecha real, calcular solo presupuestos completos/comparables, auditar consentimiento/contactos de los finalistas y envío recíproco idempotente. Sin adjudicación y sin mensaje engañoso de «ganaste una venta».

Referencias: AGENTS.md; docs/06, /159, /174, /183 y código Edge live v15 consultado 02/11/2026.
