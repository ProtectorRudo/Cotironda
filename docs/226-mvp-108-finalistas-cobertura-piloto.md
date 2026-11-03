# MVP-108 — primera selección automática de hasta dos alternativas completas (sin precio engañoso)

**02/11/2026 · Issue #427 · desarrollo sobre PR #426, exclusivamente piloto La Plata.** La IA interpreta documentos; la cobertura se calcula en SQL con números y condiciones verificables.

## Criterio de negocio implementado en este módulo
- La ronda tiene que estar **realmente cerrada** y haber alcanzado su `closes_at` inmutable según reloj PostgreSQL. No se puede adelantar la selección editando la fecha.
- Solo son candidatas cotizaciones TXT/CSV con original cotejado y versión anónima publicada por los controles MVP-101 a MVP-107. Se comprueba que sea la **última** cotización enviada por ese proveedor antes del vencimiento. Una revisión más nueva no verificada invalida la anterior.
- La oferta debe cubrir **TODOS** los artículos del pedido. Para cada línea se exige una correspondencia única de descripción/especificación EXACTA, cantidad, unidad homologada y rubro identificado, con importe económico inequívoco. No se presume equivalencia de otras marcas, envases de 25/50 kg o parciales hasta tener un auditor técnico explícito.
- El alcance queda limitado al piloto actual de dos proveedores, localidad La Plata y hasta ocho líneas de pedido. Si ambos cumplen íntegramente, registra `two_complete_alternatives`; si uno solo cumple, registra `one_complete_alternative`. Sin cobertura completa, `no_complete_alternatives`. No compara jamás los totales de proveedores que cotizaron distinta cantidad.
- **No se calcula puesto económico**, ni se afirma que son los dos precios más bajos. Solo se reconocen hasta dos ofertas **completas** con requisitos equivalentes de ítems. Para ranking por menor precio todavía hay que comprobar IVA, flete, pago, fechas, disponibilidad y adicionales comparables. Si hay más de dos ofertas completas indistinguibles, no se elige arbitrariamente.
- La planificación queda en `finalist_coverage_plans_mvp108` privada con RLS, estado inmutable e idempotencia. La RPC devuelve **solo cantidad y estado**, nunca nombres, teléfonos, HMAC de chats, ganador o contactos. Nunca envía WhatsApp; la compra y adjudicación siguen siendo externas a Cotironda.

## Evidencias
- PostgreSQL 17 **real** de Supabase PILOTO: migraciones 101 a 108 + dos rondas sintéticas y cuatro presupuestos: un caso de **ambos proveedores completos** y otro con **uno parcial**. Intento de selección prematura bloqueado, vencimiento con reloj del servidor y cambio de estado sin modificar la fecha, cómputo exacto 2/1, anti-repetición, privacidad y ausencia de `offer_versions` nuevos. **PASS con ROLLBACK**, sin instalar nada.
- El primer ensayo intentó editar `closes_at` y falló por el guard de inmutabilidad de Cotironda. Se corrigió el ensayo: crea la ronda con 96 horas lógicas, espera su vencimiento y cierra sin cambiar esa fecha. Se preservó la protección.
- Unit tests de contrato `tests/unit/mvp108-finalistas-cobertura.test.mjs`. CI de GitHub por comprobar.

## Falta para el circuito completo
1. Resolver extracción fiel automática de PDF/foto/Excel/Word y texto libre de proveedor; no hay todavía garantía universal sobre archivo físico.
2. Convertir las dos alternativas privadas en un ranking económico real cuando se puedan cotejar IVA, flete, descuentos, pago, stock y entregas, y contemplar compras de hasta dos proveedores que juntos cubran el pedido. No inventar orden si faltan condiciones.
3. Capturar y proteger **consentimiento específico para revelar contactos**, vincular teléfonos con identidad real sin guardarlos en texto claro, crear outbox idempotente de finalistas y enviar por WhatsApp con seguimiento de estado incierto.
4. Ensayar tres teléfonos reales desde solicitud hasta cierre/avisos y desplegar la versión autorizada. Este módulo no está listo para producción ni fusionado.
