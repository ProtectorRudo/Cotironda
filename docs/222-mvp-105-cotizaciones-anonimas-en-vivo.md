# MVP-105 — cotizaciones anónimas en vivo durante la ronda

**02/11/2026 · Issue #421 · desarrollo en rama dependiente de MVP-104.**

## Contrato confirmado del comprador
El arquitecto recibe un enlace privado por WhatsApp. La página se actualiza automáticamente; los presupuestos que llegan **y fueron revisados** aparecen con sus artículos, valores y condiciones, en la plantilla de Cotironda, **sin identidad del proveedor mientras la ronda esté abierta**. Al cerrar la ronda se pueden revelar los datos de hasta dos finalistas, pero solo con reglas de selección seguras, consentimiento vigente y registro de auditoría. Este módulo aún **no implementa la revelación de finalistas**.

## Cambios
- La RPC `cotironda_piloto_tracking_status_mvp091` conserva la validación de enlace aleatorio de 256 bits, hash SHA256, plazo, comprador consentido y revocación. Continúa contando ofertas textuales recibidas y archivos documentales archivados pero pendientes.
- Se permite devolver en estado `waiting` únicamente `anonymous_offers_mvp091.public_text`: texto ya aprobado como proyección sin nombre, teléfono, email ni identificador. **No se expone** `offer_versions.original_quote`, archivos de Storage, JSON de IA ni `supplier_key`. Los enlaces y patrones obvios de contacto en texto aprobado se bloquean conservadoramente.
- Solo se devuelve la revisión exacta más nueva del proveedor: si entrega una revisión pendiente, **la versión aprobada anterior no aparece** hasta que se revise la última. La página no llama al servidor del proveedor.
- El portal `cotironda-piloto-seguimiento` muestra presupuestos anónimos verificados en vivo y continúa actualizando cada 45 segundos; toda descripción entra por `textContent` (no HTML), CSP/no-referrer y token en fragmento. Si se cancela la ronda, no se expone ninguna oferta.
- Ninguna aprobación se genera automáticamente por este cambio. La tabla `anonymous_offers_mvp091` actual requiere publicación revisada de cada versión, por lo que **todavía no está completo el agente autónomo** que el usuario solicitó. Para producir la proyección automáticamente primero falta validar ítems/valores/condiciones contra original y garantizar ausencia de datos comerciales de contacto.

## Verificaciones
- PostgreSQL 17 en `cotironda-piloto`: migraciones MVP-101 a 105 y smoke synthetic; **PASS con ROLLBACK**. Token emitido al comprador a partir de documento, oferta 1 aprobada visible *antes* del cierre, sin `supplier_key` en JSON; token incorrecto rechazado; segunda revisión sin aprobar oculta primera; token revocado niega acceso; ronda cancelada oculta contenido. Ningún WhatsApp real ni dato productivo modificado.
- `tests/unit/mvp105-seguimiento-anonimo-en-vivo.test.mjs`: controla estructura SQL, autorización privada, HTML seguro y anti-replay.
- El PR es borrador; tests CI/portal pendientes de verificación. No publicar ni instalar en producción.

## Próximas puertas para completar el circuito
1. Interpretación realmente flexible de conversaciones y archivos, con seguimiento de contexto sin perder correcciones y sin inventar artículos. Resolver límites técnicos o bloquear sin truncar.
2. Extractor de cotizaciones con cotejo independiente del PDF/foto/planilla original: cada producto, cargo, descuento, impuestos, IVA, flete, condiciones y total, **sin inventar ni recalcular cifras literales**. La suma validada es control adicional, no sustituto.
3. Proyección propia **automática y segura** por ronda, con mapeo técnico y ofertas parciales claras. Precios en vivo anónimos tras revisión automática fiable, con excepción interna cuando haya dudas.
4. Comparación exacta entre equivalentes, separación de cobertura y competitividad, combinación de hasta dos negocios, cierre cuatro días y revelación bilateral registrada y notificada a los dos finalistas. Si no hay dos ofertas comparables, no inventar ganadores.
5. Prueba real completa comprador→dos proveedores→enlace→ofertas→cierre→WhatsApp. Hasta hacerla, no declarar el MVP listo.
