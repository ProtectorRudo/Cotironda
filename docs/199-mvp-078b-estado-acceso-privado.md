# MVP-078b — Lector privado de ofertas

Objetivo: vincular una revisión exacta del presupuesto original con su fuente, sin revelar identidad ni contacto. Mantener salidas WhatsApp apagadas. Toda consulta debe ser parametrizada y autorizada desde un trabajador de servidor, nunca directamente desde el navegador.

El esquema privado del piloto conserva la cotización original. Antes de conectar el lector se deben auditar los permisos del rol técnico y probar que la consulta de una revisión ajena devuelve rechazo. Las pruebas no deben publicar el texto real.

## Piloto Nahuel
La inscripción de Nahuel todavía está pendiente. Se debe emitir un código fresco desde el SQL Editor del proyecto piloto, compartirlo por un canal privado y esperar que Nahuel envíe `COTI ALTA <codigo>` desde su propio teléfono. Luego podrá cotizar por texto la lista existente de cemento e hidrófugo.

**Sin autorización para producción, sin envíos, sin modificación de presupuestos existentes.**

## 02/11/2026 — puente privado offline implementado
- Nuevo módulo `src/domain/resumen-privado-cotizacion-mvp078b.ts`: recibe un registro **previamente obtenido y autenticado en backend**, más la identidad exacta esperada (solicitud, proveedor, revisión) y las correlaciones de líneas. Rechaza identidades cruzadas, revisiones incorrectas, claves inesperadas o textos inválidos.
- Reutiliza el ledger de MVP-078a, que conserva el texto íntegro y calcula un SHA local. **No existe todavía SHA original independiente persistido en `offer_versions`**: no presentar este SHA local como validación criptográfica frente a modificaciones previas de la fuente. La inmutabilidad de base se sostiene por el trigger de ofertas.
- Retorna una **lista blanca de métricas**: renglones totales, identificados, importes verificables, ambiguos, extras sin clasificar, estado de IVA/flete, total y conciliación. Jamás retorna texto, precios, identificador del pedido, nombre del proveedor, hash ni teléfono. Tampoco habilita ranking, adjudicación, WhatsApp o contactos.
- `tests/unit/mvp078b-resumen-privado-cotizacion.test.mjs`: salidas restringidas, versiones independientes, rechazo de pedido/proveedor cruzados, texto ambiguo, embalaje/flete/descuento y conteo conservador.
- **Límite fundamental:** es un adaptador puro sobre una fuente confiable suministrada por el backend, **NO** un lector SQL instalado. Falta decidir y auditar el puerto de acceso al esquema privado, verificar permisos, consentimiento, autorización por empresa y habilitar una lectura real end-to-end. El comprador no puede invocar el adaptador con datos propios.
- El original no se modifica y la integración Whapi saliente continúa apagada. No afecta DEV histórica, Vercel ni producción.

## Criterios de aceptación para integración posterior
1. Aislamiento por empresa y rol técnico con SELECT mínimo sobre revisión exacta, sin consultas desde navegador ni API pública.
2. Lectura de una versión real sin copiarla a registros, GitHub o mensajes; cotejo de identidad, pedido, versión y procedencia.
3. No escribir cantidades ni importes inferidos sobre el original; rechazar propuestas de ranking si falta cobertura, equivalencia, IVA, flete o condiciones comprobables.
4. Integración bajo PR independiente y pruebas negativas (otro proveedor/pedido, revisión no existente, BAJA, expiración, duplicados y error de base).
