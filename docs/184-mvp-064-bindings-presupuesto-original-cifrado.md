# 184 — MVP-064: vínculo transaccional a fuente original íntegra y cifrada (D093)

**01/11/2026, Issue #341, derivado del requisito crítico #339. Código SQL de laboratorio/CI, no migración DEV.**

## Problema demostrado

D061/D063/D060 registran precios de los materiales reconocidos y preservan versiones de la oferta, pero **no guardaban en el recibo de la oferta el vínculo verificable de la fuente íntegra**, con todos los renglones adicionales y el total del negocio. D028 SÍ almacena el mensaje completo cifrado con AES-GCM y prohíbe UPDATE/DELETE; el lector económico NO lo puede reemplazar. La vista comprador MVP014 muestra solo productos del pedido.

## Qué agrega D093

`supabase/sql/whapi_original_bindings_d093.sql`:

- Crea `cotironda_private.whapi_original_bindings_d093` con llave `channel_id+message_key`, referencia al recibo D059 y a la versión **exacta** `round_id+supplier_org_id+offer_version`. Una corrección del proveedor tendrá otro mensaje/version, sin reemplazar el anterior.
- Conserva **sin duplicar texto sensible** un SHA-256 del mensaje completo UTF-8, SHA-256 del paquete cifrado D028 (ciphertext + nonce + tag), tamaño en bytes y cantidad de renglones. El texto original (incluidos pallets vacíos, bolsones vacíos, fletes, descuentos, errores y total) permanece **íntegro y cifrado en D028**. El broker confiable es responsable de calcular el digest del texto solo después de verificar AES-GCM; SQL no dispone de la clave para descifrar.
- Total declarado: estado `explicitamente_verificado`, `no_detectado` o `ambiguo_no_verificado`; referencia por número de línea + SHA-256 del **importe literal** cuando existe uno solo inequívoco. No se guarda otro total calculado ni se presume IVA. El documento fuente literal es la autoridad.
- La RPC restringida `whapi_receive_with_original_d093(channel,message,expectedRevision,quote,prices,manifest)` ejecuta D060 y agrega el vínculo **en el mismo statement/COMMIT de PostgreSQL**. Si falta manifest o no coincide fuente/identidad/versión, revierte el recibo y sus precios. Si llega un reintento idéntico, mantiene la misma versión. Si cambia fuente/total, falla.
- Tabla inmutable por trigger, RLS activo; revocados grants de `anon`, `authenticated`, `service_role` y roles de aplicación. `cotironda_original_writer_d093` sin LOGIN es dueño de función; `cotironda_original_gateway_d093` solo puede ejecutar la RPC, no leer la tabla directamente.
- No hay salida HTTP pública ni acceso a D028 desde browser. Hash de la fuente no prueba que la IA clasificó bien el total o que el texto representa correctamente un archivo PDF: son garantías distintas.

## Qué cubre el ensayo
`supabase/tests/ci/140_whapi_original_bindings_d093.sql`: identidad y grants; inbox privado sintético de un corralón con oferta de cemento + líneas de pallets/bolsones/flete/descuento/total; vínculo a versión, digests, replay idéntico, conflicto de versión/fuente, rollback ante manifest inválido, segunda versión y denegación de UPDATE/DELETE.

## Limitaciones que NO deben ocultarse

**Este incremento incorpora D093 al worker privado D062**: el receptor D061 prepara el manifest desde el texto verificado con AES-GCM, invoca la RPC D093, y no considera registrada una oferta si falla el vínculo fuente/version. La ruta real `/api/integraciones/whapi/cotizaciones` exige este modo; se conserva D060 únicamente como contrato histórico de tests aislados. El LOGIN técnico de escritura D092 pasa a tener **solo el gateway D093**, sin EXECUTE directo de D060. Queda pendiente la vista del comprador capaz de recuperar/desencriptar la fuente **solo con sesión vigente y autorización sobre su ronda**, mostrar TODAS las líneas y literal del total. Para PDF, Word, Excel y fotos, se deben conservar los bytes originales en Storage privado e inmutable; D028 preserva solo el texto cuando el mensaje es text, no adjuntos.

Por lo tanto #339 sigue **ABIERTO**, aunque D093 pase CI; nunca declarar todavía que el comprador ve 100% del presupuesto.

**Sin contacto ni número real, sin Whapi, sin migraciones Supabase DEV por #175, sin Vercel ni producción.**
