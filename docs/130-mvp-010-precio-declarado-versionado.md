# 130 — MVP-010: mostrar el precio que declaró el proveedor, sin inventar IVA

31/10/2026 · Issue [#233](https://github.com/ProtectorRudo/Cotironda/issues/233). **Solo laboratorio PostgreSQL17 CI, no migración ni despliegue en Supabase DEV/prod.**

## Problema de negocio y decisión

Un corralón puede mandar por WhatsApp «20 bolsas de cemento a $121» sin aclarar IVA ni flete. Cotironda debe **registrar el precio de $121 y mostrarlo**, con **«IVA no informado» y «Flete no informado»**, sin tratar ese importe como neto, con IVA incluido o flete sin cargo y sin pedir al proveedor un mensaje extra «Confirmo».

Hasta D059, el contrato `offer_versions_v1.lines_snapshot` guardaba únicamente `net_unit_price` + `vat_rate`. Cuando el IVA era desconocido, `net_unit_price=null` y el comprador podía perder el importe textual original. Este cambio cierra ese hueco sin modificar contratos históricos D026 ni eliminar controles.

## Qué implementa D060 en PG17 efímero

- `supabase/sql/whapi_original_prices_d060.sql` crea **registros inmutables de importes originales por línea y versión**, asociados al inbox D028 y al recibo D059 de la misma cotización. Guarda importe decimal, estado de IVA **incluido, no incluido, no informado o contradictorio**, número de línea y hash de cita de origen; **no guarda mensajes ni teléfonos en claro**.
- `whapi_receive_with_prices_d060` valida cantidades de líneas, coincidencia con la oferta, precio citado y semántica económica antes de invocar D059, que registra versión atómica desde el inbox verificado. El ingreso y la evidencia persisten **juntos en una transacción** o ambos se revierten. Un mensaje repetido con idéntica evidencia responde como repetido; mismo ID con evidencia distinta se rechaza. Correcciones crean nuevas versiones y dejan las anteriores intactas.
- **IVA no informado o contradictorio:** el precio original se conserva, pero el precio neto y la alícuota siguen `null`. **IVA incluido con alícuota explícita:** si se normalizó, el bruto debe recomponerse exactamente; si no, se rechaza la normalización. **IVA no incluido:** el neto coincide con el precio original, sin inventar alícuota.
- `public.buyer_quoted_prices_d060(round_id)` es una función de lectura para el comprador con JWT verificado, sesión activa y pertenencia vigente a la empresa, reutilizando el control de D025. Devuelve **solo la última versión por proveedor**, alias anónimo, línea, precio declarado y condición IVA. No devuelve nombre del corralón, ID de empresa, teléfono, notas personales ni un «total final». Devuelve cero filas para rondas de otras empresas.
- El puerto TypeScript `crearPuertoRecepcionDirectaD059(...).registrarConPrecios(...)` invoca SQL D060 de forma estrictamente parametrizada y falla cerrado. **No crea conexión DB ni endpoint público**. El rol escritor y gateway D060 no tienen login, bypass-RLS ni acceso público.
- Pruebas PG17 bajo `supabase/tests/ci/115_whapi_original_prices_d060.sql` y unitarias `tests/unit/whapi-quoted-price-postgres-d060.test.mjs`. Esperado: sin doble confirmación, cotizaciones parciales y sin IVA, bruto incluido, más IVA, evidencia omitida, manipulación de importe, replay, revisión nueva, aislamiento, membresía suspendida y sesión revocada.

## Lo que **todavía no** resuelve

1. **El broker real debe descifrar el mensaje/adjunto desde el inbox autenticado y verificar que el precio pertenece al artículo antes de construir `quote` y `prices`**. La cita hash almacenada es un rastro de procedencia, no una prueba de que el modelo interpretó bien un PDF o una imagen. No confiar jamás en evidencia calculada desde una entrada directa del navegador o texto IA no validado.
2. Proveedores pueden escribir precio por bulto/caja/bolsa y diferente moneda/unidad; el broker debe mapearlo con el producto y unidad correctos, o mostrarlo como parcial/no comparable. La función compradora de este avance devuelve precio unitario declarado, **no costo total comparable ni IVA/flete supuestos**.
3. SQL D060 está en un archivo aislado de PG17 CI, no en las 12 migraciones iniciales de Supabase. **La salida pública** existe como contrato SQL ensayado, no como web portal publicado. El rol gateway D059 antiguo debe quedar fuera de credenciales de la ruta comercial nueva, que necesitará D060.
4. **Respaldar y restaurar Supabase DEV auténtico** sigue pendiente: [#175](https://github.com/ProtectorRudo/Cotironda/issues/175). No instalar la estructura comercial hasta superar ese gate. Whapi real, adjuntos e IA live todavía no conectados.

**Principio UX inalterable:** el comprador envía la lista y solo se pregunta la zona de entrega si falta; cada comercio recibe materiales y destino; el precio enviado cuenta como cotización recibida y puede corregirse, sin «Confirmo».

## Puente comprobable lectura -> persistencia
`src/server/whapi-quote-source-builder-d060.ts` reutiliza el lector documental MVP-007: verifica que la cita contenga exactamente el monto original y su línea, prepara `quoted_unit_price` + estado IVA + SHA256 de la línea para D060 y convierte el neto solamente si había aclaración y normalización comprobables. La asociación producto/line_no debe provenir del **snapshot privado confiable de la ronda**, nunca de un identificador inyectado desde WhatsApp. Si la cita falta o el importe no coincide, devuelve precio original `null` para ese artículo y no inventa nada. Incluso cuando el comprador exigía IVA incluido y el proveedor cotizó «más IVA», conserva el precio original con aviso de discrepancia sin normalizarlo como conforme. Puerto D060 y constructor están acoplados en tests, **pero todavía no existe el worker real que descifra el mensaje del inbox ni el endpoint de procesamiento**.
