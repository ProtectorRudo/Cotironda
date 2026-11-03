# MVP-103 — conciliación económica determinista de cotizaciones documentales

**02/11/2026 · Issue #416 · Desarrollo únicamente, sin producción ni envíos reales.** Se basa en MVP-101 (espejo original de la transcripción IA) y MVP-102 (concordancia de dos lecturas).

## Valor para el piloto
El corralón puede cotizar artículos pedidos y extras no solicitados: pallets, bolsones, flete, impuestos, descuento, etc. El cálculo secundario debe señalar errores aritméticos sin tocar los importes del comercio. La fuente de verdad sigue siendo el archivo original privado con hash SHA256, y **ninguna concordancia de dos IA certifica que el PDF/foto fue leído íntegramente**.

## Implementación
- `parse_amount_cents_mvp103`: parser monetario SQL puro, aritmética exacta de centavos `bigint`. Acepta `$ 9500`, `$ 9.500,00`, `$ 9,500.00`, `-$ 3.000,00`; rechaza `$ 9.500` como ambiguo (un único separador de tres cifras puede representar miles o decimales). No infiere moneda, IVA, flete incluido ni impuestos.
- `cotironda_piloto_audit_supplier_amounts_mvp103`: exige proveedor, chat, consentimiento, ronda vigente y archivo original SHA256 concordante, recibo MVP-101 y doble lectura MVP-102 con `model_readings_match`. Solo role de servicio. Rechaza repetición o propuesta inválida.
- Calcula exclusivamente **importes literales de líneas** (todos los renglones, incluso extras). Si hay cantidad y precio unitario inequívocos, exige multiplicación exacta. Verifica signo negativo explícito en un descuento; no corrige el descuento. Suma los importes en centavos solo cuando **todos** son inequívocos y compara con TOTAL literal declarado, sin reemplazarlo.
- Guarda en `supplier_amount_checks_mvp103` la diferencia de centavos y estado categórico: `balanced`, `difference`, `needs_review`. El cálculo y total interpretado quedan en esquema privado con RLS e inmutabilidad; la RPC solo devuelve códigos sin precios, identidades ni información personal. No toca `offer_versions`.
- El receptor WhatsApp invoca la auditoría **solo después** de que las dos lecturas de un mismo archivo concuerden; si no, la oferta sigue pendiente, sin segundo mensaje ni nueva inferencia.

## Validación
- `supabase/piloto/mvp103_smoke_rollback.sql`: nueve escenarios sintéticos: suma correcta, total distinto, total ambiguo, precio unitario ambiguo, renglón sin importe, cantidad inválida, multiplicación distinta, signo de descuento incorrecto, ausencia de segunda lectura.
- Incluye cemento, pallets vacíos, bolsones vacíos, flete y descuento. Total literal intencionalmente diferente no altera fuente. Controla centavos, idempotencia, RLS y que no se cree oferta comercial.
- Migraciones MVP-101/102/103 + smoke ejecutados en una única transacción PostgreSQL 17 **de cotironda-piloto**, con `ROLLBACK`, sin instalar tablas ni dejar datos sintéticos. Prueba SQL **PASS**; pruebas Node y CI GitHub deben verificarse aparte.
- Ningún mensaje real Whapi enviado. No se modificaron políticas comerciales, precio original, producción, dominio ni secretos.

## Pendientes que separan este avance del piloto real
1. Cotejar el borrador IA contra el **documento físico original** (OCR/imagen, PDF, hoja/celda) con evidencia suficientemente segura. Aun cuando la suma dé bien, puede faltar un ítem entero en ambas lecturas: eso debe detectarse o conservar la cotización como no verificada.
2. Crear la **plantilla propia Cotironda** con *todos* los conceptos y total literal, con acceso seguro y anonimato. Al comprador solo se le muestra cuando procede según embargo y verificación.
3. Comparar exclusivamente cantidades y materiales técnicamente equivalentes, con IVA/flete/embalajes y descuentos verificables, separado de cobertura parcial. Hasta dos finalistas al cierre bajo reglas de contacto.
4. Ensayo real de arquitecto → proveedor → presupuesto (texto/PDF) → cierre/seguimiento, más documentación de fallback y costos. Los límites técnicos (25 renglones y 3 MiB, PDF de solicitud de 8 renglones) siguen pendientes.

**Advertencia:** estado `balanced` significa solamente *suma de la extracción consistente*. Siempre `source_verified=false`, `ranking_allowed=false`. No se puede publicitar como presupuesto fiel, oferta homologada, precio final comparable ni ganador.
