# 154 — MVP-034: pegar filas desde Excel sin subir el archivo

31/10/2026 · Issue #281 · rama `feat/mvp-034-pegado-tablas-materiales`.

## Por qué

Para el primer piloto, el comprador ya puede pegar texto y guardar el pedido protegido con D064. Una lista copiada directamente de una planilla de tres columnas llegaba con tabuladores y el formulario obligaba a reescribirla; eso incumple UX-001.

## Alcance exacto

El parser `prepararPedidoTextoMvp028` ahora acepta **texto tabulado pegado en el mismo cuadro**, no archivos XLSX ni CSV genérico. Reconoce dos disposiciones explícitas: `Cantidad | Unidad | Material` y `Material | Cantidad | Unidad`, con un encabezado exacto al principio de la tabla o, sin encabezado, solo cuando la posición de la cantidad es inequívoca. Acepta líneas normales, condiciones independientes de IVA y zona `Entrega en: La Plata` en el mismo pedido.

Un encabezado no cuenta como artículo. Cada descripción se conserva literalmente como `source_description`, con marca, presentación, resistencia, espesor y otros atributos escritos por el comprador; la cantidad se valida con `extraerLinea` y las mismas restricciones de MVP-028. **La clasificación canónica es una familia, no una equivalencia técnica**.

Fila incompleta, separador no admitido, columnas extra, cabecera contradictoria, monto ambiguo, productos desconocidos, fórmula, enlace, número de teléfono o dos productos de la misma familia: la ronda queda retenida y se señala la fila original. No se recortan ni se omiten artículos para conseguir un envío exitoso. Continúan el límite de ocho artículos y la autorización de sesión/JWT/SQL D064.

## No realizado

No se incorporó un botón de subir Excel, Word, PDF, imágenes o CSV; el lector XLSX offline de laboratorio utiliza Node zlib y **no** es un pipeline antivirus/Storage ni debe conectarse directamente al navegador. No se ejecuta ninguna fórmula, IA, Whapi, SQL DEV ni servicio externo para estas filas. No cambia el envío a proveedores ni agrega confirmaciones.

## Pruebas para CI

- `tests/unit/mvp034-filas-excel-pegadas.test.mjs`: ambos órdenes, encabezado exacto y ausente, copia mezclada con texto, CPC Loma Negra y placa RH 12,5, cantidad decimal, IVA, cabecera no válida, columnas extra, campo vacío, fórmulas, URL, número ambiguo, nueve líneas, duplicados y materiales sin identificación.
- `apps/portal/app/mis-rondas/nuevo-pedido-mvp028.tsx` informa que se puede pegar celdas y que no se sube el archivo.
- El build de Next, TypeScript, 1064+ unitarias, PostgreSQL17 y PostgREST del PR deben aprobar antes de integrarlo.

## Gate externo vigente

Supabase DEV mantiene #175: **backup auténtico cifrado y restauración comprobada fuera de DEV pendientes**. No instalar D024+ ni habilitar envíos reales hasta superar el gate. Mantener `main` y el dominio sin publicar.
