# ADR 354 — No perder presupuestos de IA Central después de apagar los gates

**Fecha:** 05/11/2026. **Ámbito:** código de desarrollo del PILOTO. #597, #529.

## Fallo en el receptor v52

MVP230 separó correctamente los permisos SQL: crear pedidos se detiene al
vencer la ventana temporal, mientras que el proveedor con invitación,
PDF enviado y aceptación `api_accepted` puede responder durante su ronda.
Pero el receptor `index.ts` seguía decidiendo `centralSupplier` solo
por `cotironda_piloto_ia_is_supplier_mvp226`, cuyo resultado aún depende
de `ai_central_control_mvp226.enabled`. Al apagarse ese control (sin
revocar una ronda ya despachada), `trial.quote_link=true` y el router
heredado decía `not_central_supplier`. El webhook podía clasificar
la respuesta como heredada y omitir el vínculo con el lector IA Central.

## Cambio mínimo MVP232

- `centralSupplier` es verdadero si **alguno** de dos resultados
  PRIVADOS de SQL lo acredita: router existente `central_supplier` o
  permiso `trial.quote_link===true` de MVP230.
- El permiso `quote_link` exige identidad consentida, webhook entrante
  activo, ronda IA preparada y todavía abierta, invitación correspondiente
  y despacho `api_accepted` con tiempo registrado. No es suficiente una
  aceptación `pending`, `leased` o `uncertain`.
- Preserva el comprobador antiguo de IDs de PDF citado para invitaciones
  heredadas; si no corresponde, el camino IA Central intenta asociación
  de manera inequívoca. Ante varias rondas posibles, se abstiene.
- No habilita la creación de rondas, despacho, lectura de PDF/Excel ni
  publicación de precios; los demás controles siguen independientes.

## Pruebas

Unitarias: `reply_only` tras expiración y tras gates OFF;
router previo activo; proveedor sin autorización; strings `"true"`
y valores falsos malformados. Además, compilar Deno/webhook y ejecutar
regresiones de recepción y SQL en CI antes de considerar publicación.
Una prueba en CI NO acredita recepción real de WhatsApp.

## Despliegue

No publicar sobre `cotironda-piloto-whapi` sin CI verde,
prueba de compatibilidad y autorización de publicación. Nunca tocar producción.
El circuito de archivos, continuidad de localidad, cierre y originales
siguen abiertos. No cerrar #597 ni #529.
