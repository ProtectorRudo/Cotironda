# MVP204 — Condiciones económicas por presupuesto en el seguimiento

**Solo desarrollo** · #529 P0-B2b, P0-C, P0-E; #535, #524, #528.
No se publicó SQL ni Edge, no se enviaron WhatsApps y no se habilitó
ranking, adjudicación, acceso a originales o revelación de contactos.

## Problema real comprobado

El sistema ya tiene lectura documental v9 con SHA, conciliación de descuentos
y condiciones comerciales, y muestra importes de origen por artículo
(MVP186). La pantalla solo enseñaba **contadores globales** de IVA/flete/pago
faltantes (MVP180), sin identificar a qué oferta anónima correspondían.
Así el comprador no podía entender por qué no se establecía un precio final
verificable ni distinguir cobertura con importe de costo final.

Auditoría de solo lectura del PILOTO del 05/11: cuatro registros en el
ledger económico `supplier_economic_facts_mvp168`, **ninguno con
moneda estructuralmente corroborada**. Un símbolo `$` aislado **no**
autoriza decidir ARS ni USD. No cambiamos esa regla.

## Implementación integrada

1. La nueva función pura `resumirCondicionesEconomicasPorOfertaMvp204`
   vuelve a cotejar el contrato v9 por `diagnosticarRondaPrivadaMvp172`.
   Solo acepta el MISMO `private_inputs` del Edge autenticado y la
   proyección `MVP186` cuyos importes fueron relacionados con el texto
   de la oferta habilitada. Nunca correlaciona por posición HMAC.
2. Para **cada** oferta visible y únicamente después del cierre, extrae
   estados categóricos del auditor v167: IVA, flete y pago. Los valores
   quedan en lista de enumeraciones cerradas, sin rutas, identidad,
   originales, importes totales ni posiciones.
3. Recuenta importes respaldados por artículo desde MVP186 y contrasta
   las agregaciones de IVA/flete/pago/stock/neto/plazo/mínimo contra
   la RPC independiente MVP180, que también comprueba enlace y fuentes.
   Ante cualquier divergencia devuelve `null` y deja el resto de las
   ofertas funcionando, **sin mostrar ese panel**.
4. El Edge de seguimiento existente añade el resumen solo después del
   cálculo MVP186 y al cerrar la ronda. Vercel aplica allowlist y
   recalcula los importes por oferta desde sus propios campos blanqueados.
   El navegador repite esos controles y usa exclusivamente `textContent`.
5. Al revocar/cambiar el token, cerrar sesión de enlace o perder conexión,
   el panel se borra junto con el resto de información privada.
   Conserva **TODAS las ofertas**, incluidas las parciales.

## Convención local, sin suposiciones fiscales

- `iva=no_informado`: el importe se interpreta **SIN IVA solo como
  referencia comercial**, nunca como IVA 0% ni como precio fiscal final.
- `flete=no_informado`: no implica flete gratis.
- `stockCorroborado=false`: no significa falta de stock; implica que
  no existe prueba independiente de disponibilidad.
- `moneda=no_acreditada`: no interpretar `$` como ARS ni USD sin fuente.
  Por eso **no hay ranking** ni recomendación económica por esos importes.
- El resultado nunca activa `price_comparable`, `automatic_award`,
  `contacts_revealed` ni `originals_downloadable`.

## Pruebas y pendientes

Regresión real estructural anonimizando 2 rondas, 4 PDFs/XLSX, 10 renglones,
descuentos conciliados, orden público distinto de HMAC, 2 ofertas parciales,
cambios de versión, contacto falso, revocación, contadores inconsistentes,
ronda abierta, fallo de red, estado comercial alterado y UI libre de HTML.

**Pendiente para cerrar P0-B/C/E:** evidencia independiente de moneda,
disponibilidad, mínimos, plazos y flete, equiparación determinista de
unidades por renglón, subtotal comercial de opciones hasta 2 proveedores
en condiciones homogéneas, publicación autorizada y E2E con ronda nueva.
El checklist de los 14 puntos no cambia de estado.
